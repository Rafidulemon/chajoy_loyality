import 'server-only';
import { db, Prisma, type Tx } from '../db';
import { fail } from '../errors';
import { log, errorFields, maskPhone } from '../log';
import { smsProvider } from '../sms';
import { smsInfo } from '@/lib/domain/sms';
import { dhakaDayKey, isBirthdayWeek } from '@/lib/domain/time';
import type { SmsAudience, SmsCampaignStatus } from '@/generated/prisma/enums';
import type { SmsAudienceDto, SmsCampaignDto, SmsOverviewDto } from '@/lib/contracts/admin';
import type { SmsCampaignCreate } from '@/lib/contracts/schemas';
import { writeAudit, type RequestContext } from './audit';
import { lapsedWhere, readyWhere } from './admin-customers';

/**
 * SMS campaigns (MG-15, MG-16, BR-22 to BR-24).
 *
 * - Only customers who agreed to offer SMS are ever messaged (BR-22).
 * - SMS needed = recipients x parts, parts counted by the same function the screen shows (BR-23).
 * - A campaign is refused when the balance is lower than the SMS needed (BR-24).
 * - Sending works through a queue (one SmsMessage row per recipient), in batches, so a large campaign never has to finish inside one request.
 */

const BALANCE_KEY = 'sms.balance';
const AUDIENCE: Record<SmsAudienceDto, SmsAudience> = { all: 'ALL', lapsed: 'LAPSED', 'reward-ready': 'REWARD_READY', 'birthday-week': 'BIRTHDAY_WEEK' };
const AUDIENCE_DTO: Record<SmsAudience, SmsAudienceDto> = { ALL: 'all', LAPSED: 'lapsed', REWARD_READY: 'reward-ready', BIRTHDAY_WEEK: 'birthday-week' };
const STATUS_DTO: Record<SmsCampaignStatus, SmsCampaignDto['status']> = { DRAFT: 'draft', SCHEDULED: 'scheduled', SENDING: 'sending', SENT: 'sent', FAILED: 'failed' };

type Recipient = { id: string; phone: string };

/** Customers who agreed to offer SMS and belong to the audience, as of `now`. */
export async function audienceRecipients(tx: Tx, audience: SmsAudience, now: Date): Promise<Recipient[]> {
  const base: Prisma.CustomerWhereInput = { deletedAt: null, smsConsent: true };
  const select = { id: true, phone: true } as const;
  switch (audience) {
    case 'ALL':
      return tx.customer.findMany({ where: base, select });
    case 'LAPSED':
      return tx.customer.findMany({ where: { AND: [base, lapsedWhere(now)] }, select });
    case 'REWARD_READY':
      return tx.customer.findMany({ where: { AND: [base, readyWhere(now)] }, select });
    case 'BIRTHDAY_WEEK': {
      const withBirthday = await tx.customer.findMany({ where: { ...base, birthday: { not: null } }, select: { ...select, birthday: true } });
      return withBirthday.filter((c) => isBirthdayWeek(c.birthday!, now)).map(({ id, phone }) => ({ id, phone }));
    }
  }
}

async function readBalance(tx: Tx): Promise<number> {
  const row = await tx.setting.findUnique({ where: { key: BALANCE_KEY } });
  return typeof row?.value === 'number' ? row.value : 0;
}

async function toCampaignDtos(tx: Tx, campaigns: { id: string }[]): Promise<Map<string, Pick<SmsCampaignDto, 'sent' | 'failed' | 'cameBack'>>> {
  const out = new Map<string, Pick<SmsCampaignDto, 'sent' | 'failed' | 'cameBack'>>();
  if (!campaigns.length) return out;
  const ids = campaigns.map((c) => c.id);
  const [counts, cameBack] = await Promise.all([
    tx.smsMessage.groupBy({ by: ['campaignId', 'status'], where: { campaignId: { in: ids } }, _count: { _all: true } }),
    tx.$queryRaw<{ id: string; n: number }[]>(Prisma.sql`
      SELECT c."id" AS "id", COUNT(DISTINCT m."customerId")::int AS "n"
      FROM "SmsCampaign" c
      JOIN "SmsMessage" m ON m."campaignId" = c."id" AND m."status" = 'SENT'
      JOIN "Visit" v ON v."customerId" = m."customerId" AND v."createdAt" >= c."sentAt" AND v."createdAt" < c."sentAt" + interval '7 days'
      WHERE c."id" IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) AND c."sentAt" IS NOT NULL
      GROUP BY c."id"`),
  ]);
  for (const id of ids) {
    const mine = counts.filter((c) => c.campaignId === id);
    out.set(id, {
      sent: mine.find((c) => c.status === 'SENT')?._count._all ?? 0,
      failed: mine.find((c) => c.status === 'FAILED')?._count._all ?? 0,
      cameBack: cameBack.find((c) => c.id === id)?.n ?? 0,
    });
  }
  return out;
}

async function campaignDtos(tx: Tx, where: Prisma.SmsCampaignWhereInput, take?: number): Promise<SmsCampaignDto[]> {
  const rows = await tx.smsCampaign.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take });
  const stats = await toCampaignDtos(tx, rows);
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    audience: AUDIENCE_DTO[c.audience],
    message: c.message,
    unicode: c.unicode,
    parts: c.parts,
    recipients: c.recipients,
    smsNeeded: c.recipients * c.parts,
    status: STATUS_DTO[c.status],
    scheduledAt: c.scheduledAt?.toISOString() ?? null,
    sentAt: c.sentAt?.toISOString() ?? null,
    sent: stats.get(c.id)?.sent ?? 0,
    failed: stats.get(c.id)?.failed ?? 0,
    cameBack: stats.get(c.id)?.cameBack ?? 0,
    createdAt: c.createdAt.toISOString(),
  }));
}

export async function smsOverview(tx: Tx, now: Date): Promise<SmsOverviewDto> {
  const monthStart = new Date(`${dhakaDayKey(now).slice(0, 8)}01T00:00:00+06:00`);
  const [balance, used, campaigns, all, lapsed, ready, birthday] = await Promise.all([
    readBalance(tx),
    tx.$queryRaw<{ n: number }[]>`SELECT COALESCE(SUM(c."parts"), 0)::int AS n FROM "SmsMessage" m JOIN "SmsCampaign" c ON c."id" = m."campaignId" WHERE m."status" = 'SENT' AND m."sentAt" >= ${monthStart}`,
    campaignDtos(tx, {}, 12),
    audienceRecipients(tx, 'ALL', now),
    audienceRecipients(tx, 'LAPSED', now),
    audienceRecipients(tx, 'REWARD_READY', now),
    audienceRecipients(tx, 'BIRTHDAY_WEEK', now),
  ]);
  return {
    balance,
    usedThisMonth: used[0]?.n ?? 0,
    audiences: { all: all.length, lapsed: lapsed.length, 'reward-ready': ready.length, 'birthday-week': birthday.length },
    campaigns,
  };
}

/**
 * Creates a campaign: works out who gets it, checks the balance (BR-24), and queues one message per person. A campaign with no
 * time set is sent straight away; one with a time waits for `processDueCampaigns`.
 */
export async function createCampaign(input: { data: SmsCampaignCreate; ctx: RequestContext; now?: Date }): Promise<SmsCampaignDto> {
  const now = input.now ?? new Date();
  const { data } = input;
  const info = smsInfo(data.message);
  const audience = AUDIENCE[data.audience];
  const scheduledAt = data.scheduledAt ? new Date(data.scheduledAt) : null;
  if (scheduledAt && scheduledAt.getTime() <= now.getTime()) throw fail.validation({ issues: [{ path: 'scheduledAt', message: 'Pick a time in the future, or send now' }] });

  const id = await db().$transaction(async (tx) => {
    const recipients = await audienceRecipients(tx, audience, now);
    if (!recipients.length) throw fail.unprocessable('NO_RECIPIENTS', 'Nobody in this group has agreed to receive offer SMS');
    const needed = recipients.length * info.parts;
    const balance = await readBalance(tx);
    if (needed > balance) throw fail.conflict('SMS_BALANCE_LOW', `You have ${balance} SMS but this needs ${needed}`, { balance, needed });

    const campaign = await tx.smsCampaign.create({
      data: {
        name: data.name,
        audience,
        message: data.message,
        unicode: info.unicode,
        parts: info.parts,
        recipients: recipients.length,
        status: scheduledAt ? 'SCHEDULED' : 'SENDING',
        scheduledAt,
        offerId: data.offerId ?? null,
        createdById: input.ctx.actor.id,
      },
    });
    await tx.smsMessage.createMany({ data: recipients.map((r) => ({ campaignId: campaign.id, customerId: r.id })) });
    await writeAudit(tx, input.ctx, { action: 'sms.create', entityType: 'SmsCampaign', entityId: campaign.id, after: { audience: data.audience, recipients: recipients.length, parts: info.parts, scheduledAt: scheduledAt?.toISOString() ?? null }, at: now });
    return campaign.id;
  }, { timeout: 60_000 });

  if (!scheduledAt) return processCampaign(id, { now });
  return (await campaignDtos(db(), { id }))[0];
}

/** Takes the SMS the gateway accepted off the balance. Never goes below 0. */
async function spend(sms: number) {
  if (sms <= 0) return;
  await db().$executeRaw`UPDATE "Setting" SET "value" = to_jsonb(GREATEST(COALESCE(("value" #>> '{}')::int, 0) - ${sms}, 0)), "updatedAt" = now() WHERE "key" = ${BALANCE_KEY}`;
}

/**
 * Sends the queued messages of a campaign, 10 at a time, until none are left or the time budget is used up. A campaign that is
 * not finished stays SENDING and the next call (or the scheduled job) carries on, so nothing is sent twice: a message is
 * only picked while it is QUEUED and is marked SENT or FAILED as soon as the gateway answers.
 */
export async function processCampaign(campaignId: string, opts: { now?: Date; budgetMs?: number } = {}): Promise<SmsCampaignDto> {
  const started = Date.now();
  const budget = opts.budgetMs ?? 20_000;
  const campaign = await db().smsCampaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (campaign.status !== 'SENDING' && campaign.status !== 'SCHEDULED') return (await campaignDtos(db(), { id: campaignId }))[0];
  if (campaign.status === 'SCHEDULED') await db().smsCampaign.update({ where: { id: campaignId }, data: { status: 'SENDING' } });

  const provider = smsProvider();
  let spent = 0;
  while (Date.now() - started < budget) {
    const batch = await db().smsMessage.findMany({ where: { campaignId, status: 'QUEUED' }, take: 10, include: { customer: { select: { phone: true } } } });
    if (!batch.length) break;
    await Promise.all(
      batch.map(async (m) => {
        // Claim the message first: only one worker can flip it from QUEUED, so a second worker never sends it again.
        const claimed = await db().smsMessage.updateMany({ where: { id: m.id, status: 'QUEUED' }, data: { status: 'SENT', sentAt: new Date() } });
        if (claimed.count === 0) return;
        try {
          const { id } = await provider.send(m.customer.phone, campaign.message);
          await db().smsMessage.update({ where: { id: m.id }, data: { providerMessageId: id } });
          spent += campaign.parts;
        } catch (e) {
          log.warn('sms.send_failed', { to: maskPhone(m.customer.phone), ...errorFields(e) });
          await db().smsMessage.update({ where: { id: m.id }, data: { status: 'FAILED', error: (e instanceof Error ? e.message : String(e)).slice(0, 200), sentAt: null } });
        }
      }),
    );
  }
  await spend(spent);

  const left = await db().smsMessage.count({ where: { campaignId, status: 'QUEUED' } });
  if (left === 0) {
    const sent = await db().smsMessage.count({ where: { campaignId, status: 'SENT' } });
    await db().smsCampaign.update({ where: { id: campaignId }, data: { status: sent > 0 ? 'SENT' : 'FAILED', sentAt: opts.now ?? new Date() } });
  }
  return (await campaignDtos(db(), { id: campaignId }))[0];
}

/** For the scheduled job: sends campaigns whose time has come and finishes any that were left half sent. */
export async function processDueCampaigns(now = new Date()): Promise<number> {
  const due = await db().smsCampaign.findMany({ where: { OR: [{ status: 'SENDING' }, { status: 'SCHEDULED', scheduledAt: { lte: now } }] }, select: { id: true }, take: 5 });
  for (const c of due) await processCampaign(c.id, { now });
  return due.length;
}
