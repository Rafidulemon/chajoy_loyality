'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Pause, Play, X } from 'lucide-react';
import { isClaimable, type Offer } from '@/lib/data';
import { useI18n } from '@/lib/i18n';
import { useWallet } from '@/lib/wallet';
import { cn } from '@/lib/cn';

/** Milliseconds each offer stays on screen. */
const INTERVAL = 5500;

/** Glossy lime gradient: a bright glass highlight over the top half, a darker edge below it. */
export const GLOSS: CSSProperties = {
  background:
    'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.2) 49%, rgba(255,255,255,0) 50%, rgba(0,0,0,0.07) 100%), linear-gradient(100deg, #cdeb82 0%, #97C334 48%, #7fa62a 100%)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8), inset 0 -2px 0 rgba(0,0,0,0.12)',
};

/** What one offer looks like in the bar: badge, text, time left and a Claim or View pill. */
export function OfferSlideBody({ offer: o }: { offer: Offer }) {
  const { tx, l, n } = useI18n();
  const days = o.endsInDays;
  return (
    <>
      <span
        className="min-w-[46px] shrink-0 rounded-xl px-2 py-1.5 text-center font-display text-[17px] font-extrabold leading-none shadow-[0_2px_0_rgba(0,0,0,0.2)] ring-2 ring-white/60 sm:min-w-[54px] sm:px-2.5"
        style={{ background: o.bg, color: o.fg }}
      >
        {l(o.badge)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-[15px] font-extrabold leading-tight sm:text-[16px]">{l(o.title)}</span>
        <span className="block truncate text-[13px] font-medium opacity-85">{l(o.body)}</span>
      </span>
      {days !== null && (
        <span className="hidden shrink-0 rounded-full bg-white/55 px-2.5 py-0.5 text-[12.5px] font-bold sm:inline-flex">
          {tx(`${n(days)} দিন বাকি`, `Ends in ${days} day${days === 1 ? '' : 's'}`)}
        </span>
      )}
      <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[#171717] py-1 pl-2.5 pr-1.5 text-[13px] font-extrabold text-white sm:pl-3 sm:pr-2">
        {isClaimable(o) ? tx('নিন', 'Claim') : tx('দেখুন', 'View')}
        <ChevronRight size={15} aria-hidden="true" />
      </span>
    </>
  );
}

/**
 * Announcement bar under the customer header: a slider of the offers the customer can still use.
 * It rotates by itself, pauses on hover, focus or touch, and can be swiped, stepped with arrows or hidden.
 */
export function OfferBar({ onDismiss }: { onDismiss: () => void }) {
  const { tx, n } = useI18n();
  const { claimed, offers } = useWallet();

  // Offers to claim come first, then the rest by how soon they end. Locked and already claimed offers are left out.
  const slides = useMemo(
    () =>
      offers
        .filter((o) => o.kind !== 'birthday' && !(isClaimable(o) && claimed.includes(o.id)))
        .sort((a, b) => Number(isClaimable(b)) - Number(isClaimable(a)) || (a.endsInDays ?? 99) - (b.endsInDays ?? 99)),
    [offers, claimed],
  );
  const count = slides.length;

  // `dir` is which way the last change went, so the new offer slides in from that side (0 = first paint, no animation).
  const [pos, setPos] = useState({ index: 0, dir: 0 });
  const [paused, setPaused] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [focused, setFocused] = useState(false);
  const [still, setStill] = useState(false);
  const startX = useRef<number | null>(null);

  const safe = count ? Math.min(pos.index, count - 1) : 0;
  const rotating = count > 1 && !paused && !hovering && !focused && !still;

  useEffect(() => {
    const q = window.matchMedia('(prefers-reduced-motion: reduce)');
    setStill(q.matches);
    const on = () => setStill(q.matches);
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);

  // `safe` is a dependency so stepping by hand restarts the timer.
  useEffect(() => {
    if (!rotating) return;
    const id = setInterval(() => setPos((p) => ({ index: (Math.min(p.index, count - 1) + 1) % count, dir: 1 })), INTERVAL);
    return () => clearInterval(id);
  }, [rotating, count, safe]);

  if (count === 0) return null;

  const go = (i: number, dir: 1 | -1) => setPos({ index: ((i % count) + count) % count, dir });
  const icon = 'flex shrink-0 items-center justify-center rounded-full hover:bg-black/10 focus-visible:outline-[#171717]';

  return (
    <section
      aria-roledescription="carousel"
      aria-label={tx('বিশেষ অফার', 'Special offers')}
      className="relative isolate overflow-hidden border-b border-black/10 text-[#171717]"
      style={GLOSS}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHovering(true)}
      onPointerLeave={() => setHovering(false)}
      // Only keyboard focus pauses the slider. Clicking an arrow with the mouse leaves focus on it, and that should not freeze the rotation.
      onFocus={(e) => setFocused(e.target.matches(':focus-visible'))}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
      onKeyDown={(e) => {
        if (count < 2) return;
        if (e.key === 'ArrowRight') go(safe + 1, 1);
        if (e.key === 'ArrowLeft') go(safe - 1, -1);
      }}
    >
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 -z-10 w-1/4 animate-sheen bg-gradient-to-r from-transparent via-white/50 to-transparent" />

      <div className="mx-auto flex w-full max-w-[1120px] items-center gap-1 px-2 md:gap-2 md:px-8">
        {count > 1 && (
          <button type="button" onClick={() => go(safe - 1, -1)} aria-label={tx('আগের অফার', 'Previous offer')} className={cn(icon, 'hidden size-9 md:flex')}>
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
        )}

        <div
          className="min-w-0 flex-1 touch-pan-y overflow-hidden"
          onPointerDown={(e) => {
            if (e.pointerType === 'mouse') return;
            startX.current = e.clientX;
            setHovering(true);
          }}
          onPointerUp={(e) => {
            const from = startX.current;
            startX.current = null;
            setHovering(false);
            if (from !== null && Math.abs(e.clientX - from) > 40) go(e.clientX < from ? safe + 1 : safe - 1, e.clientX < from ? 1 : -1);
          }}
          onPointerCancel={() => {
            startX.current = null;
            setHovering(false);
          }}
        >
          <div className="grid grid-cols-[minmax(0,1fr)]" aria-live={rotating ? 'off' : 'polite'}>
            {slides.map((o, i) => {
              return (
                <div
                  key={o.id}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={tx(`${n(i + 1)} / ${n(count)}`, `${i + 1} of ${count}`)}
                  aria-hidden={i !== safe}
                  inert={i !== safe}
                  className={cn(
                    'col-start-1 row-start-1 transition-opacity duration-300',
                    i === safe ? cn('opacity-100', pos.dir > 0 && 'animate-bar-in-right', pos.dir < 0 && 'animate-bar-in-left') : 'pointer-events-none opacity-0',
                  )}
                >
                  <Link href={`/offers#${o.id}`} className="flex min-h-[58px] items-center gap-2.5 rounded-xl px-2 pb-3.5 pt-2 focus-visible:outline-[#171717] sm:gap-3 md:pb-2">
                    <OfferSlideBody offer={o} />
                  </Link>
                </div>
              );
            })}
          </div>
        </div>

        {count > 1 && (
          <>
            <div className="hidden items-center md:flex">
              {slides.map((o, i) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => go(i, i > safe ? 1 : -1)}
                  aria-label={tx(`${n(i + 1)} নম্বর অফারে যান`, `Go to offer ${i + 1}`)}
                  aria-current={i === safe}
                  className="flex size-6 items-center justify-center rounded-full focus-visible:outline-[#171717]"
                >
                  <span className={cn('h-1.5 rounded-full bg-[#171717] transition-all', i === safe ? 'w-4 opacity-85' : 'w-1.5 opacity-35')} />
                </button>
              ))}
            </div>
            <button type="button" onClick={() => go(safe + 1, 1)} aria-label={tx('পরের অফার', 'Next offer')} className={cn(icon, 'hidden size-9 md:flex')}>
              <ChevronRight size={20} aria-hidden="true" />
            </button>
            {!still && (
              <button
                type="button"
                onClick={() => setPaused((p) => !p)}
                aria-label={paused ? tx('স্লাইডার চালান', 'Play offers') : tx('স্লাইডার থামান', 'Pause offers')}
                className={cn(icon, 'hidden size-9 md:flex')}
              >
                {paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
              </button>
            )}
          </>
        )}

        <button type="button" onClick={onDismiss} aria-label={tx('অফার বার বন্ধ করুন', 'Hide the offers bar')} className={cn(icon, 'size-10')}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      {count > 1 && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-center gap-1 md:hidden">
          {slides.map((o, i) => (
            <span key={o.id} className={cn('h-1 rounded-full bg-[#171717] transition-all', i === safe ? 'w-4 opacity-80' : 'w-1 opacity-30')} />
          ))}
        </div>
      )}
    </section>
  );
}
