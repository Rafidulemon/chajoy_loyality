'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Search } from 'lucide-react';
import { Badge, IconChip, inputClass } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { useProgram, useStore } from '@/lib/store';

export default function CashierCustomers() {
  const { tx, l, n } = useI18n();
  const store = useStore();
  const shop = useProgram();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const rows = store.customers.filter((c) => !q || c.name.en.toLowerCase().includes(q) || c.name.bn.includes(q) || (/\d/.test(q) && c.phone.replace(/\D/g, '').includes(q.replace(/\D/g, ''))));

  return (
    <>
      <h1 className="font-display text-[28px] font-bold">{tx('আজকের গ্রাহক', 'Today’s customers')}</h1>
      <div className="relative">
        <label htmlFor="cq" className="sr-only">{tx('গ্রাহক খুঁজুন', 'Search customers')}</label>
        <Search size={20} className="absolute left-4 top-[15px] text-muted" aria-hidden="true" />
        <input id="cq" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tx('নাম বা মোবাইল নম্বর', 'Name or mobile number')} className={`${inputClass} h-[52px] rounded-2xl pl-12`} />
      </div>
      {rows.length === 0 ? (
        <p className="rounded-card border border-dashed border-line2 p-8 text-center text-muted">{tx('কোনো গ্রাহক পাওয়া যায়নি।', 'No customers match.')}</p>
      ) : (
        <ul className="rounded-card border border-line bg-surface px-4">
          {rows.map((c) => {
            const card = store.cards[c.id];
            const ready = card?.vouchers.some((v) => v.status === 'ready');
            const isNew = store.added.some((a) => a.id === c.id);
            return (
              <li key={c.id}>
                <Link href={`/cashier/customers/${c.id}`} className="flex min-h-16 items-center gap-3 border-b border-line text-ink last:border-0">
                  <IconChip color={c.avatar}>{l(c.initial)}</IconChip>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{l(c.name)}</span>
                    <span className="block text-sm text-muted">{n(card?.stamps ?? c.stamps)}/{n(shop.total)} Stamp · {card?.activity.length ? tx('আজ', 'Today') : l(c.last)}</span>
                  </span>
                  {isNew && <Badge tone="ok">{tx('নতুন', 'New')}</Badge>}
                  {ready && <Badge tone="warn">{tx('Reward রেডি', 'Reward ready')}</Badge>}
                  <ChevronRight size={20} className="text-muted" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
