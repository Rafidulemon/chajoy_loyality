import 'server-only';
import { db, type Tx } from '../db';
import { fail } from '../errors';
import { CARD_COLORS, REWARD_ITEMS } from '@/lib/program';
import { programChangeImpact } from '@/lib/domain/rules';
import type { AdminProgramDto, ProgramImpactDto, ProgramSaveResultDto } from '@/lib/contracts/admin';
import type { ProgramSave } from '@/lib/contracts/schemas';
import { writeAudit, type RequestContext } from './audit';
import { issueCardVouchers } from './ledger';
import { getProgram, toProgramDto } from './program';

const TX_OPTIONS = { maxWait: 10_000, timeout: 60_000 } as const;

/** Whether the offers that the program page switches (birthday treat, double-stamp day) are live. Null when none exists any more. */
async function switchedOffers(tx: Tx): Promise<{ birthdayOn: boolean | null; doubleStampOn: boolean | null }> {
  // One query (it also runs inside the save transaction, which has a single connection).
  const rows = await tx.offer.findMany({ where: { kind: { in: ['BIRTHDAY', 'DOUBLE'] }, deletedAt: null }, orderBy: { createdAt: 'asc' }, select: { kind: true, status: true } });
  const birthday = rows.find((o) => o.kind === 'BIRTHDAY');
  const double = rows.find((o) => o.kind === 'DOUBLE');
  return { birthdayOn: birthday ? birthday.status === 'LIVE' : null, doubleStampOn: double ? double.status === 'LIVE' : null };
}

export async function getAdminProgram(tx: Tx): Promise<AdminProgramDto> {
  const [program, switches] = await Promise.all([getProgram(tx), switchedOffers(tx)]);
  return { program: toProgramDto(program), ...switches };
}

/** MG-09: what saving a card of `total` stamps would do right now, so the screen can warn before it happens (BR-13). */
export async function previewProgramImpact(tx: Tx, total: number): Promise<ProgramImpactDto> {
  const cards = await tx.card.findMany({ where: { stamps: { gte: total }, customer: { deletedAt: null } }, select: { stamps: true } });
  return programChangeImpact(cards.map((c) => c.stamps), total);
}

/**
 * MG-08, MG-09, BR-12 to BR-15: save the program for every customer and outlet at once.
 *
 * - One transaction holds a lock on the program row, so two editors cannot save at the same moment; the editor that
 *   started from an older version gets a 409 and sees what changed, instead of silently overwriting it.
 * - Lowering the stamps per card completes the cards of customers who already have enough: each gets a voucher for every
 *   full card, with the stamps used up recorded on it, so every counter still matches the ledger.
 * - Raising it changes nobody (BR-13). Vouchers already issued keep their own title and items (BR-14).
 * - The new limits apply from the next transaction (BR-15), because stamping reads the program when it runs.
 */
export async function saveProgram(input: { patch: ProgramSave; ctx: RequestContext; at?: Date }): Promise<ProgramSaveResultDto> {
  const { patch, ctx } = input;
  const at = input.at ?? new Date();

  const unknownItems = patch.items.filter((id) => !REWARD_ITEMS.some((i) => i.id === id));
  if (unknownItems.length) throw fail.validation({ issues: [{ path: 'items', message: `Unknown reward item: ${unknownItems.join(', ')}` }] });
  if (!CARD_COLORS.some((c) => c.id === patch.color)) throw fail.validation({ issues: [{ path: 'color', message: 'Unknown card colour' }] });
  // Keep the catalogue order and no duplicates, so what is stored does not depend on the order the screen sent.
  const items = REWARD_ITEMS.map((i) => i.id).filter((id) => patch.items.includes(id));

  return db().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "version" FROM "Program" WHERE "id" = 1 FOR UPDATE`;
    const before = await getProgram(tx);
    if (patch.version !== before.version) {
      throw fail.conflict('VERSION_CONFLICT', 'The program was changed by someone else. Reload to see the latest and try again', { current: toProgramDto(before) });
    }

    const after = await tx.program.update({
      where: { id: 1 },
      data: {
        nameBn: patch.name.bn,
        nameEn: patch.name.en,
        stampsRequired: patch.total,
        rewardItems: items,
        minPurchase: patch.minPurchase,
        dailyLimit: patch.dailyLimit,
        expiryDays: patch.expiryDays,
        welcomeBonus: patch.welcome,
        cardColor: patch.color,
        version: { increment: 1 },
        updatedById: ctx.actor.type === 'STAFF' ? ctx.actor.id : null,
      },
    });

    // BR-13: a smaller card completes the cards that already hold enough stamps. Cards are locked in id order, which is also
    // the order any other bulk operation would take them, so two bulk operations cannot wait on each other.
    const completed: ProgramImpactDto = { cards: 0, vouchers: 0 };
    if (after.stampsRequired < before.stampsRequired) {
      const full = await tx.$queryRaw<{ id: string; customerId: string; stamps: number }[]>`
        SELECT c."id", c."customerId", c."stamps" FROM "Card" c
        JOIN "Customer" u ON u."id" = c."customerId"
        WHERE c."stamps" >= ${after.stampsRequired} AND u."deletedAt" IS NULL
        ORDER BY c."id" FOR UPDATE OF c`;
      for (const card of full) {
        const times = Math.floor(card.stamps / after.stampsRequired);
        const vouchers = await issueCardVouchers(tx, { customerId: card.customerId, program: after, times, triggerEntryId: null, at });
        await tx.card.update({
          where: { id: card.id },
          data: { stamps: card.stamps - times * after.stampsRequired, rewardsEarned: { increment: times }, version: { increment: 1 } },
        });
        completed.cards += 1;
        completed.vouchers += vouchers.length;
      }
    }

    // MG-10: the birthday and double-stamp switches turn the matching offers on or off with the program.
    if (patch.birthdayOn !== undefined) await tx.offer.updateMany({ where: { kind: 'BIRTHDAY', deletedAt: null }, data: { status: patch.birthdayOn ? 'LIVE' : 'PAUSED' } });
    if (patch.doubleStampOn !== undefined) await tx.offer.updateMany({ where: { kind: 'DOUBLE', deletedAt: null }, data: { status: patch.doubleStampOn ? 'LIVE' : 'PAUSED' } });

    await writeAudit(tx, ctx, {
      action: 'program.update',
      entityType: 'Program',
      entityId: '1',
      before: toProgramDto(before),
      after: { ...toProgramDto(after), completedCards: completed.cards, vouchersIssued: completed.vouchers },
      at,
    });

    return { program: toProgramDto(after), completed, ...(await switchedOffers(tx)) };
  }, TX_OPTIONS);
}
