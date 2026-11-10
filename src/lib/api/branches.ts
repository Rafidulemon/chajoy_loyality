'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import type { BranchDto } from '@/lib/contracts/dto';
import { toBranch, type BranchView } from './adapters';

/** ChaJoy's outlets with their opening hours (public). Refreshes every minute, so a change in management reaches customers quickly (BR-26). */
export function useBranches(): { branches: BranchView[]; loading: boolean } {
  const { data, isLoading } = useSWR<BranchDto[]>('/api/branches', { refreshInterval: 60_000 });
  const branches = useMemo(() => (data ?? []).map(toBranch), [data]);
  return { branches, loading: isLoading };
}
