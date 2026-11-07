'use client';

import Link from 'next/link';
import { Badge, Card, CardTitle, IconChip, type Tone } from '@/components/ui';
import type { ActivityType } from '@/lib/data';
import { useI18n } from '@/lib/i18n';
import { useStore, useToday } from '@/lib/store';

const TONE: Record<ActivityType, Tone> = { stamp: 'brand', reward: 'rose', join: 'ok' };

export default function CashierToday() {
  const { tx, l, n } = useI18n();
  const store = useStore();
  const today = useToday();
  const rows = [
    [tx('দেওয়া Stamp', 'Stamps given'), today.stamps],
    [tx('দেওয়া Reward', 'Rewards given'), today.rewards],
    [tx('নতুন গ্রাহক', 'New customers'), today.newCustomers],
    [tx('বাতিল করা Stamp', 'Stamps cancelled'), today.cancelled],
  ] as const;

  return (
    <>
      <h1 className="font-display text-[28px] font-bold">{tx('আজকের হিসাব', 'Today')}</h1>
      <Card>
        <dl className="grid grid-cols-[1fr_auto] gap-y-3 text-[15px]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="text-right text-lg font-extrabold">{n(v)}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card>
        <CardTitle>{tx('সাম্প্রতিক লেনদেন', 'Recent transactions')}</CardTitle>
        <ul>
          {store.feed.slice(0, 10).map((item, i) => {
            const customer = store.customer(item.customerId);
            return (
              <li key={i} className="flex min-h-[60px] items-center gap-3 border-t border-line">
                <IconChip color={customer?.avatar ?? '#B8D4CF'} size={38} className="rounded-[13px]">{customer ? l(customer.initial) : '?'}</IconChip>
                <span className="min-w-0 flex-1">
                  {customer ? (
                    <Link href={`/cashier/customers/${customer.id}`} className="block truncate font-bold text-ink">{l(customer.name)}</Link>
                  ) : (
                    <span className="block font-bold">{tx('গ্রাহক', 'Customer')}</span>
                  )}
                  <span className="block text-[13px] text-muted">{l(item.staff)} · {l(item.time)}</span>
                </span>
                <Badge tone={TONE[item.type]}>{l(item.action)}</Badge>
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
