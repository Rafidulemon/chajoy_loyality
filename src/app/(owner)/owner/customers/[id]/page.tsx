'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSWRConfig } from 'swr';
import { ArrowLeft, Send } from 'lucide-react';
import { LoadError, Skeleton } from '@/components/owner-feedback';
import { OwnerHeader } from '@/components/owner-header';
import { Badge, Button, ButtonLink, Card, CardTitle, Field, IconChip, Notice, Stepper, inputClass } from '@/components/ui';
import { adminCustomerKey, birthdayText, fetchCustomerActivity, fullDate, memberCode, useAdminCustomer, useRefreshCustomers } from '@/lib/api/admin-customers';
import { toCustomer, toTimelineEntry } from '@/lib/api/adapters';
import { api, isApiError } from '@/lib/api/client';
import { useProgram } from '@/lib/api/program';
import type { AdjustResultDto, AdminCustomerDto } from '@/lib/contracts/admin';
import type { ActivityDto } from '@/lib/contracts/dto';
import { useI18n, type Text } from '@/lib/i18n';
import { cn } from '@/lib/cn';

/** Quick picks for the reason. The reason is one line of free text, so a pick just fills the box and it can still be edited. */
const REASONS: Text[] = [
  { bn: 'স্ক্যান করতে ভুলে গিয়েছিল', en: 'Cashier forgot to scan' },
  { bn: 'ভুল করে বেশি দেওয়া হয়েছে', en: 'Given by mistake' },
  { bn: 'বিশেষ উপহার', en: 'Special gift' },
];

function ActivityCard({ id, first, firstNext }: { id: string; first: ActivityDto[]; firstNext: string | null }) {
  const { tx, l } = useI18n();
  /** The older pages loaded with "Load more", and where the next one starts. */
  const [more, setMore] = useState<{ items: ActivityDto[]; next: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // The first page is part of the customer; it reloads after a change. Older pages stay, and a row a page boundary repeats is shown once.
  const items = useMemo(() => {
    const seen = new Set<string>();
    return [...first, ...(more?.items ?? [])].filter((a) => {
      if (seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    });
  }, [first, more]);
  const entries = useMemo(() => {
    const now = Date.now();
    return items.map((a) => toTimelineEntry(a, now));
  }, [items]);
  const cursor = more ? more.next : firstNext;

  const loadMore = async () => {
    if (!cursor || busy) return;
    setBusy(true);
    setError(null);
    try {
      const page = await fetchCustomerActivity(id, cursor);
      const known = new Set(items.map((a) => a.id));
      const fresh = page.items.filter((a) => !known.has(a.id));
      // A page with nothing new means there is no more to show (many rows can share one moment), so stop offering the button.
      setMore((m) => ({ items: [...(m?.items ?? []), ...fresh], next: fresh.length ? page.nextBefore : null }));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardTitle>{tx('কার্যকলাপ', 'Activity')}</CardTitle>
      {entries.length === 0 ? (
        <p className="py-6 text-center text-muted">{tx('এখনো কোনো কার্যকলাপ নেই।', 'No activity yet.')}</p>
      ) : (
        <ul>
          {entries.map((e) => (
            <li key={e.id} className="flex min-h-[60px] items-center gap-3.5 border-t border-line py-2">
              <IconChip color={e.color} size={38} className="rounded-[13px]">{e.mark}</IconChip>
              <span className="min-w-0 flex-1"><span className="block break-words font-bold">{l(e.what)}</span><span className="block text-[13px] text-muted">{l(e.meta)}</span></span>
              <span className="whitespace-nowrap text-[13px] text-muted">{l(e.when)}</span>
            </li>
          ))}
        </ul>
      )}
      {error != null && <LoadError error={error} onRetry={() => void loadMore()} className="mt-3" />}
      {cursor && (
        <div className="mt-3 flex justify-center">
          <Button variant="secondary" size="sm" onClick={() => void loadMore()} disabled={busy}>{busy ? tx('লোড হচ্ছে…', 'Loading…') : tx('আরও দেখুন', 'Load more')}</Button>
        </div>
      )}
    </Card>
  );
}

function AdjustCard({ id, stamps, total }: { id: string; stamps: number; total: number }) {
  const { tx, l, n } = useI18n();
  const refresh = useRefreshCustomers();
  const [change, setChange] = useState(0);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState<{ delta: number; completed: boolean } | null>(null);

  // The card can go down to empty and up to full. It is read fresh every render, so a card that changed meanwhile narrows the range at once.
  const min = -stamps;
  const max = Math.max(0, total - stamps);
  const delta = Math.min(max, Math.max(min, change));
  const reasonOk = reason.trim().length >= 3;

  const save = async () => {
    if (busy || delta === 0 || !reasonOk) return;
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const res = await api.post<AdjustResultDto>(`${adminCustomerKey(id)}/adjust`, { delta, reason: reason.trim() });
      setSaved({ delta, completed: res.completed > 0 });
      setChange(0);
      setReason('');
      void refresh();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col gap-3.5">
      <div><h2 className="text-lg font-bold">{tx('Stamp ঠিক করুন', 'Adjust stamps')}</h2><p className="mt-1 text-[13px] text-muted">{tx('ভুল হলে হাতে যোগ বা বাদ দিন। কে কী বদলেছে, কারণসহ রেকর্ড থাকবে।', 'Fix mistakes by hand. Every change is logged with who made it and why.')}</p></div>
      <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="flex flex-col gap-3.5">
        <Stepper
          label={tx('পরিবর্তন', 'Change')}
          value={`${delta > 0 ? '+' : delta < 0 ? '−' : ''}${n(Math.abs(delta))}`}
          valueClassName={delta > 0 ? 'text-ok' : delta < 0 ? 'text-danger' : ''}
          onDecrease={() => { setChange(Math.max(min, delta - 1)); setSaved(null); }}
          onIncrease={() => { setChange(Math.min(max, delta + 1)); setSaved(null); }}
          decreaseLabel={tx('কমান', 'Remove')}
          increaseLabel={tx('বাড়ান', 'Add')}
        />
        <Field id="reason" label={tx('কারণ', 'Reason')} hint={tx('কয়েকটি শব্দে লিখুন (কমপক্ষে ৩ অক্ষর)। পরিবর্তনের সঙ্গে এটি রাখা হবে।', 'A few words (at least 3 characters). It is kept with the change.')}>
          <input id="reason" autoComplete="off" maxLength={200} value={reason} onChange={(e) => { setReason(e.target.value); setSaved(null); }} placeholder={tx('যেমন: স্ক্যান করতে ভুলে গিয়েছিল', 'For example: Cashier forgot to scan')} className={inputClass} />
        </Field>
        <div role="group" aria-label={tx('দ্রুত কারণ', 'Quick reasons')} className="flex flex-wrap gap-2">
          {REASONS.map((r) => (
            <button
              key={r.en}
              type="button"
              aria-pressed={reason === l(r)}
              onClick={() => { setReason(l(r)); setSaved(null); }}
              className={cn('min-h-11 rounded-full border-[1.5px] px-3.5 text-sm font-semibold transition-colors', reason === l(r) ? 'border-brand bg-brand-soft text-brand-ink' : 'border-line2 bg-surface text-ink hover:bg-surface2')}
            >
              {l(r)}
            </button>
          ))}
        </div>
        <Button type="submit" disabled={busy || delta === 0 || !reasonOk}>{busy ? tx('সেভ হচ্ছে…', 'Saving…') : tx('সেভ করুন', 'Save change')}</Button>
        {error != null && <LoadError error={error} />}
        {saved && (
          <Notice>
            {saved.completed
              ? tx('সেভ হয়েছে। কার্ড সম্পূর্ণ, গ্রাহক একটি Reward ভাউচার পেয়েছেন।', 'Saved. The card is complete and the customer got a reward voucher.')
              : tx(`সেভ হয়েছে: ${saved.delta > 0 ? '+' : '−'}${n(Math.abs(saved.delta))} Stamp`, `Saved: ${saved.delta > 0 ? '+' : '−'}${Math.abs(saved.delta)} stamp${Math.abs(saved.delta) === 1 ? '' : 's'}`)}
          </Notice>
        )}
      </form>
    </Card>
  );
}

function NoteCard({ id, note }: { id: string; note: string | null }) {
  const { tx } = useI18n();
  const { mutate } = useSWRConfig();
  /** What is typed, or null while nothing has been typed (the saved note is shown). */
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [justSaved, setJustSaved] = useState(false);
  const text = draft ?? note ?? '';
  const dirty = draft !== null && draft.trim() !== (note ?? '').trim();

  const save = async () => {
    if (busy || !dirty) return;
    setBusy(true);
    setError(null);
    setJustSaved(false);
    try {
      const res = await api.put<{ note: string | null }>(`${adminCustomerKey(id)}/note`, { note: text.trim() ? text.trim() : null });
      // Show the saved note straight away; the next reload of the customer brings the same thing.
      await mutate<AdminCustomerDto>(adminCustomerKey(id), (current) => (current ? { ...current, profile: { ...current.profile, note: res.note } } : current), { revalidate: false });
      setDraft(null);
      setJustSaved(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col gap-2">
      <label htmlFor="note" className="text-lg font-bold">{tx('ব্যক্তিগত নোট', 'Private note')}</label>
      <p className="text-[13px] text-muted">{tx('শুধু ম্যানেজার ও মালিক দেখতে পাবেন। গ্রাহক দেখেন না।', 'Only managers and owners see this. The customer does not.')}</p>
      <textarea
        id="note"
        rows={4}
        maxLength={1000}
        value={text}
        onChange={(e) => { setDraft(e.target.value); setJustSaved(false); }}
        placeholder={tx('যেমন: কম চিনি পছন্দ করেন', 'For example: Prefers less sugar')}
        className={`${inputClass} h-auto resize-y py-3 leading-relaxed`}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={() => void save()} disabled={busy || !dirty}>{busy ? tx('সেভ হচ্ছে…', 'Saving…') : tx('নোট সেভ করুন', 'Save note')}</Button>
        {justSaved && !dirty && <span role="status" className="text-sm font-bold text-ok">{tx('সেভ হয়েছে', 'Saved')}</span>}
      </div>
      {error != null && <LoadError error={error} />}
    </Card>
  );
}

function Loaded({ data }: { data: AdminCustomerDto }) {
  const { tx, l, n } = useI18n();
  const shop = useProgram();
  const { row, profile, card, program, stats } = data;
  const view = useMemo(() => toCustomer(row), [row]);
  const total = program.total;

  const joinedVia: Text = profile.joinedBranch ?? (profile.joinedVia === 'management' ? { bn: 'ম্যানেজমেন্ট', en: 'Management' } : profile.joinedVia === 'counter' ? { bn: 'কাউন্টার', en: 'Counter' } : { bn: 'অ্যাপ', en: 'App' });
  const since = fullDate(profile.joinedAt);
  const gap = stats.averageGapDays;

  const tiles = [
    { label: tx('মোট ভিজিট', 'Total visits'), value: n(stats.visits), bg: 'var(--brand-soft)' },
    { label: tx('মোট Stamp', 'Total stamps'), value: n(stats.lifetimeStamps), bg: 'var(--tangerine-soft)' },
    { label: tx('নেওয়া Reward', 'Rewards'), value: n(stats.rewardsEarned), bg: 'var(--rose-soft)' },
    { label: tx('গড় বিরতি', 'Average gap'), value: gap === null ? '—' : tx(`${n(gap)} দিন`, `${n(gap)} ${gap === 1 ? 'day' : 'days'}`), bg: 'var(--aqua-soft)' },
  ];

  return (
    <>
      <OwnerHeader
        back={<Link href="/owner/customers" className="inline-flex min-h-8 items-center gap-1.5 self-start text-sm font-bold"><ArrowLeft size={16} aria-hidden="true" />{tx('সব গ্রাহক', 'All customers')}</Link>}
        title={l(view.name)}
        subtitle={tx(`গ্রাহক ${since.bn} থেকে · ${joinedVia.bn}`, `Customer since ${since.en} · ${joinedVia.en}`)}
        actions={<ButtonLink href="/owner/sms" variant="secondary" size="sm"><Send size={18} aria-hidden="true" />{tx('SMS পাঠান', 'Send SMS')}</ButtonLink>}
      />
      <div className="flex flex-wrap items-start gap-[18px]">
        <div className="flex min-w-0 flex-[3_1_420px] flex-col gap-[18px]">
          <Card className="flex flex-wrap items-center gap-[18px]">
            <span className="flex size-[72px] items-center justify-center rounded-[24px] font-display text-[28px] font-extrabold text-navy" style={{ background: view.avatar }}>{l(view.initial)}</span>
            <dl className="grid flex-[1_1_260px] grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">{tx('মোবাইল', 'Mobile')}</dt><dd className="break-words font-bold">{view.phone}</dd>
              <dt className="text-muted">{tx('সদস্য নম্বর', 'Member no.')}</dt><dd className="font-bold">{memberCode(row.memberNo)}</dd>
              <dt className="text-muted">{tx('জন্মদিন', 'Birthday')}</dt><dd className="font-bold">{profile.birthday ? l(birthdayText(profile.birthday)) : '—'}</dd>
              <dt className="text-muted">{tx('প্রিয় Reward', 'Favourite reward')}</dt><dd className="font-bold">{stats.favouriteReward ? l(stats.favouriteReward) : '—'}</dd>
              <dt className="text-muted">{tx('অফার SMS', 'Offer SMS')}</dt><dd className="font-bold">{profile.smsConsent ? tx('সম্মতি দিয়েছেন', 'Agreed') : tx('সম্মতি দেননি', 'Not agreed')}</dd>
            </dl>
            <div className="flex basis-full flex-wrap gap-1.5">
              <Badge tone="ok">{stats.visits < 10 ? tx('নতুন', 'New') : tx('নিয়মিত', 'Regular')}</Badge>
              {row.hasReadyVoucher && <Badge tone="warn">{tx('Reward রেডি', 'Reward ready')}</Badge>}
              {row.status === 'inactive' && <Badge tone="danger">{tx('৩০ দিনে আসেননি', 'Not seen in 30 days')}</Badge>}
            </div>
          </Card>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
            {tiles.map((s) => (
              <div key={s.label} className="rounded-[20px] p-4" style={{ background: s.bg }}>
                <p className="text-[13px] font-semibold text-muted">{s.label}</p>
                <p className="font-display text-[30px] font-bold leading-tight">{s.value}</p>
              </div>
            ))}
          </div>
          <ActivityCard id={row.id} first={data.activity} firstNext={data.nextBefore} />
        </div>

        <div className="flex min-w-0 flex-[2_1_300px] flex-col gap-[18px]">
          <section aria-label={tx('বর্তমান কার্ড', 'Current card')} className="relative flex flex-col gap-3.5 overflow-hidden rounded-[24px] p-5" style={{ background: shop.color, color: shop.fg }}>
            <span aria-hidden="true" className="absolute -right-8 -top-8 size-[110px] rounded-full" style={{ background: shop.deco1 }} />
            <div className="relative flex items-baseline justify-between"><span className="font-bold">{tx('বর্তমান কার্ড', 'Current card')}</span><span className="rounded-full px-3 font-display text-[26px] font-extrabold" style={{ background: shop.stampBg, color: shop.stampFg }}>{n(card.stamps)}/{n(total)}</span></div>
            <div className="relative grid gap-[5px]" style={{ gridTemplateColumns: `repeat(${Math.min(total, 10)}, minmax(0, 1fr))` }}>
              {Array.from({ length: total }, (_, i) => <span key={i} className={cn('aspect-square rounded-full', i >= card.stamps && 'border-2 border-dashed')} style={i < card.stamps ? { background: shop.stampBg } : { borderColor: shop.dash }} />)}
            </div>
          </section>
          <AdjustCard id={row.id} stamps={card.stamps} total={total} />
          <NoteCard id={row.id} note={profile.note} />
        </div>
      </div>
    </>
  );
}

function CustomerDetail({ id }: { id: string }) {
  const { tx } = useI18n();
  const { customer, error, reload } = useAdminCustomer(id);

  if (customer) return <Loaded data={customer} />;

  const back = <Link href="/owner/customers" className="inline-flex min-h-8 items-center gap-1.5 self-start text-sm font-bold"><ArrowLeft size={16} aria-hidden="true" />{tx('সব গ্রাহক', 'All customers')}</Link>;

  if (error) {
    // A link with a wrong or old id: the server says it is not found (or not a valid id).
    const missing = isApiError(error) && (error.status === 404 || error.code === 'VALIDATION');
    return (
      <>
        <OwnerHeader back={back} title={missing ? tx('গ্রাহক পাওয়া যায়নি', 'Customer not found') : tx('গ্রাহক', 'Customer')} />
        {missing ? (
          <Card className="flex flex-col items-start gap-3">
            <p className="text-muted">{tx('এই গ্রাহককে খুঁজে পাওয়া যায়নি। লিংকটি ভুল বা পুরোনো হতে পারে।', 'We could not find this customer. The link may be wrong or out of date.')}</p>
            <ButtonLink href="/owner/customers" variant="secondary" size="sm">{tx('সব গ্রাহক দেখুন', 'See all customers')}</ButtonLink>
          </Card>
        ) : (
          <LoadError error={error} onRetry={reload} />
        )}
      </>
    );
  }

  return (
    <>
      <OwnerHeader back={back} title={tx('গ্রাহক', 'Customer')} />
      <div role="status" aria-busy="true" className="flex flex-wrap items-start gap-[18px]">
        <span className="sr-only">{tx('লোড হচ্ছে…', 'Loading…')}</span>
        <div className="flex min-w-0 flex-[3_1_420px] flex-col gap-[18px]">
          <Skeleton className="h-36 rounded-card" />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-[20px]" />)}</div>
          <Skeleton className="h-72 rounded-card" />
        </div>
        <div className="flex min-w-0 flex-[2_1_300px] flex-col gap-[18px]">
          <Skeleton className="h-40 rounded-[24px]" />
          <Skeleton className="h-64 rounded-card" />
          <Skeleton className="h-40 rounded-card" />
        </div>
      </div>
    </>
  );
}

export default function OwnerCustomerPage() {
  const { id } = useParams<{ id: string }>();
  // Keyed by id, so moving to another customer starts with a clean timeline, form and note.
  return <CustomerDetail key={id} id={id} />;
}
