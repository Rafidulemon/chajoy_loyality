'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Clock, Copy, LocateFixed, MapPin, Navigation, Search } from 'lucide-react';
import { Badge, Button, ButtonLink, Notice, PageTitle, inputClass } from '@/components/ui';
import { useBranches } from '@/lib/api/branches';
import type { Branch } from '@/lib/data';
import { dhakaMinuteOfDay } from '@/lib/domain/time';
import { hour12 as hour } from '@/lib/hours';
import { useI18n } from '@/lib/i18n';

type Geo = 'idle' | 'loading' | 'ok' | 'denied' | 'unsupported';
type Point = { lat: number; lng: number };

/** Straight-line distance in kilometres (haversine). */
function distance(a: Point, b: Point) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

export default function OutletsPage() {
  const { tx, l, n } = useI18n();
  const [query, setQuery] = useState('');
  const [geo, setGeo] = useState<Geo>('idle');
  const [pos, setPos] = useState<Point | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [copied, setCopied] = useState('');
  const { branches, loading } = useBranches();
  const hours = Object.fromEntries(branches.map((b) => [b.id, b.hours]));

  // Open or closed is worked out after mount, from the current time in Dhaka (the same clock the server uses, BR-26),
  // so the server HTML stays stable and the answer does not depend on the visitor's own time zone.
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  const minutes = now ? dhakaMinuteOfDay(now) : null;
  const isOpen = (id: string) => (minutes === null || !hours[id] ? null : minutes >= hours[id].open && minutes < hours[id].close);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return branches
      .map((b) => ({ b, km: pos ? distance(pos, b) : null }))
      .filter(({ b }) => !q || [b.name.bn, b.name.en, b.address.bn, b.address.en].some((v) => v.toLowerCase().includes(q)))
      .sort((x, y) => (x.km !== null && y.km !== null ? x.km - y.km : 0));
  }, [branches, query, pos]);

  const locate = () => {
    if (!('geolocation' in navigator)) return setGeo('unsupported');
    setGeo('loading');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude });
        setGeo('ok');
      },
      () => setGeo('denied'),
      { timeout: 10_000, maximumAge: 300_000 },
    );
  };

  const copy = async (b: Branch) => {
    try {
      await navigator.clipboard.writeText(`ChaJoy ${b.name.en}, ${b.address.en}`);
      setCopied(b.id);
      setTimeout(() => setCopied(''), 1800);
    } catch {
      /* clipboard can be blocked; the address is still on screen */
    }
  };

  return (
    <>
      <PageTitle
        title={tx('আমাদের আউটলেট', 'Our outlets')}
        subtitle={tx(`আপনার কার্ড ${n(branches.length)}টি আউটলেটেই চলবে`, `Your card works at all ${branches.length} outlets`)}
      />

      <div className="flex flex-wrap gap-2.5">
        <div className="relative min-w-0 flex-[1_1_260px]">
          <label htmlFor="outlet-q" className="sr-only">{tx('আউটলেট খুঁজুন', 'Search outlets')}</label>
          <Search size={20} className="absolute left-4 top-[15px] text-muted" aria-hidden="true" />
          <input id="outlet-q" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tx('আউটলেট বা ঠিকানা লিখুন', 'Search by outlet or address')} className={`${inputClass} h-[52px] rounded-2xl pl-12`} />
        </div>
        <Button variant="secondary" className="h-[52px]" onClick={locate} disabled={geo === 'loading'}>
          <LocateFixed size={20} aria-hidden="true" />
          {geo === 'loading' ? tx('খুঁজছি…', 'Locating…') : tx('আমার কাছেরগুলো দেখান', 'Show nearest to me')}
        </Button>
      </div>

      {geo === 'ok' && <Notice>{tx('আপনার অবস্থান অনুযায়ী কাছেরটি আগে দেখানো হচ্ছে।', 'Sorted by distance from you, nearest first.')}</Notice>}
      {geo === 'denied' && <Notice tone="warn">{tx('অবস্থানের অনুমতি পাওয়া যায়নি। তবুও সব আউটলেট দেখতে পারবেন।', 'Location permission wasn’t granted. You can still browse every outlet.')}</Notice>}
      {geo === 'unsupported' && <Notice tone="warn">{tx('এই ডিভাইসে অবস্থান পাওয়া যায়নি।', 'Location isn’t available on this device.')}</Notice>}

      {loading ? (
        <div role="status" aria-label={tx('লোড হচ্ছে', 'Loading')} className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
          {[0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-card bg-surface2" />)}
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-card border border-dashed border-line2 p-8 text-center text-muted">{tx('কোনো আউটলেট পাওয়া যায়নি। অন্য নাম বা ঠিকানা দিয়ে খুঁজুন।', 'No outlets match that. Try another name or address.')}</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
          {rows.map(({ b, km }) => (
            <li key={b.id}>
              <article className="flex h-full flex-col gap-3 rounded-card border border-line bg-surface p-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] text-navy" style={{ background: b.chip }}><MapPin size={22} aria-hidden="true" /></span>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-[19px] font-bold leading-tight">{l(b.name)}</h2>
                    <p className="text-sm text-muted">{l(b.address)}</p>
                  </div>
                  {km !== null && <span className="whitespace-nowrap rounded-full bg-brand-soft px-2.5 py-0.5 text-[13px] font-extrabold text-brand-ink">{tx(`${n(km.toFixed(1))} কিমি`, `${km.toFixed(1)} km`)}</span>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {isOpen(b.id) === null ? (
                    <Badge tone="info"><Clock size={13} className="mr-1" aria-hidden="true" />{n(hour(hours[b.id].open))} – {n(hour(hours[b.id].close))}</Badge>
                  ) : isOpen(b.id) ? (
                    <Badge tone="ok"><span aria-hidden="true" className="mr-1.5 size-2 rounded-full bg-aqua" />{tx(`এখন খোলা · ${n(hour(hours[b.id].close))} পর্যন্ত`, `Open now · until ${hour(hours[b.id].close)}`)}</Badge>
                  ) : (
                    <Badge tone="danger">{tx(`বন্ধ · ${n(hour(hours[b.id].open))}-এ খুলবে`, `Closed · opens ${hour(hours[b.id].open)}`)}</Badge>
                  )}
                </div>
                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  <ButtonLink href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`ChaJoy ${b.name.en}, ${b.address.en}, Dhaka`)}`} target="_blank" rel="noreferrer" size="sm">
                    <Navigation size={17} aria-hidden="true" />
                    {tx('দিকনির্দেশ', 'Directions')}
                  </ButtonLink>
                  <Button variant="secondary" size="sm" onClick={() => copy(b)}>
                    {copied === b.id ? <Check size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}
                    {copied === b.id ? tx('কপি হয়েছে', 'Copied') : tx('ঠিকানা কপি', 'Copy address')}
                  </Button>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
