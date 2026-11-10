'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import type { ProgramDto } from '@/lib/contracts/dto';
import { shop } from '@/lib/data';
import { buildShop, type ProgramShop } from '@/lib/program';
import { toProgram } from './adapters';

/** Shown for a moment before the first answer, and if the server cannot be reached. The real program replaces it at once. */
const FALLBACK: ProgramDto = {
  name: { bn: 'লয়্যালটি কার্ড', en: 'Loyalty card' },
  total: 10,
  items: ['bubble-tea', 'scoop', 'milkshake'],
  minPurchase: 200,
  dailyLimit: 2,
  expiryDays: 90,
  welcome: true,
  color: 'lime',
  version: 0,
};

/** The loyalty program as the server has it right now (stamps per card, rules, card colour). Public, so it works before sign-in. */
export function useProgramDto(): ProgramDto {
  const { data } = useSWR<ProgramDto>('/api/program', { fallbackData: FALLBACK, revalidateOnMount: true, refreshInterval: 60_000 });
  return data ?? FALLBACK;
}

/** The loyalty card as every screen draws it: ChaJoy's base card with the live program applied. */
export function useProgram(): ProgramShop {
  const dto = useProgramDto();
  return useMemo(() => buildShop(shop, toProgram(dto)), [dto]);
}
