'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { CreditCard, LayoutGrid, LogOut, MessageSquare, ScanLine, Settings, ShieldOff, Tag, UserCog, Users, type LucideIcon } from 'lucide-react';
import { BrandLogo } from './brand';
import { ChangePinButton } from './change-pin';
import { LoadError, Skeleton } from './owner-feedback';
import { Toggles } from './toggles';
import { Button, ButtonLink } from './ui';
import { ROLE_TEXT } from '@/lib/api/admin-customers';
import { signOut, useSession } from '@/lib/api/session';
import type { StaffMeDto } from '@/lib/contracts/dto';
import { can, type Permission, type StaffRole } from '@/lib/domain/permissions';
import { initialOf } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/cn';

type NavItem = {
  href: string;
  bn: string;
  en: string;
  Icon: LucideIcon;
  chip: string;
  /** Who sees this link in the menu. */
  show: Permission;
  /** Who may open the page, when that is wider than who sees the link. */
  open?: Permission;
};

/**
 * The menu, by what the server lets each role do (src/lib/domain/permissions.ts). A manager sees Dashboard, Customers, Loyalty card
 * (to look at, the owner edits it), Offers and SMS; the owner also gets Staff and Settings. The server checks every request again.
 */
const NAV: NavItem[] = [
  { href: '/owner', bn: 'ড্যাশবোর্ড', en: 'Dashboard', Icon: LayoutGrid, chip: '#7FD8CE', show: 'dashboard.view' },
  { href: '/owner/customers', bn: 'গ্রাহক', en: 'Customers', Icon: Users, chip: '#F5D900', show: 'customers.list' },
  { href: '/owner/program', bn: 'লয়্যালটি কার্ড', en: 'Loyalty card', Icon: CreditCard, chip: '#FF8A9A', show: 'dashboard.view' },
  { href: '/owner/offers', bn: 'অফার', en: 'Offers', Icon: Tag, chip: '#97C334', show: 'offers.manage' },
  { href: '/owner/staff', bn: 'স্টাফ', en: 'Staff', Icon: UserCog, chip: '#8FE3D8', show: 'staff.manage' },
  { href: '/owner/sms', bn: 'SMS', en: 'SMS', Icon: MessageSquare, chip: '#7FCBFF', show: 'sms.send' },
  // A manager has no link here, but the page shows the outlets read-only if they open it.
  { href: '/owner/settings', bn: 'সেটিংস', en: 'Settings', Icon: Settings, chip: '#B8D4CF', show: 'outlets.manage', open: 'dashboard.view' },
];

const roleOf = (staff: StaffMeDto) => staff.role.toUpperCase() as StaffRole;

/** Whether this role may open the page at `path`: the longest menu entry that the path sits under decides. */
function mayOpen(path: string, role: StaffRole): boolean {
  const entry = [...NAV].sort((a, b) => b.href.length - a.href.length).find((i) => path === i.href || path.startsWith(`${i.href}/`));
  return entry ? can(role, entry.open ?? entry.show) : true;
}

/** Name and role of the signed-in person, with the way to the cashier app and to sign out. `bar` is the compact form for phones. */
function Account({ staff, variant }: { staff: StaffMeDto; variant: 'bar' | 'panel' }) {
  const { tx, l } = useI18n();
  const [busy, setBusy] = useState(false);
  const role = ROLE_TEXT[staff.role];
  const initial = initialOf(staff.name).en;

  const out = () => {
    if (busy) return;
    setBusy(true);
    // signOut sends the browser to the sign-in screen when it is done, whether or not the request worked.
    void signOut('staff').catch(() => undefined);
  };

  if (variant === 'bar') {
    return (
      <div className="flex items-center gap-2 lg:hidden">
        <span className="hidden min-w-0 items-center gap-2 sm:flex">
          <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand font-display text-base font-extrabold text-brand-on">{initial}</span>
          <span className="min-w-0 leading-tight">
            <span className="block max-w-[160px] truncate text-sm font-bold">{staff.name}</span>
            <span className="block text-xs text-muted">{l(role)}</span>
          </span>
        </span>
        <span className="sr-only sm:hidden">{staff.name}, {l(role)}</span>
        <Link href="/cashier/scan" aria-label={tx('ক্যাশিয়ার অ্যাপ', 'Cashier app')} title={tx('ক্যাশিয়ার অ্যাপ', 'Cashier app')} className="flex size-11 items-center justify-center rounded-xl border border-line bg-surface text-ink hover:bg-surface2">
          <ScanLine size={20} aria-hidden="true" />
        </Link>
        <ChangePinButton variant="icon" />
        <button type="button" onClick={out} disabled={busy} aria-label={tx('লগআউট', 'Sign out')} title={tx('লগআউট', 'Sign out')} className="flex size-11 items-center justify-center rounded-xl border border-line bg-surface text-ink hover:bg-surface2 disabled:cursor-not-allowed disabled:text-muted">
          <LogOut size={20} aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div className="mt-auto hidden flex-col gap-3 rounded-2xl border border-line bg-surface2 p-3 lg:flex">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand font-display text-lg font-extrabold text-brand-on">{initial}</span>
        <span className="min-w-0">
          <span className="block truncate font-bold">{staff.name}</span>
          <span className="block text-[13px] text-muted">{l(role)}</span>
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <ButtonLink href="/cashier/scan" variant="secondary" size="sm"><ScanLine size={18} aria-hidden="true" />{tx('ক্যাশিয়ার অ্যাপ', 'Cashier app')}</ButtonLink>
        <ChangePinButton />
        <Button variant="ghost" size="sm" onClick={out} disabled={busy}><LogOut size={18} aria-hidden="true" />{busy ? tx('লগআউট হচ্ছে…', 'Signing out…') : tx('লগআউট', 'Sign out')}</Button>
      </div>
    </div>
  );
}

/** The page frame: menu on the side (on top on phones) and the page beside it. With no `staff` yet it draws placeholders, never a name or links that might not be theirs. */
function Frame({ staff, children }: { staff: StaffMeDto | null; children: ReactNode }) {
  const path = usePathname();
  const { tx } = useI18n();
  const role = staff ? roleOf(staff) : null;
  const items = role ? NAV.filter((i) => can(role, i.show)) : [];
  const isActive = (href: string) => (href === '/owner' ? path === href : path === href || path.startsWith(`${href}/`));

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="flex flex-col gap-3 border-b border-line bg-surface px-4 py-3 lg:sticky lg:top-0 lg:h-dvh lg:w-[260px] lg:shrink-0 lg:gap-6 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:px-4 lg:py-6">
        <div className="flex items-center justify-between gap-3 px-2">
          <BrandLogo href="/owner" />
          {staff ? <Account staff={staff} variant="bar" /> : <Skeleton className="h-11 w-24 lg:hidden" />}
        </div>
        <nav aria-label={tx('ড্যাশবোর্ড মেনু', 'Dashboard menu')} aria-busy={!staff} className="-mx-1 flex gap-1 overflow-x-auto px-1 lg:flex-col lg:overflow-visible">
          {staff
            ? items.map(({ href, bn, en, Icon, chip }) => {
                const on = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={on ? 'page' : undefined}
                    className={cn('flex min-h-11 shrink-0 items-center gap-3 whitespace-nowrap rounded-xl px-3 text-[15px]', on ? 'bg-brand-soft font-extrabold text-brand-ink' : 'font-semibold text-ink hover:bg-surface2')}
                  >
                    <span className="flex size-7 items-center justify-center rounded-[9px] text-navy" style={{ background: chip }}>
                      <Icon size={16} strokeWidth={2.4} aria-hidden="true" />
                    </span>
                    {tx(bn, en)}
                  </Link>
                );
              })
            : Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-11 w-28 shrink-0 lg:w-full" />)}
        </nav>
        {staff && <Account staff={staff} variant="panel" />}
      </aside>
      <main className="min-w-0 flex-1 px-4 pb-12 pt-7 md:px-10">
        <div className="mx-auto flex max-w-[1120px] flex-col gap-[22px]">{children}</div>
      </main>
    </div>
  );
}

/** Shown in place of the page when this role may not open it (for example a manager on the Staff page). */
function NoAccess() {
  const { tx } = useI18n();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-danger-soft text-danger"><ShieldOff size={28} aria-hidden="true" /></span>
      <h1 className="font-display text-3xl font-bold">{tx('এই পাতায় আপনার প্রবেশাধিকার নেই', 'You do not have access to this page')}</h1>
      <p className="text-muted">{tx('এটি শুধু মালিকের জন্য। আপনি যা ব্যবহার করতে পারেন তা মেনুতে আছে।', 'This page is for the owner only. The pages you can use are in the menu.')}</p>
      <ButtonLink href="/owner">{tx('ড্যাশবোর্ডে ফিরুন', 'Back to the dashboard')}</ButtonLink>
    </div>
  );
}

/** A cashier account has no business in the management app, so it gets this instead of the app (the server refuses its requests anyway). */
function CashierBlocked({ staff }: { staff: StaffMeDto }) {
  const { tx } = useI18n();
  const [busy, setBusy] = useState(false);
  const out = () => {
    if (busy) return;
    setBusy(true);
    void signOut('staff').catch(() => undefined);
  };
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-[1120px] items-center justify-between gap-3 px-4 py-4 md:px-10">
        <BrandLogo href="/cashier/scan" />
        <Toggles />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 pb-16 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-danger-soft text-danger"><ShieldOff size={28} aria-hidden="true" /></span>
        <h1 className="font-display text-3xl font-bold">{tx('এই অংশটি ম্যানেজার ও মালিকের জন্য', 'This area is for managers and owners')}</h1>
        <p className="text-muted">
          {tx(
            `${staff.name} একটি ক্যাশিয়ার অ্যাকাউন্ট, তাই ম্যানেজমেন্ট অ্যাপ খোলা যাবে না। কাউন্টারের কাজ ক্যাশিয়ার অ্যাপে করুন, অথবা ম্যানেজার বা মালিকের অ্যাকাউন্ট দিয়ে লগইন করুন।`,
            `${staff.name} is a cashier account, so it cannot open the management app. Do counter work in the cashier app, or sign in with a manager or owner account.`,
          )}
        </p>
        <div className="flex flex-wrap justify-center gap-2.5">
          <ButtonLink href="/cashier/scan"><ScanLine size={18} aria-hidden="true" />{tx('ক্যাশিয়ার অ্যাপে যান', 'Go to the cashier app')}</ButtonLink>
          <Button variant="secondary" onClick={out} disabled={busy}><LogOut size={18} aria-hidden="true" />{busy ? tx('লগআউট হচ্ছে…', 'Signing out…') : tx('লগআউট', 'Sign out')}</Button>
        </div>
      </main>
    </div>
  );
}

export function OwnerShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { tx } = useI18n();
  // A failed session request (sessionError) is not the same as "signed out": it gets a retry, not a redirect.
  const { staff, loading, error: sessionError, refresh } = useSession();

  // The session ended (or this browser never had a staff session): go to the staff sign-in and come back here afterwards.
  useEffect(() => {
    if (!loading && !staff && !sessionError) window.location.assign(`/staff/login?next=${encodeURIComponent(path)}`);
  }, [loading, staff, sessionError, path]);

  // Until we know who this is, draw the frame with placeholders and no page, so no one else's name or menu flashes and no request starts that this role cannot make.
  if (!staff) {
    return (
      <Frame staff={null}>
        {sessionError && !loading ? (
          <LoadError error={sessionError} onRetry={() => void refresh()} />
        ) : (
          <div role="status" aria-busy="true" className="flex flex-col gap-4">
            <span className="sr-only">{loading ? tx('লোড হচ্ছে…', 'Loading…') : tx('লগইন পেজে নেওয়া হচ্ছে…', 'Taking you to sign-in…')}</span>
            <Skeleton className="h-9 w-64 max-w-full" />
            <Skeleton className="h-4 w-48 max-w-full" />
            <Skeleton className="mt-2 h-44 w-full" />
          </div>
        )}
      </Frame>
    );
  }

  if (staff.role === 'cashier') return <CashierBlocked staff={staff} />;

  return <Frame staff={staff}>{mayOpen(path, roleOf(staff)) ? children : <NoAccess />}</Frame>;
}
