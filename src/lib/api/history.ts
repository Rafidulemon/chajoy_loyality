'use client';

import { useEffect, useMemo } from 'react';
import useSWRInfinite from 'swr/infinite';
import type { HistoryDto } from '@/lib/contracts/dto';
import type { HistoryItem } from '@/lib/data';
import { useWallet } from '@/lib/wallet';
import { toHistoryItem } from './adapters';
import { withQuery } from './client';

/**
 * The customer's stamp and reward history, newest first, loaded a page at a time. It reloads when the card changes, so a stamp
 * added at the counter appears here too. The server may repeat the row at a page boundary, so rows are de-duplicated by id.
 */
export function useHistory(pageSize = 20) {
  const { card } = useWallet();
  const { data, size, setSize, isLoading, isValidating, mutate } = useSWRInfinite<HistoryDto>(
    (index, previous) => {
      if (previous && !previous.nextBefore) return null;
      return withQuery('/api/me/history', { limit: pageSize, before: index === 0 ? undefined : previous?.nextBefore });
    },
    { revalidateFirstPage: true, revalidateOnFocus: false },
  );

  const version = card?.version;
  useEffect(() => {
    void mutate();
  }, [version, mutate]);

  const items = useMemo<HistoryItem[]>(() => {
    const seen = new Set<string>();
    const out: HistoryItem[] = [];
    const now = Date.now();
    for (const page of data ?? []) {
      for (const a of page.items) {
        if (seen.has(a.id)) continue;
        seen.add(a.id);
        out.push(toHistoryItem(a, now));
      }
    }
    return out;
  }, [data]);

  const last = data?.[data.length - 1];
  return {
    items,
    loading: isLoading,
    hasMore: !!last?.nextBefore,
    loadingMore: isValidating && size > (data?.length ?? 0),
    loadMore: () => setSize(size + 1),
  };
}
