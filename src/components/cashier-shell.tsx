'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, ScanLine, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Toggles } from './toggles';
import { BrandIcon } from './brand';
import { counterOutlet, onDutyCashier } from '@/lib/data';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/cn';

const NAV = [
  { href: '/cashier/scan', bn: 'স্ক্যান', en: 'Scan', Icon: ScanLine },
  { href: '/cashier/customers', bn: 'গ্রাহক', en: 'Customers', Icon: Users },
  { href: '/cashier/today', bn: 'আজকের হিসাব', en: 'Today', Icon: BarChart3 },
];

export function CashierShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { tx, l } = useI18n();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-10">
        <div className="flex min-w-0 items-center gap-3">
          <BrandIcon size={44} />
          <div>
            <p className="font-display text-xl font-bold leading-tight">{tx('চা জয়', 'ChaJoy')} · {l(counterOutlet.name)}</p>
            <p className="flex items-center gap-1.5 text-sm text-muted">
              <span className="size-2 rounded-full bg-aqua" />
              {tx(`ক্যাশিয়ার: ${onDutyCashier.name.bn} · অনলাইন`, `Cashier: ${onDutyCashier.name.en} · Online`)}
            </p>
          </div>
        </div>
        <Toggles />
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
