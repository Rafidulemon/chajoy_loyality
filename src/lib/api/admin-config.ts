'use client';

/**
 * Hooks, keys and small helpers for the management "configuration" screens: the loyalty program, offers, staff and SMS.
 * Reads go through SWR (the key is the URL, the fetcher is configured once in ./provider). After a write, call SWR's
 * `mutate` with the matching key from ADMIN_KEYS so every screen showing that data refreshes.
 */

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import type { AdminOfferDto, AdminProgramDto, ProgramImpactDto, SmsOverviewDto, StaffRowDto } from '@/lib/contracts/admin';
import type { OfferRow } from '@/lib/offer-row';
import { toOfferRow } from './adapters';
import { isApiError, withQuery } from './client';

export const ADMIN_KEYS = {
  program: '/api/admin/program',
  /** What saving a card of `total` stamps would complete right now (owner only). */
  programImpact: (total: number) => withQuery('/api/admin/program/impact', { total }),
  /** The public program every screen draws its card from. Update it after the program is saved so the cards redraw. */
  publicProgram: '/api/program',
  offers: '/api/admin/offers',
  offer: (id: string) => `/api/admin/offers/${id}`,
  offerStatus: (id: string) => `/api/admin/offers/${id}/status`,
  staff: '/api/admin/staff',
  staffOne: (id: string) => `/api/admin/staff/${id}`,
  staffResetPin: (id: string) => `/api/admin/staff/${id}/reset-pin`,
  sms: '/api/admin/sms',
  smsCampaigns: '/api/admin/sms/campaigns',
  smsSend: (id: string) => `/api/admin/sms/campaigns/${id}/send`,
} as const;

/** True for every management URL. Pass it to SWR's `mutate` to refresh whatever management data is on screen after a big change. */
export const isAdminKey = (key: unknown): boolean => typeof key === 'string' && key.startsWith('/api/admin/');

/** The classes of an error line: the same look as <Notice tone="danger"> but announced at once (role="alert"). */
export const ALERT_CLASS = 'rounded-2xl bg-danger-soft px-4 py-3 text-[15px] font-bold text-danger';

/** The program as management sees it, plus whether the birthday and double-stamp offers are on. Readable by managers. */
export function useAdminProgram() {
  return useSWR<AdminProgramDto>(ADMIN_KEYS.program);
}

/** Returns `value` once it has stopped changing for `ms`, so a stepper can be pressed several times before one request is made. */
export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return settled;
}

/**
 * MG-09: how many cards and vouchers saving `draftTotal` stamps per card would complete. Only asked when the draft is smaller than
 * the saved card (a bigger card changes nobody) and `enabled` (the owner is editing). `impact` is null until the answer for the
 * number now on screen has arrived, so a stale figure for an earlier number is never shown. `error` is set when asking failed.
 */
export function useProgramImpact(draftTotal: number, savedTotal: number | null, enabled: boolean) {
  const settled = useDebounced(draftTotal, 400);
  const smaller = enabled && savedTotal !== null && draftTotal < savedTotal;
  const key = smaller && settled === draftTotal ? ADMIN_KEYS.programImpact(draftTotal) : null;
  const { data, error } = useSWR<ProgramImpactDto>(key);
  return { impact: key ? (data ?? null) : null, error: key ? error : undefined };
}

/** An offer as the Offers screen shows it: the usual row plus whether its end date has passed (it is then hidden from customers). */
export type AdminOfferRow = OfferRow & { ended: boolean };

/** Every offer that is not deleted, live or paused, newest first, with how many customers claimed it. Pass `enabled=false` to skip the request. */
export function useAdminOffers(enabled = true) {
  const { data, error, isLoading, mutate } = useSWR<AdminOfferDto[]>(enabled ? ADMIN_KEYS.offers : null);
  const rows = useMemo<AdminOfferRow[]>(() => {
    const now = Date.now();
    return (data ?? []).map((o) => ({ ...toOfferRow(o, now), ended: o.endsAt !== null && Date.parse(o.endsAt) <= now }));
  }, [data]);
  return { rows, data, error, isLoading, mutate };
}

/** Everyone with an account (owner only). Pass `enabled=false` until the signed-in role is known to be the owner. */
export function useAdminStaff(enabled: boolean) {
  return useSWR<StaffRowDto[]>(enabled ? ADMIN_KEYS.staff : null);
}

/** The SMS balance, how many customers each audience reaches (only those who agreed to offer SMS) and the past campaigns. */
export function useSmsOverview() {
  return useSWR<SmsOverviewDto>(ADMIN_KEYS.sms);
}

/** The first part of each field path the server named in a VALIDATION error ("title.en" -> "title"), without repeats. Empty for other errors. */
export function issueFields(e: unknown): string[] {
  if (!isApiError(e) || e.code !== 'VALIDATION') return [];
  const issues = (e.details as { issues?: unknown } | undefined)?.issues;
  if (!Array.isArray(issues)) return [];
  const fields = issues.flatMap((issue) => {
    const path = (issue as { path?: unknown } | null)?.path;
    return typeof path === 'string' && path ? [path.split('.')[0]] : [];
  });
  return [...new Set(fields)];
}

/** Copies text to the clipboard. Falls back to the old selection trick where the clipboard API is not allowed. False when both fail. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(area);
      return copied;
    } catch {
      return false;
    }
  }
}

const DHAKA_MS = 6 * 3_600_000;

/** The current Bangladesh time in the form a datetime-local input uses ("2026-11-10T10:00"), for its `min`. */
export const dhakaInputNow = (now = Date.now()): string => new Date(now + DHAKA_MS).toISOString().slice(0, 16);

/** A datetime-local value typed as Bangladesh time, as an ISO instant. Null when it is empty or not a real date. */
export function dhakaInputToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const at = Date.parse(`${value}:00+06:00`);
  return Number.isNaN(at) ? null : new Date(at).toISOString();
}
