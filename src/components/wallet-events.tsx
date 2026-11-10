'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Check, Gift } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui';
import type { Voucher } from '@/lib/data';
import { useI18n } from '@/lib/i18n';
import { useProgram } from '@/lib/api/program';
import { useWallet } from '@/lib/wallet';

const CONFETTI = ['#97C334', '#F5D900', '#FF5D73', '#171717', '#668C1F'];

/** Dialog shown when a completed card turns into a reward voucher. */
function UnlockDialog({ voucher, onClose }: { voucher: Voucher; onClose: () => void }) {
  const { tx, l } = useI18n();
  const ref = useRef<HTMLDivElement>(null);

  const pieces = useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 500,
        dx: Math.round((Math.random() - 0.5) * 120),
        w: 6 + Math.round(Math.random() * 6),
        h: 8 + Math.round(Math.random() * 8),
        color: CONFETTI[i % CONFETTI.length],
        round: i % 3 === 0,
      })),
    [],
  );

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('a[href]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      if (e.key !== 'Tab' || !ref.current) return;
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>('a[href], button'));
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="unlock-title" className="relative w-full max-w-[400px] animate-pop-in overflow-hidden rounded-hero bg-surface p-6 text-center">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden">
          {pieces.map((p, i) => (
            <span
              key={i}
              className="absolute top-0 animate-confetti"
              style={{ left: `${p.left}%`, width: p.w, height: p.h, background: p.color, borderRadius: p.round ? 999 : 2, animationDelay: `${p.delay}ms`, '--dx': `${p.dx}px` } as CSSProperties}
            />
          ))}
        </div>
        <span className="relative mx-auto flex size-20 items-center justify-center rounded-full bg-[#F5D900] text-[#171717] shadow-[0_5px_0_rgba(0,0,0,0.18)] ring-8 ring-brand">
          <Gift size={38} aria-hidden="true" />
        </span>
        <h2 id="unlock-title" className="relative mt-5 font-display text-[28px] font-extrabold leading-tight">{tx('Reward আনলক হয়েছে!', 'Reward unlocked!')}</h2>
        <p className="relative mt-2 text-lg font-bold">{l(voucher.title)}</p>
        <p className="relative mt-1 text-sm text-muted">
          {tx(`মেয়াদ ${voucher.expires.bn} পর্যন্ত · সব আউটলেটে চলবে`, `Valid until ${voucher.expires.en} · at every outlet`)}
        </p>
        <p className="relative mt-3 rounded-2xl bg-brand-soft px-3 py-2 text-sm font-semibold text-brand-ink">{tx('আপনার নতুন কার্ড শুরু হয়ে গেছে', 'Your new card has already started')}</p>
        <div className="relative mt-5 flex flex-col gap-2.5">
          <ButtonLink href={`/rewards/${voucher.id}`} size="lg" onClick={onClose}>{tx('Reward দেখুন', 'View reward')}</ButtonLink>
          <Button variant="secondary" onClick={onClose}>{tx('পরে', 'Later')}</Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Listens for wallet changes and shows a "+1 stamp" toast and the reward-unlocked dialog.
 * Mounted once in the customer shell so it works on every customer page.
 */
export function WalletEvents() {
  const { tx, n } = useI18n();
  const { pulse, unlocked, vouchers, dismissUnlock } = useWallet();
  const shop = useProgram();
  const [toast, setToast] = useState<{ count: number; left: number } | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Ignore a stamp that landed a while ago, e.g. when this shell mounts after navigating from another app.
    if (!pulse || Date.now() - pulse.at > 8000) return;
    // Browsers block vibration until the user has touched the page, and log an error if it is tried earlier.
    if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.([18, 40, 18]);
    if (pulse.filled) return;
    setToast({ count: pulse.count, left: shop.total - pulse.after });
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [pulse]);

  // Wait for the last stamp to finish pressing before the dialog covers the card.
  useEffect(() => {
    if (!unlocked) return setOpen(false);
    const t = setTimeout(() => setOpen(true), 1900);
    return () => clearTimeout(t);
  }, [unlocked]);

  const voucher = vouchers.find((v) => v.id === unlocked);

  return (
    <>
      {toast && (
        <div role="status" className="pointer-events-none fixed inset-x-0 bottom-[92px] z-40 flex justify-center px-4 md:bottom-8">
          <div className="flex animate-pop-in items-center gap-3 rounded-full bg-[#171717] py-2 pl-2 pr-5 text-white shadow-[0_12px_24px_rgba(0,0,0,0.3)] ring-1 ring-white/20">
            <span className="flex size-9 items-center justify-center rounded-full bg-[#F5D900] text-[#171717]"><Check size={20} strokeWidth={3} aria-hidden="true" /></span>
            <span className="font-bold">
              {tx(`+${n(toast.count)}টি Stamp!`, `+${toast.count} stamp${toast.count > 1 ? 's' : ''}!`)}
              <span className="font-medium opacity-80"> · {tx(`আর ${n(toast.left)}টি বাকি`, `${toast.left} to go`)}</span>
            </span>
          </div>
        </div>
      )}
      {open && voucher && <UnlockDialog voucher={voucher} onClose={dismissUnlock} />}
    </>
  );
}
