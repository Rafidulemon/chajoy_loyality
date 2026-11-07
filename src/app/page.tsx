'use client';

import Link from 'next/link';
import { ScanLine, Store, Smartphone } from 'lucide-react';
import { BrandLogo } from '@/components/brand';
import { Toggles } from '@/components/toggles';
import { useI18n } from '@/lib/i18n';

export default function Home() {
  const { tx } = useI18n();
  const apps = [
    { href: '/login', Icon: Smartphone, color: '#97C334', fg: '#171717', title: tx('গ্রাহক অ্যাপ', 'Customer app'), body: tx('কার্ড দেখা, QR দেখিয়ে Stamp নেওয়া, Reward', 'See cards, show QR for stamps, claim rewards') },
    { href: '/cashier/scan', Icon: ScanLine, color: '#F5D900', fg: '#171717', title: tx('ক্যাশিয়ার', 'Cashier'), body: tx('গ্রাহকের QR স্ক্যান করে Stamp ও Reward দেওয়া', 'Scan customer QR codes, give stamps and rewards') },
    { href: '/owner', Icon: Store, color: '#FF5D73', fg: '#171717', title: tx('ম্যানেজমেন্ট', 'Management'), body: tx('গ্রাহক, কার্ড, স্টাফ ও SMS', 'Customers, card setup, staff and SMS') },
  ];
  return (
    <div className="mx-auto flex min-h-dvh max-w-[1120px] flex-col gap-10 px-4 py-6 md:px-10">
      <header className="flex items-center justify-between gap-3">
        <BrandLogo />
        <Toggles />
      </header>
      <main className="flex flex-col gap-8">
        <div className="max-w-2xl">
          <h1 className="font-display text-[clamp(32px,5vw,52px)] font-extrabold leading-[1.1]">{tx('প্রতি ভিজিটে Stamp, প্রতি কার্ডে Reward', 'A stamp every visit, a reward every card')}</h1>
          <p className="mt-3 text-lg text-muted">{tx('কোন অ্যাপটি খুলবেন বেছে নিন।', 'Choose which app to open.')}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {apps.map(({ href, Icon, color, fg, title, body }) => (
            <Link key={href} href={href} className="group flex flex-col gap-4 rounded-hero border border-line bg-surface p-6 hover:border-line2">
              <span className="flex size-14 items-center justify-center rounded-2xl" style={{ background: color, color: fg }}>
                <Icon size={28} aria-hidden="true" />
              </span>
              <span className="font-display text-2xl font-bold">{title}</span>
              <span className="text-muted">{body}</span>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
