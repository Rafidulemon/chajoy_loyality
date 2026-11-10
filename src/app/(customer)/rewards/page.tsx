'use client';

import Link from 'next/link';
import { ChevronRight, Gift, Tag } from 'lucide-react';
import { VoucherTicket } from '@/components/voucher-ticket';
import { ButtonLink, Card, PageTitle } from '@/components/ui';
import { useProgram } from '@/lib/api/program';
import { useI18n } from '@/lib/i18n';
import { useWallet } from '@/lib/wallet';
import { cn } from '@/lib/cn';

export default function RewardsPage() {
  const { tx, n } = useI18n();
  const shop = useProgram();
  const { vouchers, readyVouchers, stamps, unclaimed } = useWallet();
  const past = vouchers.filter((v) => v.status !== 'ready');
  const rem = shop.total - stamps;

  return (
    <>
      <PageTitle title={tx('Reward', 'Rewards')} subtitle={tx('আপনার জমানো ফ্রি ট্রিট', 'The free treats you’ve earned')} />

      <Card className="flex flex-wrap items-center gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand text-brand-on"><Gift size={24} aria-hidden="true" /></span>
        <div className="min-w-0 flex-[1_1_220px]">
          <p className="font-bold">{tx(`পরের Reward: আর ${n(rem)}টি Stamp`, `Next reward: ${rem} more stamp${rem === 1 ? '' : 's'}`)}</p>
          <div role="progressbar" aria-valuemin={0} aria-valuemax={shop.total} aria-valuenow={stamps} aria-label={tx('কার্ডের অগ্রগতি', 'Card progress')} className="mt-2 flex gap-1">
            {Array.from({ length: shop.total }, (_, i) => (
              <span key={i} className={cn('h-2 flex-1 rounded-full', i < stamps ? 'bg-brand-dark' : 'bg-line2')} />
            ))}
          </div>
        </div>
        <ButtonLink href="/cards" variant="secondary" size="sm">{tx('কার্ড দেখুন', 'View card')}</ButtonLink>
      </Card>

      <section aria-labelledby="ready-h" className="flex flex-col gap-3">
        <h2 id="ready-h" className="flex items-center gap-2 text-lg font-bold">
          {tx('ব্যবহারের জন্য রেডি', 'Ready to use')}
          {readyVouchers.length > 0 && <span className="rounded-full bg-brand px-2.5 text-[13px] font-extrabold text-brand-on">{n(readyVouchers.length)}</span>}
        </h2>
        {readyVouchers.length === 0 ? (
          <p className="rounded-card border border-dashed border-line2 p-8 text-center text-muted">
            {tx('এখনো কোনো Reward রেডি নেই। ', 'No rewards ready yet. ')}
            {tx(`আর ${n(rem)}টি Stamp পেলেই পরের Reward।`, `${rem} more stamp${rem === 1 ? '' : 's'} to your next one.`)}
          </p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(310px,1fr))] gap-4">
            {readyVouchers.map((v) => <VoucherTicket key={v.id} voucher={v} href={`/rewards/${v.id}`} />)}
          </div>
        )}
      </section>

      {unclaimed > 0 && (
        <Link href="/offers" className="flex min-h-16 items-center gap-3 rounded-card bg-tangerine-soft px-4 py-3 text-warn">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[13px] bg-tangerine text-navy"><Tag size={20} aria-hidden="true" /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-bold">{tx(`${n(unclaimed)}টি অফার নেওয়ার অপেক্ষায়`, `${unclaimed} offer${unclaimed === 1 ? '' : 's'} waiting to be claimed`)}</span>
            <span className="block text-[13px]">{tx('শেষ হওয়ার আগে নিয়ে নিন', 'Claim them before they end')}</span>
          </span>
          <ChevronRight size={20} aria-hidden="true" />
        </Link>
      )}

      {past.length > 0 && (
        <section aria-labelledby="past-h" className="flex flex-col gap-3">
          <h2 id="past-h" className="text-lg font-bold">{tx('ব্যবহৃত ও মেয়াদোত্তীর্ণ', 'Used and expired')}</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(310px,1fr))] gap-4">
            {past.map((v) => <VoucherTicket key={v.id} voucher={v} href={`/rewards/${v.id}`} />)}
          </div>
        </section>
      )}

      <Link href="/history" className="inline-flex min-h-11 items-center gap-1 self-center font-bold">
        {tx('পুরো ইতিহাস দেখুন', 'See full activity history')}
        <ChevronRight size={18} aria-hidden="true" />
      </Link>
    </>
  );
}
