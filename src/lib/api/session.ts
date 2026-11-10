'use client';

import useSWR from 'swr';
import type { MeDto, StaffMeDto } from '@/lib/contracts/dto';
import { api } from './client';

/**
 * Who is signed in on this browser: a customer, staff, both or neither. Loading until the first answer. `error` is set when
 * the question itself failed (no connection, server down): that is not the same as being signed out, so screens should
 * offer a retry instead of sending the person to sign in.
 */
export function useSession() {
  const { data, error, isLoading, mutate } = useSWR<{ customer: MeDto | null; staff: StaffMeDto | null }>('/api/auth/session', { revalidateOnFocus: false });
  return { customer: data?.customer ?? null, staff: data?.staff ?? null, loading: isLoading, error, refresh: mutate };
}

/** Signs out and goes to the right sign-in screen. `everywhere` also ends every other device's session (MG-21). */
export async function signOut(scope: 'customer' | 'staff', everywhere = false) {
  try {
    await api.post('/api/auth/logout', { scope, everywhere });
  } finally {
    window.location.assign(scope === 'customer' ? '/login' : '/staff/login');
  }
}

/** Only follow a "?next=" that stays on this site, so a crafted link cannot send someone elsewhere after they sign in. */
export function safeNext(next: string | null | undefined, fallback: string): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : fallback;
}
