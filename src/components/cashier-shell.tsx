'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { BarChart3, LayoutDashboard, LogOut, ScanLine, Users } from 'lucide-react';
import { Toggles } from './toggles';
import { BrandIcon } from './brand';
import { ChangePinButton } from './change-pin';
import { Button, ButtonLink } from './ui';
import { roleLabel, useCashierMe } from '@/lib/api/cashier';
import { signOut } from '@/lib/api/session';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/cn';

const NAV = [
  { href: '/cashier/scan', bn: 'স্ক্যান', en: 'Scan', Icon: ScanLine },
  { href: '/cashier/customers', bn: 'গ্রাহক', en: 'Customers', Icon: Users },
  { href: '/cashier/today', bn: 'আজকের হিসাব', en: 'Today', Icon: BarChart3 },
];

/** A grey bar where a name will be, so the header never shows someone else's name while the real one loads. */
const Placeholder = ({ className }: { className: string }) => <span aria-hidden="true" className={cn('block animate-pulse rounded-md bg-surface2', className)} />;

export function CashierShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { tx, l } = useI18n();
  const { me, loading, failed, isManagement } = useCashierMe();
  const [leaving, setLeaving] = useState(false);
  const role = me ? roleLabel(me.role) : null;

  const leave = () => {
    setLeaving(true);
    void signOut('staff');
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <header aria-busy={loading} className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-10">
        <div className="flex min-w-0 items-center gap-3">
          <BrandIcon size={44} />
          <div className="min-w-0">
            {me ? (
              <p className="font-display text-xl font-bold leading-tight">
                {tx('চা জয়', 'ChaJoy')}
                {me.branch && <> · {l(me.branch.name)}</>}
              </p>
            ) : (
              <p className="flex items-center gap-2 font-display text-xl font-bold leading-tight">
                {tx('চা জয়', 'ChaJoy')}
                {loading && <Placeholder className="h-5 w-24" />}
              </p>
            )}
            {me && role ? (
              <p className="flex items-center gap-1.5 text-sm text-muted">
                <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-aqua" />
                <span className="min-w-0 break-words">
                  {tx(`${role.bn}: ${me.name}`, `${role.en}: ${me.name}`)}
                  {!me.branch && ` · ${tx('কোনো আউটলেট ঠিক করা নেই', 'No outlet assigned')}`}
                </span>
              </p>
            ) : failed ? (
              <p className="text-sm text-muted">{tx('আপনার তথ্য লোড করা যায়নি', 'Could not load your details')}</p>
            ) : (
              <Placeholder className="mt-1 h-4 w-40" />
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isManagement && (
            <ButtonLink href="/owner" variant="secondary" size="sm">
              <LayoutDashboard size={18} aria-hidden="true" />
              {tx('ম্যানেজমেন্ট', 'Management')}
            </ButtonLink>
          )}
          <ChangePinButton variant="icon" />
          <Button variant="secondary" size="sm" disabled={leaving} onClick={leave}>
            <LogOut size={18} aria-hidden="true" />
            {tx('লগআউট', 'Sign out')}
          </Button>
          <Toggles />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col gap-4 px-4 pb-6 md:px-10">{children}</main>
      <nav aria-label={tx('ক্যাশিয়ার মেনু', 'Cashier menu')} className="sticky bottom-0 flex border-t border-line bg-surface px-3 pb-[max(14px,env(safe-area-inset-bottom))] pt-2">
        {NAV.map(({ href, bn, en, Icon }) => {
          const on = path.startsWith(href);
          return (
            <Link key={href} href={href} aria-current={on ? 'page' : undefined} className={cn('flex min-h-11 flex-1 flex-col items-center gap-0.5 pt-1 text-[13px]', on ? 'font-bold text-brand-ink' : 'font-semibold text-muted')}>
              <span className={cn('flex rounded-full px-4 py-0.5', on && 'bg-brand-soft')}>
                <Icon size={22} aria-hidden="true" />
              </span>
              {tx(bn, en)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
