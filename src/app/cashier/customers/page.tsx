'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Search } from 'lucide-react';
import { Badge, Button, IconChip, Notice, inputClass } from '@/components/ui';
import { toCustomer } from '@/lib/api/adapters';
import { useCustomerList } from '@/lib/api/cashier';
import { useProgram } from '@/lib/api/program';
import { useI18n } from '@/lib/i18n';

export default function CashierCustomers() {
  const { tx, l, n } = useI18n();
  const shop = useProgram();
  const [query, setQuery] = useState('');
  const list = useCustomerList(query);

  return (
    <>
      <h1 className="font-display text-[28px] font-bold">{tx('গ্রাহক', 'Customers')}</h1>
      <div className="flex flex-col gap-1.5">
        <div className="relative">
          <label htmlFor="cq" className="sr-only">{tx('গ্রাহক খুঁজুন', 'Search customers')}</label>
          <Search size={20} className="absolute left-4 top-[15px] text-muted" aria-hidden="true" />
          <input id="cq" type="search" autoComplete="off" maxLength={40} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tx('নাম বা মোবাইল নম্বর', 'Name or mobile number')} className={`${inputClass} h-[52px] rounded-2xl pl-12`} />
        </div>
        <p className="px-1 text-sm text-muted">
          {list.kind === 'short-number'
            ? tx('অন্তত শেষ ৪ সংখ্যা লিখুন', 'Enter at least the last 4 digits')
            : list.kind === 'short-name'
              ? tx('নামের অন্তত ২টি অক্ষর লিখুন', 'Type at least 2 letters of the name')
              : tx('নাম, অথবা মোবাইল নম্বরের শেষ ৪ বা তার বেশি সংখ্যা লিখে খুঁজুন।', 'Search by name, or by the last 4 or more digits of a mobile number.')}
        </p>
      </div>

      <h2 className="text-lg font-bold">{list.showing === 'today' ? tx('আজ এখানে সেবা পাওয়া গ্রাহক', 'Served here today') : tx('খোঁজার ফলাফল', 'Search results')}</h2>

      {list.failed ? (
        <div className="flex flex-col items-start gap-3">
          <Notice tone="danger">{tx('গ্রাহকদের তালিকা লোড করা যায়নি। সংযোগ দেখে আবার চেষ্টা করুন।', 'Could not load the customers. Check your connection and try again.')}</Notice>
          <Button variant="secondary" size="sm" onClick={() => void list.retry()}>{tx('আবার চেষ্টা করুন', 'Try again')}</Button>
        </div>
      ) : list.loading ? (
        <ul aria-busy="true" aria-label={tx('লোড হচ্ছে', 'Loading')} className="rounded-card border border-line bg-surface px-4">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex min-h-16 items-center gap-3 border-b border-line last:border-0">
              <span className="size-10 shrink-0 animate-pulse rounded-[14px] bg-surface2" />
              <span className="flex flex-1 flex-col gap-1.5">
                <span className="h-4 w-36 animate-pulse rounded bg-surface2" />
                <span className="h-3 w-28 animate-pulse rounded bg-surface2" />
              </span>
            </li>
          ))}
        </ul>
      ) : list.items.length === 0 ? (
        <p className="rounded-card border border-dashed border-line2 p-8 text-center text-muted">
          {list.showing === 'today'
            ? tx('আজ এই আউটলেটে এখনো কাউকে সেবা দেওয়া হয়নি। কাউকে খুঁজতে উপরের ঘরে লিখুন।', 'Nobody has been served here yet today. Use the search above to find a customer.')
            : tx('কোনো গ্রাহক পাওয়া যায়নি।', 'No customers match.')}
        </p>
      ) : (
        <ul className="rounded-card border border-line bg-surface px-4">
          {list.items.map((row) => {
            const c = toCustomer(row);
            return (
              <li key={c.id}>
                <Link href={`/cashier/customers/${c.id}`} className="flex min-h-16 items-center gap-3 border-b border-line py-2 text-ink last:border-0">
                  <IconChip color={c.avatar}>{l(c.initial)}</IconChip>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words font-bold">{l(c.name)}</span>
                    <span className="block text-sm text-muted">{c.phone}</span>
                    <span className="block text-sm text-muted">{n(c.stamps)}/{n(shop.total)} Stamp · {l(c.last)}</span>
                  </span>
                  <span className="flex flex-wrap items-center justify-end gap-1.5">
                    {row.visits <= 1 && <Badge tone="ok">{tx('নতুন', 'New')}</Badge>}
                    {row.hasReadyVoucher && <Badge tone="warn">{tx('Reward রেডি', 'Reward ready')}</Badge>}
                  </span>
                  <ChevronRight size={20} className="shrink-0 text-muted" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
