'use client';

/**
 * The management app's data, part A: the dashboard, the customer list, one customer and the outlets. Each screen reads
 * through a hook here, so the URLs (the SWR keys) live in one place and a change to a customer reloads every view that
 * shows that customer.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import type { AdminBranchDto, AdminCustomerDto, AdminCustomerListDto, CustomerSegment, DashboardDto } from '@/lib/contracts/admin';
import type { ActivityDto, Iso, StaffRoleDto } from '@/lib/contracts/dto';
import { can, type Permission, type StaffRole } from '@/lib/domain/permissions';
import { bnDigits, day } from '@/lib/format';
import type { Text } from '@/lib/i18n';
import { toBranch, type BranchView } from './adapters';
import { api, withQuery } from './client';
import { useSession } from './session';

// ---------------------------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------------------------

export const ADMIN_DASHBOARD_KEY = '/api/admin/dashboard';
export const ADMIN_BRANCHES_KEY = '/api/admin/branches';
/** Every customer view (the list, one customer) starts with this, so one match reloads them all. */
export const ADMIN_CUSTOMERS_PATH = '/api/admin/customers';

export type CustomerSort = 'recent' | 'visits' | 'name';
export type CustomerListParams = { segment: CustomerSegment; q: string; sort: CustomerSort; page: number; pageSize: number };

export const adminCustomersKey = (p: CustomerListParams) => withQuery(ADMIN_CUSTOMERS_PATH, { segment: p.segment, q: p.q, sort: p.sort, page: p.page, pageSize: p.pageSize });
export const adminCustomerKey = (id: string) => `${ADMIN_CUSTOMERS_PATH}/${id}`;
/** The CSV file for a filter (owner only). A plain link: the server sends it as a download, so nothing is parsed here. */
export const adminCustomersExportHref = (p: Pick<CustomerListParams, 'segment' | 'q'>) => withQuery(`${ADMIN_CUSTOMERS_PATH}/export`, { segment: p.segment, q: p.q });

// ---------------------------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------------------------

/** The dashboard numbers. A manager gets their own outlets, an owner gets all of them. Reloads every minute so the activity list stays fresh. */
export function useAdminDashboard() {
  const { data, error, isLoading, mutate } = useSWR<DashboardDto>(ADMIN_DASHBOARD_KEY, { refreshInterval: 60_000, keepPreviousData: true });
  const reload = useCallback(() => void mutate(), [mutate]);
  return { dashboard: data, error, loading: isLoading, reload };
}

/**
 * One page of the customer list. While the next page or a new search loads, the previous rows stay (`refreshing` is true) so the table
 * does not jump. After a failed load `list` may still hold the previous rows, so a screen shows `error` instead of them.
 */
export function useAdminCustomers(params: CustomerListParams) {
  const { data, error, isValidating, mutate } = useSWR<AdminCustomerListDto>(adminCustomersKey(params), { keepPreviousData: true });
  const reload = useCallback(() => void mutate(), [mutate]);
  return { list: data, error, loading: !data && !error, refreshing: isValidating, reload };
}

/** One customer for management. Pass null to wait (no request). */
export function useAdminCustomer(id: string | null) {
  const { data, error, isLoading, mutate } = useSWR<AdminCustomerDto>(id ? adminCustomerKey(id) : null);
  const reload = useCallback(() => void mutate(), [mutate]);
  return { customer: data, error, loading: isLoading, reload };
}

export type AdminBranchView = BranchView & { active: boolean };

/** The outlets with staff and customer counts. Pass `enabled` false to skip the request (for a screen that only sometimes needs it). */
export function useAdminBranches(enabled = true) {
  const { data, error, mutate } = useSWR<AdminBranchDto[]>(enabled ? ADMIN_BRANCHES_KEY : null);
  const branches = useMemo<AdminBranchView[]>(() => (data ?? []).map((b) => ({ ...toBranch(b), active: b.active })), [data]);
  const reload = useCallback(() => void mutate(), [mutate]);
  return { branches, error, loading: enabled && !data && !error, reload };
}

/** After a change to a customer or to the customer list: reload every customer view that is on screen, and the dashboard numbers that count them. */
export function useRefreshCustomers() {
  const { mutate } = useSWRConfig();
  return useCallback(
    () => Promise.all([mutate((key) => typeof key === 'string' && key.startsWith(ADMIN_CUSTOMERS_PATH)), mutate(ADMIN_DASHBOARD_KEY)]),
    [mutate],
  );
}

export type ActivityPage = { items: ActivityDto[]; nextBefore: Iso | null };

/** The next page of a customer's timeline, older than `before` (the last page's `nextBefore`). The page can repeat the boundary row. */
export const fetchCustomerActivity = (id: string, before: Iso) => api.get<ActivityPage>(withQuery(`${adminCustomerKey(id)}/activity`, { before, limit: 30 }));

/** Whether the signed-in person may do something, from the same table the server checks (src/lib/domain/permissions.ts). False until known. */
export function useCan() {
  const { staff } = useSession();
  const role = staff ? (staff.role.toUpperCase() as StaffRole) : null;
  return useCallback((permission: Permission) => (role ? can(role, permission) : false), [role]);
}

/** A value that follows `value` after it has stopped changing for `ms` (search boxes). */
export function useDebouncedValue<T>(value: T, ms = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

// ---------------------------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------------------------

export const ROLE_TEXT: Record<StaffRoleDto, Text> = {
  owner: { bn: 'মালিক', en: 'Owner' },
  manager: { bn: 'ম্যানেজার', en: 'Manager' },
  cashier: { bn: 'ক্যাশিয়ার', en: 'Cashier' },
};

/** Bangla digits to 0-9, so a number typed in Bangla still finds a phone number. */
export const asciiDigits = (s: string) => s.replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)));

/** What a member sees on their card: "CJ-000123". */
export const memberCode = (no: number) => `CJ-${String(no).padStart(6, '0')}`;

const WEEKDAYS: Text[] = [
  { bn: 'রবি', en: 'Sun' },
  { bn: 'সোম', en: 'Mon' },
  { bn: 'মঙ্গল', en: 'Tue' },
  { bn: 'বুধ', en: 'Wed' },
  { bn: 'বৃহঃ', en: 'Thu' },
  { bn: 'শুক্র', en: 'Fri' },
  { bn: 'শনি', en: 'Sat' },
];

/** "YYYY-MM-DD" -> UTC midnight of that date, or null when it is not a date. */
function dateOnly(value: string): number | null {
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  const at = Date.UTC(y, m - 1, d);
  return Number.isNaN(at) ? null : at;
}

/** The weekday of a "YYYY-MM-DD" day, in both languages ("Mon" / "সোম"). */
export function weekdayOf(dayKey: string): Text {
  const at = dateOnly(dayKey);
  return at === null ? { bn: dayKey, en: dayKey } : WEEKDAYS[new Date(at).getUTCDay()];
}

/** "3 Nov" for a "YYYY-MM-DD" day. */
export function dayOf(dayKey: string): Text {
  const at = dateOnly(dayKey);
  return at === null ? { bn: dayKey, en: dayKey } : day(at);
}

/** "12 May 2026" for an ISO time, as the day it falls on in Dhaka. */
export function fullDate(iso: Iso): Text {
  const ms = Date.parse(iso);
  const d = day(ms);
  const year = new Date(ms + 6 * 3_600_000).getUTCFullYear();
  return { bn: `${d.bn} ${bnDigits(String(year))}`, en: `${d.en} ${year}` };
}

/** "12 Mar" for a "YYYY-MM-DD" birthday: the day and month only, not the year. */
export const birthdayText = (birthday: string): Text => dayOf(birthday.replace(/^\d{4}/, '2024'));
