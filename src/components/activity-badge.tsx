'use client';

import { Badge } from './ui';
import type { HistoryItem } from '@/lib/data';
import { useI18n } from '@/lib/i18n';

/** The badge at the end of a history row: Reward, New, or the number of stamps (negative when management took some back). */
export function ActivityBadge({ item }: { item: HistoryItem }) {
  const { tx, n } = useI18n();
  if (item.type === 'reward') return <Badge tone="rose">Reward</Badge>;
  if (item.type === 'join') return <Badge tone="ok">{tx('নতুন', 'New')}</Badge>;
  const count = item.count ?? 1;
  const sign = count > 0 ? '+' : '';
  return (
    <Badge tone={count < 0 ? 'danger' : 'brand'}>
      {tx(`${sign}${n(count)} Stamp`, `${sign}${count} stamp${Math.abs(count) > 1 ? 's' : ''}`)}
    </Badge>
  );
}
