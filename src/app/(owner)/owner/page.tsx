'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Check, Plus, RefreshCw, Star, Tag, UserRound } from 'lucide-react';
import { LoadError, Skeleton } from '@/components/owner-feedback';
import { OwnerHeader } from '@/components/owner-header';
import { Badge, ButtonLink, Card, CardTitle, IconChip, type Tone } from '@/components/ui';
import { dayOf, useAdminBranches, useAdminDashboard, useCan, weekdayOf } from '@/lib/api/admin-customers';
import { toFeedLine } from '@/lib/api/adapters';
import { useProgram } from '@/lib/api/program';
import { useSession } from '@/lib/api/session';
import type { DashboardDto } from '@/lib/contracts/admin';
import type { ActivityType } from '@/lib/data';
import { avatarColor, initialOf } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { REWARD_ITEMS } from '@/lib/program';

const ACTIVITY_TONE: Record<ActivityType, Tone> = { stamp: 'brand', reward: 'rose', join: 'ok' };

/** The colour a reward item already has in the program catalogue (its chip), so a bar matches the item it stands for. */
const rewardColor = (id: string) => REWARD_ITEMS.find((i) => i.id === id)?.chip ?? 'var(--brand)';

function DashboardSkeleton() {
  const { tx } = useI18n();
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-[22px]">
      <span className="sr-only">{tx('লোড হচ্ছে…', 'Loading…')}</span>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[118px] rounded-card" />)}
      </div>
      <div className="flex flex-wrap gap-4">
        <Skeleton className="h-[320px] min-w-0 flex-[999_1_440px] rounded-card" />
        <Skeleton className="h-[320px] min-w-0 flex-[1_1_300px] rounded-card" />
      </div>
      <div className="flex flex-wrap gap-4">
        <Skeleton className="h-[360px] min-w-0 flex-[999_1_440px] rounded-card" />
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <Skeleton className="h-40 rounded-card" />
          <Skeleton className="h-28 rounded-card" />
          <Skeleton className="h-28 rounded-card" />
        </div>
      </div>
    </div>
  );
}

function Overview({ d, canEditProgram }: { d: DashboardDto; canEditProgram: boolean }) {
  const { tx, l, n } = useI18n();
  const shop = useProgram();
  const { program } = shop;
  const t = d.totals;

  const feed = useMemo(() => {
    const now = Date.now();
    return d.recent.map((f) => ({ f, line: toFeedLine(f, now) }));
  }, [d.recent]);

  // The change in stamps against the 30 days before. With nothing before, there is no percentage to give, so say that.
  let stampsNote: string;
  if (t.stampsPrevious <= 0) {
    stampsNote = tx('আগের ৩০ দিনে কোনো Stamp ছিল না', 'No stamps in the previous 30 days');
  } else {
    const pct = Math.round(((t.stamps - t.stampsPrevious) / t.stampsPrevious) * 100);
    const sign = pct > 0 ? '+' : '−';
    stampsNote = pct === 0 ? tx('আগের ৩০ দিনের সমান', 'Same as the previous 30 days') : tx(`${sign}${n(Math.abs(pct))}% আগের ৩০ দিনের তুলনায়`, `${sign}${Math.abs(pct)}% vs previous 30 days`);
  }

  const kpis = [
    {
      label: tx('মোট গ্রাহক', 'Total customers'),
      value: n(t.customers),
      note: t.newCustomers > 0 ? tx(`গত ৩০ দিনে +${n(t.newCustomers)}`, `+${n(t.newCustomers)} in the last 30 days`) : tx('গত ৩০ দিনে কেউ যোগ দেননি', 'No new customers in the last 30 days'),
      bg: 'var(--brand-soft)',
      chip: '#97C334',
      chipFg: '#171717',
      Icon: UserRound,
    },
    { label: tx('দেওয়া Stamp', 'Stamps given'), value: n(t.stamps), note: stampsNote, bg: 'var(--tangerine-soft)', chip: '#F5D900', chipFg: '#171717', Icon: Check },
    { label: tx('রিডিম হওয়া Reward', 'Rewards redeemed'), value: n(t.rewardsRedeemed), note: tx('গত ৩০ দিনে', 'In the last 30 days'), bg: 'var(--rose-soft)', chip: '#FF5D73', chipFg: '#171717', Icon: Star },
    {
      label: tx('ফিরে আসার হার', 'Return rate'),
      value: t.activeMembers === 0 ? '—' : `${n(Math.round(t.returnRate * 100))}%`,
      note: tx('৩০ দিনে ২+ বার এসেছেন', 'Came back 2+ times in 30 days'),
      bg: 'var(--aqua-soft)',
      chip: '#2EC4B6',
      chipFg: '#08261E',
      Icon: RefreshCw,
    },
  ];

  const visits = d.weeklyVisits;
  const maxVisits = Math.max(1, ...visits.map((v) => v.visits));
  const topReward = Math.max(1, ...d.popularRewards.map((r) => r.count));
  const sms = d.sms;
  const smsPool = sms.balance + sms.usedThisMonth;

  return (
    <>
      <section aria-label={tx('মূল পরিসংখ্যান', 'Key numbers')} className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
        {kpis.map(({ label, value, note, bg, chip, chipFg, Icon }) => (
          <div key={label} className="flex flex-col gap-1 rounded-card px-5 py-[18px]" style={{ background: bg }}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-muted">{label}</span>
              <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[11px]" style={{ background: chip, color: chipFg }}><Icon size={17} strokeWidth={2.4} aria-hidden="true" /></span>
            </div>
            <span className="font-display text-4xl font-bold leading-tight">{value}</span>
            <span className="text-[13px] font-bold text-muted">{note}</span>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap gap-4">
        <Card className="min-w-0 flex-[999_1_440px]">
          <CardTitle>{tx('দৈনিক ভিজিট · গত ৭ দিন', 'Daily visits · Last 7 days')}</CardTitle>
          <div
            className="mt-5 flex h-[220px] items-end gap-[clamp(6px,1.5vw,14px)] border-b border-line pb-1"
            role="img"
            aria-label={`${tx('গত ৭ দিনের দৈনিক ভিজিট', 'Daily visits in the last 7 days')}: ${visits.map((v) => `${l(weekdayOf(v.day))} ${n(v.visits)}`).join(', ')}`}
          >
            {visits.map((v, i) => (
              <div key={v.day} title={`${l(weekdayOf(v.day))}, ${l(dayOf(v.day))}`} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                <span className="text-[13px] font-bold">{n(v.visits)}</span>
                <div
                  className={cn('w-full max-w-14 rounded-t-xl rounded-b-sm', v.visits === 0 ? 'bg-line2' : i === visits.length - 1 ? 'bg-rose' : 'bg-brand')}
                  style={{ height: v.visits === 0 ? '4px' : `${Math.max(6, (v.visits / maxVisits) * 170)}px` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-[clamp(6px,1.5vw,14px)]">
            {visits.map((v) => <span key={v.day} className="min-w-0 flex-1 text-center text-[13px] text-muted">{l(weekdayOf(v.day))}</span>)}
          </div>
        </Card>

        <Card className="flex min-w-0 flex-[1_1_300px] flex-col gap-3.5">
          <div className="flex items-center justify-between gap-2"><h2 className="text-lg font-bold">{tx('চলমান প্রোগ্রাম', 'Active program')}</h2><Badge tone="solidAqua">{tx('চালু', 'Live')}</Badge></div>
          <div className="relative overflow-hidden rounded-[18px] p-4" style={{ background: shop.color, color: shop.fg }}>
            <span aria-hidden="true" className="absolute -right-8 -top-8 size-[100px] rounded-full" style={{ background: shop.deco1 }} />
            <p className="relative pr-12 font-display text-lg font-bold">{tx(`${n(shop.total)}টি Stamp = ${shop.reward.bn}`, `${shop.total} stamps = ${shop.reward.en}`)}</p>
            <div className="relative mt-3 grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(shop.total, 10)}, minmax(0, 1fr))` }}>
              {Array.from({ length: shop.total }, (_, i) => {
                const last = i === shop.total - 1;
                const filled = i < Math.ceil(shop.total / 2);
                return <span key={i} className={`aspect-square rounded-full ${last ? 'bg-white' : filled ? '' : 'border-2 border-dashed'}`} style={!last && filled ? { background: shop.stampBg } : !last ? { borderColor: shop.dash } : undefined} />;
              })}
            </div>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="text-muted">{tx('ন্যূনতম কেনাকাটা', 'Minimum purchase')}</dt><dd className="text-right font-bold">৳{n(program.minPurchase)}</dd>
            <dt className="text-muted">{tx('প্রতি দিনে', 'Per day')}</dt><dd className="text-right font-bold">{program.dailyLimit === 0 ? tx('সীমা নেই', 'No limit') : tx(`সর্বোচ্চ ${n(program.dailyLimit)}টি Stamp`, `Max ${program.dailyLimit} stamp${program.dailyLimit > 1 ? 's' : ''}`)}</dd>
            <dt className="text-muted">{tx('Stamp-এর মেয়াদ', 'Stamp expiry')}</dt><dd className="text-right font-bold">{program.expiryDays === 0 ? tx('কখনো না', 'Never') : tx(`${n(program.expiryDays)} দিন`, `${program.expiryDays} days`)}</dd>
            <dt className="text-muted">{tx('সক্রিয় কার্ড (৩০ দিন)', 'Active cards (30 days)')}</dt><dd className="text-right font-bold">{n(t.activeMembers)}</dd>
          </dl>
          <ButtonLink href="/owner/program" variant="secondary" size="sm" className="mt-auto">{canEditProgram ? tx('প্রোগ্রাম এডিট করুন', 'Edit program') : tx('প্রোগ্রাম দেখুন', 'View program')}</ButtonLink>
        </Card>
      </div>

      <div className="flex flex-wrap gap-4">
        <Card className="min-w-0 flex-[999_1_440px]">
          <CardTitle action={<Link href="/owner/customers" className="text-sm font-bold">{tx('সব দেখুন', 'See all')}</Link>}>{tx('সাম্প্রতিক কার্যকলাপ', 'Recent activity')}</CardTitle>
          {feed.length === 0 ? (
            <p className="py-8 text-center text-muted">{tx('গত ৩০ দিনে কোনো কার্যকলাপ নেই।', 'No activity in the last 30 days.')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] border-collapse text-sm">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="border-b border-line px-2 py-2.5 font-semibold">{tx('গ্রাহক', 'Customer')}</th>
                    <th className="border-b border-line px-2 py-2.5 font-semibold">{tx('কার্যকলাপ', 'Activity')}</th>
                    <th className="border-b border-line px-2 py-2.5 font-semibold">{tx('স্টাফ', 'Staff')}</th>
                    <th className="border-b border-line px-2 py-2.5 text-right font-semibold">{tx('সময়', 'Time')}</th>
                  </tr>
                </thead>
                <tbody>
                  {feed.map(({ f, line }) => (
                    <tr key={line.id}>
                      <td className="border-b border-line px-2 py-3">
                        <Link href={`/owner/customers/${line.customerId}`} className="flex items-center gap-2.5 text-ink">
                          <IconChip color={avatarColor(line.customerId)} size={34} className="rounded-xl">{l(initialOf(f.customer.name))}</IconChip>
                          <span className="min-w-0">
                            <span className="block font-bold">{l(line.customerName)}</span>
                            {f.branch && <span className="block text-[13px] text-muted">{l(f.branch)}</span>}
                          </span>
                        </Link>
                      </td>
                      <td className="border-b border-line px-2 py-3"><Badge wrap tone={ACTIVITY_TONE[line.type]}>{l(line.action)}</Badge></td>
                      <td className="border-b border-line px-2 py-3">{l(line.staff)}</td>
                      <td className="whitespace-nowrap border-b border-line px-2 py-3 text-right text-muted">{l(line.time)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <Card className="flex flex-col gap-3.5">
            <div><h2 className="text-lg font-bold">{tx('জনপ্রিয় Reward', 'Popular rewards')}</h2><p className="text-[13px] text-muted">{tx('গ্রাহকরা কোন ফ্রি আইটেম সবচেয়ে বেশি বেছে নেন', 'Which free items customers choose most')}</p></div>
            {d.popularRewards.length === 0 ? (
              <p className="text-sm text-muted">{tx('গত ৩০ দিনে কোনো Reward নেওয়া হয়নি।', 'No rewards were redeemed in the last 30 days.')}</p>
            ) : (
              d.popularRewards.map((r) => (
                <div key={r.id} className="flex flex-col gap-1.5">
                  <div className="flex justify-between gap-2 text-sm"><span className="font-bold">{l(r.name)}</span><span className="font-semibold text-muted">{tx(`${n(r.count)} বার`, `${n(r.count)} ${r.count === 1 ? 'time' : 'times'}`)}</span></div>
                  <div className="h-3 overflow-hidden rounded-full bg-surface2"><div className="h-3 rounded-full" style={{ width: `${(r.count / topReward) * 100}%`, background: rewardColor(r.id) }} /></div>
                </div>
              ))
            )}
          </Card>
          <section aria-label={tx('SMS ব্যবহার', 'SMS usage')} className="flex flex-col gap-2.5 rounded-card bg-sky-soft p-5">
            <div className="flex items-baseline justify-between gap-2"><h2 className="text-lg font-bold">{tx('SMS ব্যবহার', 'SMS usage')}</h2><span className="font-extrabold text-info">{tx(`${n(sms.balance)}টি বাকি`, `${n(sms.balance)} left`)}</span></div>
            <div className="h-3 overflow-hidden rounded-full bg-surface"><div className="h-3 rounded-full bg-sky" style={{ width: `${smsPool > 0 ? (sms.usedThisMonth / smsPool) * 100 : 0}%` }} /></div>
            <p className="text-[13px] text-muted">{tx(`এই মাসে ${n(sms.usedThisMonth)}টি SMS ব্যবহার হয়েছে`, `${n(sms.usedThisMonth)} SMS used this month`)}</p>
          </section>
          <Card className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2"><h2 className="text-lg font-bold">{tx('অফার', 'Offers')}</h2><Link href="/owner/offers" className="text-sm font-bold">{tx('পরিচালনা', 'Manage')}</Link></div>
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-brand text-brand-on"><Tag size={22} aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{tx(`${n(d.offers.live)}টি অফার চালু`, `${n(d.offers.live)} live offer${d.offers.live === 1 ? '' : 's'}`)}</span>
                <span className="block text-[13px] text-muted">
                  {tx(`এ পর্যন্ত ${n(d.offers.claims)}টি নেওয়া হয়েছে`, `${n(d.offers.claims)} claimed so far`)}
                  {d.offers.paused > 0 && tx(` · ${n(d.offers.paused)}টি বন্ধ রাখা`, ` · ${n(d.offers.paused)} paused`)}
                </span>
              </span>
            </div>
          </Card>
          <Card className="flex flex-col gap-3">
            <h2 className="text-lg font-bold">{tx('সেরা গ্রাহক', 'Top customers')}</h2>
            {d.topCustomers.length === 0 && <p className="text-sm text-muted">{tx('এখনো কোনো গ্রাহক নেই।', 'No customers yet.')}</p>}
            {d.topCustomers.map((c, i) => (
              <Link key={c.id} href={`/owner/customers/${c.id}`} className="flex items-center gap-3 text-ink">
                <IconChip color={avatarColor(c.id)} size={42}>{l(initialOf(c.name))}</IconChip>
                <span className="min-w-0 flex-1"><span className="block truncate font-bold">{c.name ?? tx('গ্রাহক', 'Customer')}</span><span className="block text-[13px] text-muted">{tx(`${n(c.visits)} ভিজিট`, `${n(c.visits)} ${c.visits === 1 ? 'visit' : 'visits'}`)}</span></span>
                <span className="font-display text-xl font-extrabold text-muted">#{n(i + 1)}</span>
              </Link>
            ))}
          </Card>
        </div>
      </div>
    </>
  );
}

export default function DashboardPage() {
  const { tx, n } = useI18n();
  const { staff } = useSession();
  const can = useCan();
  const isOwner = staff?.role === 'owner';
  const { dashboard, error, reload } = useAdminDashboard();
  // Only an owner's numbers cover every outlet, so only the owner needs the outlet count (a manager's cover their own).
  const { branches } = useAdminBranches(isOwner);
  const outlets = branches.filter((b) => b.active).length;

  const scope = isOwner
    ? outlets > 0
      ? tx(`সব ${n(outlets)}টি আউটলেট`, `All ${outlets} outlets`)
      : tx('সব আউটলেট', 'All outlets')
    : tx('আপনার আউটলেট', 'Your outlets');

  return (
    <>
      <OwnerHeader
        title={tx('স্বাগতম, চা জয়', 'Welcome, ChaJoy')}
        subtitle={`${scope} · ${tx('গত ৩০ দিনের সারসংক্ষেপ', 'Last 30 days')}`}
        actions={<ButtonLink href="/owner/customers?add=1" size="sm"><Plus size={18} strokeWidth={2.4} aria-hidden="true" />{tx('গ্রাহক যোগ করুন', 'Add customer')}</ButtonLink>}
      />
      {dashboard ? <Overview d={dashboard} canEditProgram={can('program.edit')} /> : error ? <LoadError error={error} onRetry={reload} /> : <DashboardSkeleton />}
    </>
  );
}
