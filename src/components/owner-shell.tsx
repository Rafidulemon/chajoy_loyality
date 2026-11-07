'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CreditCard, LayoutGrid, MessageSquare, Settings, Tag, UserCog, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { BrandLogo } from './brand';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/cn';

const NAV = [
  { href: '/owner', bn: 'ড্যাশবোর্ড', en: 'Dashboard', Icon: LayoutGrid, chip: '#7FD8CE' },
  { href: '/owner/customers', bn: 'গ্রাহক', en: 'Customers', Icon: Users, chip: '#F5D900' },
  { href: '/owner/program', bn: 'লয়্যালটি কার্ড', en: 'Loyalty card', Icon: CreditCard, chip: '#FF8A9A' },
  { href: '/owner/offers', bn: 'অফার', en: 'Offers', Icon: Tag, chip: '#97C334' },
  { href: '/owner/staff', bn: 'স্টাফ', en: 'Staff', Icon: UserCog, chip: '#8FE3D8' },
  { href: '/owner/sms', bn: 'SMS', en: 'SMS', Icon: MessageSquare, chip: '#7FCBFF' },
  { href: '/owner/settings', bn: 'সেটিংস', en: 'Settings', Icon: Settings, chip: '#B8D4CF' },
];

export function OwnerShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { tx } = useI18n();
  const isActive = (href: string) => (href === '/owner' ? path === href : path === href || path.startsWith(href + '/'));

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="flex flex-col gap-3 border-b border-line bg-surface px-4 py-3 lg:sticky lg:top-0 lg:h-dvh lg:w-[260px] lg:shrink-0 lg:gap-6 lg:border-b-0 lg:border-r lg:px-4 lg:py-6">
        <div className="px-2">
          <BrandLogo href="/owner" />
        </div>
        <nav aria-label={tx('ড্যাশবোর্ড মেনু', 'Dashboard menu')} className="-mx-1 flex gap-1 overflow-x-auto px-1 lg:flex-col lg:overflow-visible">
          {NAV.map(({ href, bn, en, Icon, chip }) => {
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
          })}
        </nav>
      </aside>
      <main className="min-w-0 flex-1 px-4 pb-12 pt-7 md:px-10">
        <div className="mx-auto flex max-w-[1120px] flex-col gap-[22px]">{children}</div>
      </main>
    </div>
  );
}
