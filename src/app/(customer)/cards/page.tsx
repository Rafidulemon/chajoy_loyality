'use client';

import Link from 'next/link';
import { ChevronRight, Gift, Tag } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { LoyaltyCard } from '@/components/loyalty-card';
import { Card, CardTitle, IconChip } from '@/components/ui';
import { useHistory } from '@/lib/api/history';
import { useProgram } from '@/lib/api/program';
import { useI18n } from '@/lib/i18n';
import { useCardView, useMemberQr, useWallet } from '@/lib/wallet';

export default function CardsPage() {
  const { tx, l, n } = useI18n();
  const { me, memberCode, readyVouchers, unclaimed } = useWallet();
  const { collected, fresh } = useCardView();
  const shop = useProgram();
  const qr = useMemberQr();
  const { items, loading } = useHistory(5);
  const recent = items.slice(0, 3);
  const soonest = readyVouchers.length ? Math.min(...readyVouchers.map((v) => v.daysLeft)) : Infinity;
  const first = (me?.name ?? '').trim().split(' ')[0];

  return (
    <>
      <div>
        <h1 className="font-display text-[clamp(26px,4vw,36px)] font-bold leading-tight">{first ? tx(`হ্যালো, ${first}`, `Hi, ${first}`) : tx('হ্যালো!', 'Hello!')}</h1>
        <p className="text-[15px] text-muted">{tx('আপনার চা জয় লয়্যালটি কার্ড', 'Your ChaJoy loyalty card')}</p>
      </div>

      <div className="flex flex-wrap items-stretch gap-[18px]">
        <div className="min-w-0 flex-[3_1_340px]">
          <LoyaltyCard shop={shop} collected={collected} fresh={fresh} memberName={me?.name ?? undefined} memberId={memberCode} qrValue={qr}>
            <Link href="/cards/details" className="inline-flex min-h-11 items-center gap-1.5 rounded-full border-[1.5px] border-line2 bg-surface px-4 text-[15px] font-bold">
              {tx('কার্ডের বিস্তারিত', 'Card details')}
              <ChevronRight size={18} aria-hidden="true" />
            </Link>
          </LoyaltyCard>
        </div>
        <Card className="flex min-w-0 flex-[2_1_280px] flex-col items-center justify-center gap-3.5 rounded-hero text-center">
          <div>
            <h2 className="text-lg font-bold">{tx('Stamp নিতে QR কোডটি দেখান', 'Show this QR to get a stamp')}</h2>
            <p className="mt-1 text-sm text-muted">{tx('ক্যাশিয়ার স্ক্যান করলেই Stamp যোগ হবে', 'The cashier scans it and your stamp is added')}</p>
          </div>
          <div className="rounded-[20px] border-4 border-tangerine bg-white p-3">
            {qr ? (
              <QRCodeSVG value={qr} size={164} fgColor="#171717" bgColor="#FFFFFF" level="M" title={tx('আমার QR কোড', 'My QR code')} />
            ) : (
              <div role="status" aria-label={tx('QR কোড তৈরি হচ্ছে', 'Preparing your QR code')} className="size-[164px] animate-pulse rounded-xl bg-surface2" />
            )}
          </div>
          <p className="text-sm text-muted">
            {tx('গ্রাহক ID', 'Customer ID')}: <span className="font-mono font-bold tracking-wider text-ink">{memberCode}</span>
          </p>
          <p className="max-w-[260px] text-[12.5px] text-muted">{tx('নিরাপত্তার জন্য এই QR প্রতি মিনিটে নতুন হয়। স্ক্রিনশট কাজ করবে না।', 'For your safety this QR renews every minute, so a screenshot will not work.')}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link href="/rewards" className="flex items-center gap-3 rounded-[20px] border border-line bg-surface p-3.5 hover:bg-surface2">
          <IconChip color="#97C334" size={46}><Gift size={22} aria-hidden="true" /></IconChip>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] text-muted">{tx('ব্যবহারের জন্য রেডি Reward', 'Rewards ready to use')}</span>
            <span className="block font-display text-[26px] font-bold leading-tight">{n(readyVouchers.length)}</span>
            {readyVouchers.length > 0 && soonest <= 3 && (
              <span className="block text-[12.5px] font-bold text-danger">{tx(`একটি ${n(soonest)} দিনে শেষ হবে`, `One ends in ${soonest} day${soonest === 1 ? '' : 's'}`)}</span>
            )}
          </span>
          <ChevronRight size={20} className="text-muted" aria-hidden="true" />
        </Link>
        <Link href="/offers" className="flex items-center gap-3 rounded-[20px] border border-line bg-surface p-3.5 hover:bg-surface2">
          <IconChip color="#F5D900" size={46}><Tag size={22} aria-hidden="true" /></IconChip>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] text-muted">{tx('নেওয়ার অপেক্ষায় অফার', 'Offers to claim')}</span>
            <span className="block font-display text-[26px] font-bold leading-tight">{n(unclaimed)}</span>
          </span>
          <ChevronRight size={20} className="text-muted" aria-hidden="true" />
        </Link>
      </div>

      <Card>
        <CardTitle action={<Link href="/history" className="text-sm font-bold">{tx('সব দেখুন', 'See all')}</Link>}>{tx('সাম্প্রতিক', 'Recent activity')}</CardTitle>
        {loading ? (
          <div role="status" aria-label={tx('লোড হচ্ছে', 'Loading')} className="flex flex-col gap-3 py-2">
            {[0, 1, 2].map((i) => <div key={i} className="h-11 animate-pulse rounded-xl bg-surface2" />)}
          </div>
        ) : recent.length === 0 ? (
          <p className="py-2 text-sm text-muted">{tx('এখনো কিছু নেই। প্রথম Stamp নিতে যেকোনো আউটলেটে QR দেখান।', 'Nothing yet. Show your QR at any ChaJoy outlet to get your first stamp.')}</p>
        ) : (
          <ul>
            {recent.map((h, i) => {
              const chip = h.type === 'stamp' ? '#F5D900' : h.type === 'reward' ? '#FF8A9A' : '#8FE3D8';
              return (
                <li key={i} className="flex items-center gap-3 py-2">
                  <IconChip color={chip}>{h.type === 'stamp' ? ((h.count ?? 1) < 0 ? '−' : '+') : h.type === 'reward' ? '★' : '✓'}</IconChip>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold">{l(h.detail)}</span>
                    <span className="block text-[13px] text-muted">{l(h.group)}, {l(h.time)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
