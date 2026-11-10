'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ActivityBadge } from '@/components/activity-badge';
import { Button, IconChip, Segmented } from '@/components/ui';
import { useHistory } from '@/lib/api/history';
import type { ActivityType } from '@/lib/data';
import { useI18n } from '@/lib/i18n';
import { useWallet } from '@/lib/wallet';

type Filter = 'all' | 'stamp' | 'reward';

export default function HistoryPage() {
  const { tx, l, n } = useI18n();
  const [filter, setFilter] = useState<Filter>('all');
  const { lifetime, earned, visits } = useWallet();
  const { items: all, loading, hasMore, loadingMore, loadMore } = useHistory(25);
  const items = all.filter((h) => filter === 'all' || h.type === filter);
  const totals = [
    { label: tx('মোট Stamp', 'Total stamps'), value: lifetime, bg: 'var(--tangerine-soft)' },
    { label: tx('নেওয়া Reward', 'Rewards'), value: earned, bg: 'var(--rose-soft)' },
    { label: tx('ভিজিট', 'Visits'), value: visits, bg: 'var(--aqua-soft)' },
  ];
  const style: Record<ActivityType, { chip: string; mark: string }> = {
    stamp: { chip: '#F5D900', mark: '+' },
    reward: { chip: '#FF8A9A', mark: '★' },
    join: { chip: '#8FE3D8', mark: '✓' },
  };

  return (
    <>
      <Link href="/cards" className="inline-flex min-h-10 items-center gap-1.5 self-start text-[15px] font-bold">
        <ArrowLeft size={18} aria-hidden="true" />
        {tx('আমার কার্ডে ফিরুন', 'Back to my card')}
      </Link>
      <div>
        <h1 className="font-display text-[clamp(26px,4vw,36px)] font-bold leading-tight">{tx('ইতিহাস', 'History')}</h1>
        <p className="text-[15px] text-muted">{tx('আপনার সব Stamp ও Reward এক জায়গায়', 'All your stamps and rewards in one place')}</p>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {totals.map((t) => (
          <div key={t.label} className="rounded-[18px] p-3.5" style={{ background: t.bg }}>
            <p className="font-display text-[28px] font-bold leading-tight">{n(t.value)}</p>
            <p className="text-[13px] text-muted">{t.label}</p>
          </div>
        ))}
      </div>
      <Segmented
        className="self-start"
        label={tx('ফিল্টার', 'Filter')}
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: tx('সব', 'All') },
          { value: 'stamp', label: tx('Stamp', 'Stamps') },
          { value: 'reward', label: tx('Reward', 'Rewards') },
        ]}
      />
      <section aria-label={tx('ইতিহাস', 'History')} className="rounded-card border border-line bg-surface px-5 pb-3 pt-2">
        {loading && (
          <div role="status" aria-label={tx('লোড হচ্ছে', 'Loading')} className="flex flex-col gap-3 py-4">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-surface2" />)}
          </div>
        )}
        {!loading && items.length === 0 && <p className="py-6 text-center text-muted">{tx('এখনো কিছু নেই', 'Nothing here yet')}</p>}
        {items.map((h, i) => {
          const showGroup = i === 0 || items[i - 1].group.en !== h.group.en;
          return (
            <div key={i}>
              {showGroup && <h2 className="mb-1 mt-3.5 text-sm font-bold text-muted">{l(h.group)}</h2>}
              <div className="flex min-h-16 items-center gap-3 border-b border-line">
                <IconChip color={style[h.type].chip} size={42}>{style[h.type].mark}</IconChip>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{l(h.detail)}</span>
                  <span className="block text-sm text-muted">{l(h.time)}</span>
                </span>
                <ActivityBadge item={h} />
              </div>
            </div>
          );
        })}
        {hasMore && (
          <div className="flex justify-center pt-4">
            <Button variant="secondary" size="sm" onClick={loadMore} disabled={loadingMore}>{loadingMore ? tx('লোড হচ্ছে…', 'Loading…') : tx('আরও দেখুন', 'Show more')}</Button>
          </div>
        )}
      </section>
    </>
  );
}
