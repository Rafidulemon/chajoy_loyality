'use client';

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { Gift, IceCreamCone, Nfc, RotateCw, Sparkles } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { Shop } from '@/lib/data';
import { useI18n } from '@/lib/i18n';
import { BrandIcon } from './brand';
import { cn } from '@/lib/cn';

export function ShopMark({ size = 50 }: { size?: number }) {
  return <BrandIcon size={size} className="shrink-0 rounded-full bg-white" />;
}

/** Fine repeating line pattern, like the security printing on a real card. Light lines on a dark card, dark lines on a light one. */
const guilloche = (dark: boolean) =>
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='44' height='44' viewBox='0 0 44 44'%3E%3Cg fill='none' stroke='${dark ? '%23ffffff' : '%23171717'}' stroke-opacity='${dark ? '.1' : '.07'}' stroke-width='1'%3E%3Ccircle cx='22' cy='22' r='6'/%3E%3Ccircle cx='22' cy='22' r='12'/%3E%3Ccircle cx='22' cy='22' r='18'/%3E%3Ccircle cx='22' cy='22' r='24'/%3E%3C/g%3E%3C/svg%3E")`;

/** Mix a hex colour toward another by `amount` (0 to 1). */
function mix(hex: string, to: string, amount: number) {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(to.slice(1), 16);
  const channel = (shift: number) => Math.round(((a >> shift) & 255) * (1 - amount) + ((b >> shift) & 255) * amount);
  return `#${[16, 8, 0].map((sh) => channel(sh).toString(16).padStart(2, '0')).join('')}`;
}

/** Stamps per row, so the grid stays tidy whatever number of stamps the program asks for. */
function columns(total: number) {
  if (total <= 6) return total;
  if (total <= 8) return 4;
  if (total <= 10) return 5;
  if (total <= 12) return 6;
  if (total <= 14) return 7;
  return Math.ceil(total / 3);
}

/** Slightly different tilt per stamp so they look pressed by hand. */
const TILT = [-7, 5, -3, 8, -5, 3, -8, 6, -2, 7, -6, 4];

/** `fresh` is how many of the newest stamps should play the press animation. */
export function StampGrid({ shop, collected, total, fresh = 0 }: { shop: Shop; collected: number; total: number; fresh?: number }) {
  const { n } = useI18n();
  const cols = columns(total);
  return (
    <div className="relative grid justify-items-center gap-x-2 gap-y-2.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {Array.from({ length: total }, (_, i) => {
        const filled = i < collected;
        const last = i === total - 1;
        const base = 'flex aspect-square w-full max-w-[52px] items-center justify-center rounded-full';
        if (filled) {
          const tilt = TILT[i % TILT.length];
          const isNew = i >= collected - fresh;
          return (
            <span
              key={i}
              className={cn(base, 'relative ring-[3px] ring-black/10 shadow-[0_2px_0_rgba(0,0,0,0.25),inset_0_0_0_3px_rgba(255,255,255,0.14),inset_0_-5px_8px_rgba(0,0,0,0.25)]', isNew && 'animate-stamp-press')}
              style={{ background: shop.stampBg, color: shop.stampFg, transform: `rotate(${tilt}deg)`, '--tilt': `${tilt}deg`, animationDelay: isNew ? `${(i - (collected - fresh)) * 160}ms` : undefined } as CSSProperties}
            >
              {isNew && <span aria-hidden="true" className="pointer-events-none absolute inset-0 animate-stamp-ring rounded-full border-2 border-[#F5D900]" />}
              <IceCreamCone size={22} strokeWidth={2.4} aria-hidden="true" />
              <span className="sr-only">{n(i + 1)}</span>
            </span>
          );
        }
        if (last)
          return (
            <span key={i} className={cn(base, 'bg-gradient-to-br from-white to-[#fff3a0] text-[#171717] shadow-[0_2px_0_rgba(0,0,0,0.2),0_0_0_3px_rgba(245,217,0,0.9)]')}>
              <Gift size={22} strokeWidth={2.2} aria-hidden="true" />
            </span>
          );
        return (
          <span
            key={i}
            className={cn(
              base,
              'text-[14px] font-bold',
              shop.dark
                ? 'bg-white/10 text-white/50 shadow-[inset_0_3px_5px_rgba(0,0,0,0.45),0_1px_0_rgba(255,255,255,0.12)]'
                : 'bg-black/[0.12] text-black/45 shadow-[inset_0_3px_5px_rgba(0,0,0,0.28),0_1px_0_rgba(255,255,255,0.45)]',
            )}
          >
            {n(i + 1)}
          </span>
        );
      })}
    </div>
  );
}

export function LoyaltyCard({
  shop,
  collected = shop.collected,
  fresh = 0,
  memberName,
  memberId,
  children,
  as: Tag = 'section',
}: {
  shop: Shop;
  collected?: number;
  /** Number of newest stamps that should animate. */
  fresh?: number;
  memberName?: string;
  memberId?: string;
  children?: ReactNode;
  as?: 'section' | 'div';
}) {
  const { l, n, tx } = useI18n();
  const total = shop.total;
  const rem = total - collected;
  const ready = rem <= 0;
  const reward = l(shop.reward);
  const flippable = Boolean(memberId);

  const [flipped, setFlipped] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0, gx: 30, gy: 20 });
  const [still, setStill] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const q = window.matchMedia('(prefers-reduced-motion: reduce)');
    setStill(q.matches);
    const on = () => setStill(q.matches);
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);

  const onMove = (e: PointerEvent<HTMLElement>) => {
    if (still || e.pointerType === 'touch' || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    setTilt({ x: (0.5 - py) * 10, y: (px - 0.5) * 12, gx: px * 100, gy: py * 100 });
  };
  const onLeave = () => setTilt({ x: 0, y: 0, gx: 30, gy: 20 });

  const face = 'col-start-1 row-start-1 relative flex flex-col overflow-hidden rounded-[26px] [backface-visibility:hidden] [-webkit-backface-visibility:hidden]';
  const surface: CSSProperties = {
    background: `radial-gradient(120% 90% at 0% 0%, rgba(255,255,255,${shop.dark ? 0.16 : 0.38}), transparent 55%), linear-gradient(135deg, ${mix(shop.color, '#ffffff', shop.dark ? 0.14 : 0.32)} 0%, ${shop.color} 45%, ${mix(shop.color, '#000000', 0.2)} 100%)`,
    color: shop.fg,
  };
  const shine: CSSProperties = {
    background: `radial-gradient(420px circle at ${tilt.gx}% ${tilt.gy}%, rgba(255,255,255,0.45), transparent 45%)`,
    mixBlendMode: 'soft-light',
  };
  const empty = !flippable;

  const content = (
    <div className="relative mx-auto w-full max-w-[520px] [perspective:1100px] drop-shadow-[0_18px_22px_rgba(23,23,23,0.28)]">
      <button
        ref={ref}
        type="button"
        disabled={empty}
        onClick={() => setFlipped((f) => !f)}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        aria-pressed={flipped}
        aria-label={tx('কার্ড উল্টান — QR কোড দেখুন', 'Flip the card to show your QR code')}
        className="grid w-full min-h-[212px] sm:aspect-[1.586/1] text-left [transform-style:preserve-3d] focus-visible:rounded-[26px] disabled:cursor-default"
        style={{
          transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y + (flipped ? 180 : 0)}deg)`,
          transition: tilt.x === 0 && tilt.y === 0 ? 'transform 700ms cubic-bezier(.2,.8,.2,1)' : 'transform 120ms ease-out',
        }}
      >
        {/* Front */}
        <span className={cn(face, 'gap-2.5 p-4 sm:p-5')} style={surface} aria-hidden={flipped}>
          <span aria-hidden="true" className="absolute inset-0" style={{ backgroundImage: guilloche(shop.dark), backgroundSize: '44px 44px', maskImage: 'linear-gradient(120deg, black, transparent 70%)', WebkitMaskImage: 'linear-gradient(120deg, black, transparent 70%)' }} />
          <span aria-hidden="true" className="absolute -right-10 -top-14 size-[150px] rounded-full opacity-95" style={{ background: shop.deco1 }} />
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[26px] ring-1 ring-inset ring-white/45" />
          <span aria-hidden="true" className="pointer-events-none absolute inset-0" style={shine} />

          <span className="relative flex shrink-0 items-center gap-2.5">
            <ShopMark size={38} />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block font-display text-[21px] font-extrabold">{l(shop.name)}</span>
              <span className="block truncate text-[10.5px] font-bold uppercase tracking-[0.16em] opacity-70">{l(shop.cardName)}</span>
            </span>
            <Nfc size={20} className="opacity-60" aria-hidden="true" />
            <span className="whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-extrabold" style={{ background: shop.stampBg, color: shop.stampFg }}>
              {n(Math.min(collected, total))}/{n(total)}
            </span>
          </span>

          <span className="relative my-auto block shrink-0">
            <StampGrid shop={shop} collected={collected} total={total} fresh={fresh} />
          </span>

          <span className="relative flex shrink-0 items-end justify-between gap-3">
            <span className="min-w-0">
              <span className="block truncate text-[10px] font-bold uppercase tracking-[0.14em] opacity-65">{memberName ?? tx('সদস্য', 'Member')}</span>
              <span className="block font-mono text-[15px] font-bold tracking-[0.18em] [text-shadow:0_1px_0_rgba(255,255,255,0.45)]">{memberId ? memberId.replace('-', ' ') : '•••• ••••'}</span>
            </span>
            {ready ? (
              <span className="inline-flex shrink-0 animate-pulse items-center gap-1 rounded-full bg-[#F5D900] px-3 py-1 text-[13px] font-extrabold text-[#171717] shadow-[0_2px_0_rgba(0,0,0,0.25)]">
                <Sparkles size={14} aria-hidden="true" />
                {tx('Reward আনলক', 'Reward unlocked')}
              </span>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 text-[13px] font-extrabold text-[#171717] backdrop-blur">
                <Gift size={14} aria-hidden="true" />
                {tx(`আর ${n(rem)}টি`, `${rem} to go`)}
              </span>
            )}
          </span>
        </span>

        {/* Back */}
        <span className={cn(face, '[transform:rotateY(180deg)]')} style={surface} aria-hidden={!flipped}>
          <span aria-hidden="true" className="absolute inset-0" style={{ backgroundImage: guilloche(shop.dark), backgroundSize: '44px 44px' }} />
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[26px] ring-1 ring-inset ring-white/45" />
          <span aria-hidden="true" className="pointer-events-none absolute inset-0" style={shine} />
          <span aria-hidden="true" className="relative mt-4 block h-9 bg-[#171717] shadow-[0_2px_0_rgba(255,255,255,0.25)] ring-1 ring-white/15 sm:mt-5" />
          <span className="relative flex flex-1 items-center gap-3.5 px-4 pb-3 pt-2.5 sm:px-5">
            <span className="rounded-2xl bg-white p-2 shadow-[0_3px_0_rgba(0,0,0,0.2)]">
              <QRCodeSVG value={`chajoy:customer:${memberId ?? ''}`} size={92} fgColor="#171717" bgColor="#FFFFFF" level="M" title={tx('আমার QR কোড', 'My QR code')} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-[15px] font-extrabold leading-snug">{tx('কাউন্টারে এই QR দেখান', 'Show this at the counter')}</span>
              <span className="text-[12px] font-medium leading-snug opacity-80">{tx(`${n(total)}টি Stamp = ${shop.reward.bn}`, `${total} stamps = ${shop.reward.en}`)}</span>
              <span className="mt-0.5 rounded-lg bg-white/70 px-2 py-1 font-mono text-[13px] font-bold tracking-[0.16em]">{memberId ?? ''}</span>
            </span>
          </span>
          <span className="relative flex items-center justify-between gap-2 px-4 pb-3 text-[10.5px] font-bold uppercase tracking-[0.14em] opacity-70 sm:px-5">
            <span>{tx('সব আউটলেটে চলবে', 'Valid at all outlets')}</span>
            <span className="inline-flex items-center gap-1"><RotateCw size={12} aria-hidden="true" />{tx('উল্টান', 'Tap to flip')}</span>
          </span>
        </span>
      </button>
      {flippable && (
        <span className="sr-only" aria-live="polite">
          {ready ? tx('Reward আনলক হয়েছে!', 'Reward unlocked!') : tx(`আর ${n(rem)}টি Stamp পেলেই ${reward}`, `${rem} more stamp${rem > 1 ? 's' : ''} for a ${reward}`)}
        </span>
      )}
    </div>
  );

  return (
    <Tag aria-label={l(shop.name)} className="flex flex-col gap-3.5">
      {content}
      <div className="mx-auto flex w-full max-w-[520px] flex-col gap-2">
        <div role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.min(collected, total)} aria-label={tx('কার্ডের অগ্রগতি', 'Card progress')} className="flex gap-1">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={cn('h-2 flex-1 rounded-full', i < collected ? 'bg-brand-dark' : 'bg-line2')} />
          ))}
        </div>
        <p className="text-[17px] font-bold">
          {ready
            ? tx('কার্ড সম্পূর্ণ! আপনার Reward এখন Reward ট্যাবে', 'Card complete! Your reward is now in Rewards')
            : tx(`আর ${n(rem)}টি Stamp পেলেই ${reward}!`, `${rem} more stamp${rem > 1 ? 's' : ''} for a ${reward}!`)}
        </p>
        <p className="text-sm text-muted">{tx(`Reward: ${shop.reward.bn}`, `Reward: ${shop.reward.en}`)}</p>
        {children && <div className="pt-1">{children}</div>}
      </div>
    </Tag>
  );
}
