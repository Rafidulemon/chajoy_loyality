'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Cake, Check, Clock, Gift, IceCreamCone, Lock, Sparkles, Zap, type LucideIcon } from 'lucide-react';
import { Button, ButtonLink, PageTitle } from '@/components/ui';
import { errorText } from '@/lib/api/messages';
import { isClaimable, type Offer, type OfferKind } from '@/lib/data';
import { useI18n, type Text } from '@/lib/i18n';
import { useWallet } from '@/lib/wallet';
import { cn } from '@/lib/cn';

const ICON: Record<OfferKind, LucideIcon> = { double: Sparkles, stamp: Check, voucher: Gift, info: IceCreamCone, birthday: Cake };

function OfferCard({ offer }: { offer: Offer }) {
  const { tx, l, n } = useI18n();
  const { claimed, claimOffer } = useWallet();
  const Icon = ICON[offer.kind];
  const done = claimed.includes(offer.id);
  const ends = offer.endsInDays;
  const urgent = ends !== null && ends <= 2;
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Text | null>(null);

  const claim = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await claimOffer(offer);
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  // The offer bar links here with #<offer id>. The router changes the URL without firing :target, so mark the card from the hash.
  const [highlight, setHighlight] = useState(false);
  useEffect(() => {
    if (window.location.hash !== `#${offer.id}`) return;
    setHighlight(true);
    const t = setTimeout(() => setHighlight(false), 2600);
    return () => clearTimeout(t);
  }, [offer.id]);

  const note = 'flex min-h-12 items-center justify-center gap-2 rounded-2xl px-3 text-center font-bold';
  let cta: ReactNode;
  if (offer.kind === 'birthday') {
    cta = (
      <p className={cn(note, 'bg-surface2 text-muted')}>
        <Lock size={18} aria-hidden="true" />
        {tx(`${offer.unlocksOn?.bn ?? ''} তারিখে খুলবে`, `Unlocks ${offer.unlocksOn?.en ?? ''}`)}
      </p>
    );
  } else if (isClaimable(offer)) {
    if (!done)
      cta = (
        <Button onClick={() => void claim()} disabled={busy}>
          {offer.kind === 'stamp' ? tx(`+${n(offer.bonusStamps ?? 1)}টি Stamp নিন`, `Claim +${offer.bonusStamps ?? 1} stamp`) : tx('অফারটি নিন', 'Claim offer')}
        </Button>
      );
    else if (offer.kind === 'voucher')
      cta = <ButtonLink href="/rewards" variant="secondary"><Check size={18} aria-hidden="true" />{tx('Reward-এ দেখুন', 'View in Rewards')}</ButtonLink>;
    else
      cta = <ButtonLink href="/cards" variant="secondary"><Check size={18} aria-hidden="true" />{tx('Stamp যোগ হয়েছে · কার্ড দেখুন', 'Stamp added · View card')}</ButtonLink>;
  } else if (offer.kind === 'double') {
    cta = <p className={cn(note, 'bg-brand-soft text-brand-ink')}><Zap size={18} aria-hidden="true" />{tx('নিজে থেকেই প্রযোজ্য', 'Applies automatically')}</p>;
  } else {
    cta = <p className={cn(note, 'bg-surface2 text-ink')}>{tx('কাউন্টারে দেখান', 'Show at the counter')}</p>;
  }

  return (
    <article id={offer.id} className={cn('flex scroll-mt-28 flex-col overflow-hidden rounded-card border border-line bg-surface transition-shadow duration-500', highlight && 'ring-4 ring-brand', done && 'opacity-80')}>
      <div className="relative flex h-[104px] items-end justify-between overflow-hidden px-4 pb-3" style={{ background: offer.bg, color: offer.fg }}>
        <span aria-hidden="true" className="absolute -right-6 -top-10 size-[120px] rounded-full bg-white/25" />
        <span aria-hidden="true" className="absolute -bottom-12 left-1/3 size-[90px] rounded-full bg-black/10" />
        <span className="relative font-display text-[44px] font-extrabold leading-none">{l(offer.badge)}</span>
        <Icon size={44} strokeWidth={1.8} className="relative opacity-80" aria-hidden="true" />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h2 className="font-display text-xl font-bold leading-tight">{l(offer.title)}</h2>
        <p className="text-[15px] leading-relaxed text-muted">{l(offer.body)}</p>
        {ends !== null && (
          <p className={cn('inline-flex items-center gap-1.5 self-start text-[13px] font-bold', urgent ? 'text-danger' : 'text-muted')}>
            <Clock size={14} aria-hidden="true" />
            {tx(`${n(ends)} দিন বাকি`, `Ends in ${ends} day${ends === 1 ? '' : 's'}`)}
          </p>
        )}
        <details className="text-sm text-muted">
          <summary className="flex min-h-11 cursor-pointer select-none items-center font-bold text-ink">{tx('শর্তাবলী', 'Terms')}</summary>
          <ul className="list-disc space-y-1 pb-2 pl-5">
            {offer.terms.map((t) => <li key={t.en}>{l(t)}</li>)}
          </ul>
        </details>
        <div className="mt-auto pt-1">{cta}</div>
        {problem && <p role="alert" className="text-[13px] font-semibold text-danger">{l(problem)}</p>}
      </div>
    </article>
  );
}

function Group({ id, title, items }: { id: string; title: string; items: Offer[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-lg font-bold">{title}</h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
        {items.map((o) => <OfferCard key={o.id} offer={o} />)}
      </div>
    </section>
  );
}

export default function OffersPage() {
  const { tx, n } = useI18n();
  const { claimed, unclaimed, offers } = useWallet();

  return (
    <>
      <PageTitle
        title={tx('অফার', 'Offers')}
        subtitle={unclaimed > 0 ? tx(`${n(unclaimed)}টি অফার আপনার জন্য অপেক্ষা করছে`, `${unclaimed} offer${unclaimed === 1 ? '' : 's'} waiting for you`) : tx('এখন সব অফার নেওয়া হয়ে গেছে', 'You’ve claimed everything for now')}
      />
      <Group id="for-you" title={tx('আপনার জন্য', 'For you')} items={offers.filter((o) => isClaimable(o) && !claimed.includes(o.id))} />
      <Group id="running" title={tx('চলছে এখন', 'Running now')} items={offers.filter((o) => !isClaimable(o) && o.kind !== 'birthday')} />
      <Group id="coming" title={tx('আসছে', 'Coming up')} items={offers.filter((o) => o.kind === 'birthday')} />
      <Group id="claimed" title={tx('নেওয়া হয়েছে', 'Claimed')} items={offers.filter((o) => isClaimable(o) && claimed.includes(o.id))} />
    </>
  );
}
