'use client';

import Link from 'next/link';
import { Badge, Card, CardTitle, IconChip, Notice, type Tone } from '@/components/ui';
import { useToday } from '@/lib/api/cashier';
import type { ActivityType } from '@/lib/data';
import { useI18n } from '@/lib/i18n';

const TONE: Record<ActivityType, Tone> = { stamp: 'brand', reward: 'rose', join: 'ok' };

export default function CashierToday() {
  const { tx, l, n } = useI18n();
  const today = useToday();
  const { stats } = today;
  const rows = [
    [tx('দেওয়া Stamp', 'Stamps given'), stats.stamps],
    [tx('দেওয়া Reward', 'Rewards given'), stats.rewards],
    [tx('নতুন গ্রাহক', 'New customers'), stats.newCustomers],
    [tx('বাতিল করা Stamp', 'Stamps cancelled'), stats.cancelled],
  ] as const;

  return (
    <>
      <h1 className="font-display text-[28px] font-bold">{tx('আজকের হিসাব', 'Today')}</h1>
      {today.failed && <Notice tone="danger">{tx('আজকের হিসাব লোড করা যায়নি। সংযোগ দেখে আবার চেষ্টা করুন।', 'Could not load today’s figures. Check your connection and try again.')}</Notice>}
      <Card>
        <dl className="grid grid-cols-[1fr_auto] gap-y-3 text-[15px]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="text-right text-lg font-extrabold">{today.ready ? n(v) : '–'}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card>
        <CardTitle>{tx('সাম্প্রতিক লেনদেন', 'Recent transactions')}</CardTitle>
        {!today.ready ? (
          <ul aria-label={tx('লোড হচ্ছে', 'Loading')} aria-busy="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex min-h-[60px] items-center gap-3 border-t border-line py-2.5">
                <span className="size-[38px] shrink-0 animate-pulse rounded-[13px] bg-surface2" />
                <span className="flex flex-1 flex-col gap-1.5">
                  <span className="h-4 w-32 animate-pulse rounded bg-surface2" />
                  <span className="h-3 w-24 animate-pulse rounded bg-surface2" />
                </span>
              </li>
            ))}
          </ul>
        ) : today.feed.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line2 p-6 text-center text-muted">{tx('আজ এখনো কোনো লেনদেন হয়নি।', 'No transactions yet today.')}</p>
        ) : (
          <ul>
            {today.feed.map((item) => (
              <li key={item.id} className="flex min-h-[60px] items-start gap-3 border-t border-line py-2.5">
                <IconChip color={item.avatar} size={38} className="rounded-[13px]">{l(item.initial)}</IconChip>
                {/* The label sits beside the name when it fits and drops under it when it does not, so a long label never squeezes the name. */}
                <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                  <span className="min-w-0 flex-[1_1_6.5rem]">
                    <Link href={`/cashier/customers/${item.customerId}`} className="block truncate font-bold text-ink">{l(item.customerName)}</Link>
                    <span className="block text-[13px] text-muted">{l(item.staff)} · {l(item.time)}</span>
                  </span>
                  <Badge tone={TONE[item.type]} wrap>{l(item.action)}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
