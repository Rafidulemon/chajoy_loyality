'use client';

import Link from 'next/link';
import { Clock, IceCreamCone } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { Voucher } from '@/lib/data';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/cn';

/** The text encoded in a voucher's QR code. The cashier app resolves it to the voucher. */
export const voucherQr = (v: Voucher) => `chajoy:voucher:${v.code}`;

/** Days left at or below this count as urgent. */
export const URGENT_DAYS = 3;

export function useDaysText() {
  const { tx, n } = useI18n();
  return (d: number) => tx(`${n(d)} দিন`, `${d} day${d === 1 ? '' : 's'}`);
}

/** A reward voucher drawn as a perforated ticket. Ready vouchers show their QR, used and expired ones are muted. */
export function VoucherTicket({ voucher: v, href }: { voucher: Voucher; href?: string }) {
  const { tx, l } = useI18n();
  const days = useDaysText();
  const ready = v.status === 'ready';
  const urgent = ready && v.daysLeft <= URGENT_DAYS;

  const status = ready ? (
    urgent ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#F5D900] px-2.5 py-0.5 text-[12.5px] font-extrabold text-[#171717]">
        <Clock size={13} aria-hidden="true" />
        {tx(`${days(v.daysLeft)} বাকি`, `Ends in ${days(v.daysLeft)}`)}
      </span>
    ) : (
      tx(`মেয়াদ ${v.expires.bn} পর্যন্ত`, `Valid until ${v.expires.en}`)
    )
  ) : v.status === 'used' ? (
    tx(`${v.usedOn?.bn ?? ''} তারিখে ব্যবহার করা হয়েছে`, `Used on ${v.usedOn?.en ?? ''}`)
  ) : (
    tx(`${v.expires.bn} তারিখে মেয়াদ শেষ`, `Expired on ${v.expires.en}`)
  );

  const ticket = (
    <div
      className={cn('relative flex min-h-[136px] overflow-hidden rounded-[22px]', ready ? 'text-[#171717] shadow-[0_10px_18px_rgba(23,23,23,0.16)]' : 'border border-line bg-surface2 text-muted')}
      style={ready ? { background: 'radial-gradient(120% 90% at 0% 0%, rgba(255,255,255,0.38), transparent 55%), linear-gradient(135deg, #b9de63 0%, #97C334 50%, #7ea526 100%)' } : undefined}
    >
      <div className="relative flex min-w-0 flex-1 flex-col justify-between gap-2 p-4">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] opacity-70">{tx('Reward ভাউচার', 'Reward voucher')}</p>
          <h3 className="mt-1 flex items-start gap-2 font-display text-[20px] font-extrabold leading-tight">
            <IceCreamCone size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0">{l(v.title)}</span>
          </h3>
          <p className="mt-0.5 text-[13px] opacity-80">{l(v.source)}</p>
        </div>
        <p className="text-[13px] font-bold">{status}</p>
      </div>

      <div aria-hidden="true" className={cn('relative w-0 self-stretch border-l-2 border-dashed', ready ? 'border-black/30' : 'border-line2')}>
        <span className="absolute -left-3 -top-3 size-6 rounded-full bg-bg" />
        <span className="absolute -bottom-3 -left-3 size-6 rounded-full bg-bg" />
      </div>

      <div className="flex w-[112px] shrink-0 items-center justify-center p-3">
        {ready ? (
          <span aria-hidden="true" className="rounded-xl bg-white p-1.5 shadow-[0_2px_0_rgba(0,0,0,0.2)]">
            <QRCodeSVG value={voucherQr(v)} size={76} fgColor="#171717" bgColor="#FFFFFF" level="M" />
          </span>
        ) : (
          <span className="-rotate-[8deg] rounded-lg border-2 border-current px-2 py-1 text-[13px] font-extrabold uppercase tracking-wider">
            {v.status === 'used' ? tx('ব্যবহৃত', 'Used') : tx('মেয়াদ শেষ', 'Expired')}
          </span>
        )}
      </div>
    </div>
  );

  if (!href) return ticket;
  return (
    <Link href={href} className="block rounded-[22px] transition-transform hover:-translate-y-0.5">
      {ticket}
    </Link>
  );
}
