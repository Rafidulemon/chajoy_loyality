'use client';

import { useState } from 'react';
import { Pencil, Plus, Send, Trash2, X } from 'lucide-react';
import { OwnerHeader } from '@/components/owner-header';
import { GLOSS, OfferSlideBody } from '@/components/offer-bar';
import { Badge, Button, ButtonLink, Card, Field, Notice, Stepper, Switch, inputClass, type Tone } from '@/components/ui';
import { ADMIN_KEYS, ALERT_CLASS, issueFields, useAdminOffers, type AdminOfferRow } from '@/lib/api/admin-config';
import { api } from '@/lib/api/client';
import { errorText } from '@/lib/api/messages';
import type { AdminOfferDto } from '@/lib/contracts/admin';
import type { OfferSave } from '@/lib/contracts/schemas';
import { isClaimable, type Offer, type OfferKind } from '@/lib/data';
import { bnDigits } from '@/lib/format';
import { useI18n, type Text } from '@/lib/i18n';
import { cn } from '@/lib/cn';

const t = (bn: string, en: string): Text => ({ bn, en });

const KINDS: Record<OfferKind, { label: Text; tone: Tone; hint: Text }> = {
  stamp: { label: t('বোনাস Stamp', 'Bonus stamp'), tone: 'brand', hint: t('গ্রাহক অ্যাপে নিলে Stamp সরাসরি কার্ডে যোগ হয়', 'Customers claim it in the app and the stamp lands on their card') },
  voucher: { label: t('ফ্রি আইটেম', 'Free item'), tone: 'ok', hint: t('নিলে গ্রাহকের Reward-এ একটি ভাউচার যোগ হয়', 'Claiming adds a voucher to their Rewards') },
  double: { label: t('ডাবল Stamp', 'Double stamps'), tone: 'warn', hint: t('নিজে থেকেই প্রযোজ্য, ক্যাশিয়ার দ্বিগুণ Stamp দেন', 'Applies by itself, the cashier gives double') },
  info: { label: t('কাউন্টারে', 'At the counter'), tone: 'info', hint: t('এমন ডিল যা গ্রাহক কাউন্টারে দেখান', 'A deal customers just show at the counter') },
  birthday: { label: t('জন্মদিন', 'Birthday'), tone: 'rose', hint: t('গ্রাহকের জন্মদিনের সপ্তাহে খুলে যায়', 'Unlocks in each customer’s birthday week') },
};

const COLORS = [
  { bg: '#97C334', fg: '#171717', label: t('লাইম', 'Lime') },
  { bg: '#F5D900', fg: '#171717', label: t('হলুদ', 'Yellow') },
  { bg: '#171717', fg: '#F5D900', label: t('কালো', 'Black') },
  { bg: '#668C1F', fg: '#FFFFFF', label: t('সবুজ', 'Green') },
  { bg: '#FF8A9A', fg: '#171717', label: t('গোলাপি', 'Rose') },
];

/** The form fields the server can name in a validation error, so the message can say which ones to check. */
const FIELDS: Record<string, Text> = {
  kind: t('ধরন', 'Type'),
  badge: t('ব্যাজ', 'Badge text'),
  title: t('শিরোনাম', 'Title'),
  body: t('বিবরণ', 'Description'),
  terms: t('শর্তাবলী', 'Terms'),
  bonusStamps: t('বোনাস Stamp', 'Bonus stamps'),
  reward: t('ভাউচারের নাম', 'Voucher name'),
  voucherDays: t('ভাউচারের মেয়াদ', 'Voucher valid for'),
  runDays: t('কতদিন চলবে', 'Runs for'),
  bg: t('রং', 'Colour'),
  fg: t('রং', 'Colour'),
};

/** What went wrong, in both languages. A validation error also lists the fields to check. */
function failure(e: unknown): Text {
  const base = errorText(e);
  const names = [...new Set(issueFields(e).flatMap((f) => (FIELDS[f] ? [FIELDS[f]] : [])))];
  return names.length ? t(`${base.bn} (${names.map((x) => x.bn).join(', ')})`, `${base.en} (${names.map((x) => x.en).join(', ')})`) : base;
}

type Draft = {
  /** null while creating a new offer. */
  id: string | null;
  kind: OfferKind;
  titleEn: string;
  titleBn: string;
  bodyEn: string;
  bodyBn: string;
  badge: string;
  days: number;
  stamps: number;
  rewardEn: string;
  rewardBn: string;
  voucherDays: number;
  color: number;
};

const defaultBadge = (kind: OfferKind, stamps: number) => ({ stamp: `+${stamps}`, voucher: 'FREE', double: '2×', info: 'DEAL', birthday: 'BDAY' })[kind];
const blank = (): Draft => ({ id: null, kind: 'stamp', titleEn: '', titleBn: '', bodyEn: '', bodyBn: '', badge: '+1', days: 7, stamps: 1, rewardEn: '', rewardBn: '', voucherDays: 7, color: 0 });

function toDraft(o: AdminOfferRow): Draft {
  const color = COLORS.findIndex((c) => c.bg.toLowerCase() === o.bg.toLowerCase());
  return {
    id: o.id,
    kind: o.kind,
    titleEn: o.title.en,
    titleBn: o.title.bn,
    bodyEn: o.body.en,
    bodyBn: o.body.bn,
    badge: o.badge.en,
    // The run length counts from the moment of saving, so editing starts from the days that remain (an ended offer starts at a week).
    days: o.endsInDays && o.endsInDays > 0 ? Math.min(90, o.endsInDays) : 7,
    stamps: o.bonusStamps ?? 1,
    rewardEn: o.reward?.en ?? '',
    rewardBn: o.reward?.bn ?? '',
    voucherDays: o.voucherDays ?? 7,
    color: Math.max(0, color),
  };
}

/** The terms shown on the offer card, written from the settings so management does not have to. */
function termsFor(d: Draft): Text[] {
  if (d.kind === 'stamp') return [t('প্রতি গ্রাহক একবারই নিতে পারবেন', 'One claim per customer'), t('Stamp সরাসরি আপনার কার্ডে যোগ হবে', 'The stamp is added straight to your card')];
  if (d.kind === 'voucher') return [t(`নেওয়ার ${bnDigits(String(d.voucherDays))} দিনের মধ্যে ব্যবহার করতে হবে`, `Use within ${d.voucherDays} days of claiming`), t('প্রতি ভিজিটে ১টি', 'One per visit')];
  if (d.kind === 'double') return [t('অন্য অফারের সাথে মেশানো যাবে না', 'Cannot be combined with other offers')];
  return [t('সীমিত সময়ের জন্য', 'Limited time only'), t('Stamp যথারীতি পাবেন', 'Stamps are earned as usual')];
}

/** Bangla is optional in the form: the English text stands in for it. */
const both = (bn: string, en: string): Text => ({ bn: bn.trim() || en.trim(), en: en.trim() });

/** The request body for creating or editing an offer. */
function toBody(d: Draft, existing?: AdminOfferRow): OfferSave {
  const color = COLORS[d.color];
  const badge = d.badge.trim();
  return {
    kind: d.kind,
    badge: { bn: badge, en: badge },
    title: both(d.titleBn, d.titleEn),
    body: both(d.bodyBn, d.bodyEn),
    // A birthday offer keeps the terms it was made with.
    terms: d.kind === 'birthday' && existing ? existing.terms : termsFor(d),
    ...(d.kind === 'stamp' ? { bonusStamps: d.stamps } : {}),
    ...(d.kind === 'voucher' ? { reward: both(d.rewardBn, d.rewardEn), voucherDays: d.voucherDays } : {}),
    bg: color.bg,
    fg: color.fg,
    // A birthday offer has no end date.
    ...(d.kind === 'birthday' ? {} : { runDays: d.days }),
  };
}

export default function OffersAdminPage() {
  const { tx, l, n } = useI18n();
  const { rows, error, isLoading, mutate: mutateOffers } = useAdminOffers();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<Text | null>(null);
  const [listError, setListError] = useState<Text | null>(null);
  const [published, setPublished] = useState<Text | null>(null);
  const [confirmDelete, setConfirmDelete] = useState('');
  const [deleting, setDeleting] = useState('');
  /** Offers whose live/paused switch has a request running. */
  const [switching, setSwitching] = useState<string[]>([]);

  const live = rows.filter((o) => o.status === 'live' && !o.ended).length;
  const paused = rows.filter((o) => o.status === 'paused').length;
  const claims = rows.reduce((sum, o) => sum + o.claims, 0);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
    setFormError(null);
  };
  const setKind = (kind: OfferKind) => setDraft((d) => (d ? { ...d, kind, badge: defaultBadge(kind, d.stamps) } : d));
  const setStamps = (stamps: number) => setDraft((d) => (d ? { ...d, stamps, badge: d.kind === 'stamp' ? `+${stamps}` : d.badge } : d));

  const save = async () => {
    if (!draft || saving) return;
    if (draft.titleEn.trim().length < 3) return setFormError(t('ইংরেজি শিরোনাম লিখুন (অন্তত ৩ অক্ষর)', 'Enter an English title (at least 3 characters)'));
    if (draft.bodyEn.trim().length < 5) return setFormError(t('ইংরেজি বিবরণ লিখুন', 'Enter an English description'));
    if (draft.kind === 'voucher' && draft.rewardEn.trim().length < 3) return setFormError(t('ভাউচারের নাম লিখুন, যেমন Free topping', 'Enter the voucher name, like Free topping'));
    if (!draft.badge.trim()) return setFormError(t('ব্যাজের লেখা দিন', 'Enter the badge text'));

    const id = draft.id;
    const body = toBody(draft, id ? rows.find((o) => o.id === id) : undefined);
    setSaving(true);
    setFormError(null);
    try {
      const offer = id ? await api.put<AdminOfferDto>(ADMIN_KEYS.offer(id), body) : await api.post<AdminOfferDto>(ADMIN_KEYS.offers, body);
      // Show the saved offer at once, then let SWR fetch the list again.
      void mutateOffers((current) => (id ? (current ?? []).map((o) => (o.id === offer.id ? offer : o)) : [offer, ...(current ?? [])]));
      setPublished(offer.title);
      setDraft(null);
    } catch (e) {
      setFormError(failure(e));
    } finally {
      setSaving(false);
    }
  };

  /** Pause or resume. The switch moves at once and moves back, with the reason, if the server refuses. */
  const setStatus = async (o: AdminOfferRow, on: boolean) => {
    if (switching.includes(o.id)) return;
    const status = on ? 'live' : 'paused';
    setSwitching((s) => [...s, o.id]);
    setListError(null);
    try {
      await mutateOffers(
        async (current) => {
          const updated = await api.post<AdminOfferDto>(ADMIN_KEYS.offerStatus(o.id), { status });
          return (current ?? []).map((x) => (x.id === updated.id ? updated : x));
        },
        { optimisticData: (current) => (current ?? []).map((x) => (x.id === o.id ? { ...x, status } : x)), rollbackOnError: true, revalidate: true },
      );
    } catch (e) {
      setListError(errorText(e));
    } finally {
      setSwitching((s) => s.filter((id) => id !== o.id));
    }
  };

  const remove = async (o: AdminOfferRow) => {
    if (deleting) return;
    setDeleting(o.id);
    setListError(null);
    try {
      await api.del(ADMIN_KEYS.offer(o.id));
      void mutateOffers((current) => (current ?? []).filter((x) => x.id !== o.id));
      if (draft?.id === o.id) setDraft(null);
    } catch (e) {
      setListError(errorText(e));
      void mutateOffers();
    } finally {
      setConfirmDelete('');
      setDeleting('');
    }
  };

  const preview: Offer | null = draft && {
    id: 'preview',
    kind: draft.kind,
    badge: t(draft.badge || '…', draft.badge || '…'),
    title: { bn: draft.titleBn.trim() || draft.titleEn.trim() || tx('অফারের শিরোনাম', 'Offer title'), en: draft.titleEn.trim() || tx('অফারের শিরোনাম', 'Offer title') },
    body: { bn: draft.bodyBn.trim() || draft.bodyEn.trim() || tx('এখানে বিবরণ দেখাবে', 'The description shows here'), en: draft.bodyEn.trim() || tx('এখানে বিবরণ দেখাবে', 'The description shows here') },
    endsInDays: draft.kind === 'birthday' ? null : draft.days,
    terms: [],
    bg: COLORS[draft.color].bg,
    fg: COLORS[draft.color].fg,
  };

  const stats = [
    { label: tx('চালু অফার', 'Live offers'), value: live, bg: 'var(--brand-soft)' },
    { label: tx('বন্ধ রাখা', 'Paused'), value: paused, bg: 'var(--surface-2)' },
    { label: tx('মোট নেওয়া হয়েছে', 'Total claims'), value: claims, bg: 'var(--tangerine-soft)' },
  ];

  return (
    <>
      <OwnerHeader
        title={tx('অফার', 'Offers')}
        subtitle={tx('গ্রাহক অ্যাপের অফার বারে যা দেখাবে', 'What customers see in the app’s offers bar')}
        actions={<Button size="sm" disabled={saving} onClick={() => { setDraft(blank()); setPublished(null); setFormError(null); }}><Plus size={18} strokeWidth={2.4} aria-hidden="true" />{tx('নতুন অফার', 'New offer')}</Button>}
      />
      {published && <Notice>{tx(`“${published.bn}” সেভ হয়েছে। গ্রাহকরা এখনই অফার বারে দেখবেন।`, `“${published.en}” saved. Customers see the change in the offers bar right away.`)}</Notice>}
      {listError && <p role="alert" className={ALERT_CLASS}>{l(listError)}</p>}

      <div className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-[20px] p-4" style={{ background: s.bg }}>
            <p className="text-[13px] font-semibold text-muted">{s.label}</p>
            <p className="font-display text-[30px] font-bold leading-tight">{isLoading ? '—' : n(s.value)}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-start gap-[18px]">
        <Card className="min-w-0 flex-[3_1_420px] p-0">
          {isLoading ? (
            <p role="status" className="p-8 text-center text-muted">{tx('লোড হচ্ছে…', 'Loading…')}</p>
          ) : error && rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-8 text-center">
              <p role="alert" className="font-bold text-danger">{l(errorText(error))}</p>
              <Button variant="secondary" size="sm" onClick={() => void mutateOffers()}>{tx('আবার চেষ্টা করুন', 'Try again')}</Button>
            </div>
          ) : rows.length === 0 ? (
            <p className="p-8 text-center text-muted">{tx('এখনো কোনো অফার নেই। “নতুন অফার” চাপুন।', 'No offers yet. Press “New offer”.')}</p>
          ) : (
            <ul>
              {rows.map((o) => {
                const kind = KINDS[o.kind];
                const days = o.endsInDays;
                return (
                  <li key={o.id} className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3.5 first:border-t-0">
                    <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl px-1 text-center font-display text-[15px] font-extrabold leading-none shadow-[0_2px_0_rgba(0,0,0,0.15)]" style={{ background: o.bg, color: o.fg }}>
                      {l(o.badge)}
                    </span>
                    <span className="min-w-0 flex-[1_1_220px]">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className={cn('break-words font-bold', (o.status === 'paused' || o.ended) && 'text-muted')}>{l(o.title)}</span>
                        <Badge tone={kind.tone}>{l(kind.label)}</Badge>
                      </span>
                      <span className="block text-[13px] text-muted">
                        {o.ended ? tx('শেষ হয়ে গেছে', 'Ended') : days === null ? tx('শেষ তারিখ নেই', 'No end date') : tx(`${n(days)} দিন বাকি`, `Ends in ${days} day${days === 1 ? '' : 's'}`)}
                        {isClaimable(o) && ` · ${tx(`${n(o.claims)} জন নিয়েছেন`, `${o.claims} claimed`)}`}
                      </span>
                    </span>
                    <fieldset disabled={switching.includes(o.id)} className="m-0 flex min-w-0 items-center gap-2 border-0 p-0 [&_button:disabled]:opacity-60">
                      <span className="text-[13px] font-semibold text-muted">{o.ended ? tx('শেষ', 'Ended') : o.status === 'live' ? tx('চালু', 'Live') : tx('বন্ধ', 'Paused')}</span>
                      <Switch checked={o.status === 'live'} onChange={(on) => void setStatus(o, on)} label={tx(`${o.title.bn} চালু রাখুন`, `Keep ${o.title.en} live`)} />
                    </fieldset>
                    <span className="flex basis-full flex-wrap gap-2 sm:basis-auto">
                      <Button variant="secondary" size="sm" disabled={saving} onClick={() => { setDraft(toDraft(o)); setPublished(null); setFormError(null); }}>
                        <Pencil size={16} aria-hidden="true" />{tx('এডিট', 'Edit')}
                      </Button>
                      <ButtonLink href={`/owner/sms?offer=${o.id}`} variant="secondary" size="sm">
                        <Send size={16} aria-hidden="true" />{tx('SMS', 'SMS')}
                      </ButtonLink>
                      {confirmDelete === o.id ? (
                        <>
                          <Button variant="danger" size="sm" disabled={deleting === o.id} onClick={() => void remove(o)}>{deleting === o.id ? tx('মোছা হচ্ছে…', 'Deleting…') : tx('হ্যাঁ, মুছুন', 'Yes, delete')}</Button>
                          <Button variant="ghost" size="sm" disabled={deleting === o.id} onClick={() => setConfirmDelete('')}>{tx('না', 'No')}</Button>
                        </>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(o.id)} aria-label={tx(`${o.title.bn} মুছুন`, `Delete ${o.title.en}`)}>
                          <Trash2 size={16} aria-hidden="true" />
                        </Button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="flex min-w-0 flex-[2_1_320px] flex-col gap-[18px] lg:sticky lg:top-6">
          {draft && preview ? (
            <Card className="flex flex-col gap-4 border-2 border-brand">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-bold">{draft.id ? tx('অফার এডিট', 'Edit offer') : tx('নতুন অফার', 'New offer')}</h2>
                <button type="button" onClick={() => setDraft(null)} disabled={saving} aria-label={tx('বাতিল', 'Cancel')} className="flex size-11 items-center justify-center rounded-full bg-surface2 disabled:opacity-60"><X size={20} aria-hidden="true" /></button>
              </div>

              <div>
                <p className="mb-1.5 text-sm font-bold">{tx('অফার বারে এভাবে দেখাবে', 'How it looks in the offers bar')}</p>
                <div className="overflow-hidden rounded-2xl text-[#171717]" style={GLOSS}>
                  <div className="flex min-h-[58px] items-center gap-2.5 px-2 py-2 sm:gap-3"><OfferSlideBody offer={preview} /></div>
                </div>
              </div>

              <fieldset disabled={saving} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
                <Field id="o-kind" label={tx('ধরন', 'Type')} hint={l(KINDS[draft.kind].hint)}>
                  <select id="o-kind" value={draft.kind} onChange={(e) => setKind(e.target.value as OfferKind)} disabled={draft.kind === 'birthday'} className={inputClass}>
                    {(Object.keys(KINDS) as OfferKind[]).filter((k) => k !== 'birthday' || draft.kind === 'birthday').map((k) => (
                      <option key={k} value={k}>{l(KINDS[k].label)}</option>
                    ))}
                  </select>
                </Field>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
                  <Field id="o-title-en" label={tx('শিরোনাম (ইংরেজি)', 'Title (English)')}>
                    <input id="o-title-en" maxLength={80} value={draft.titleEn} onChange={(e) => set('titleEn', e.target.value)} placeholder="Free topping" className={inputClass} />
                  </Field>
                  <Field id="o-title-bn" label={tx('শিরোনাম (বাংলা)', 'Title (Bangla)')} hint={tx('ঐচ্ছিক', 'Optional')}>
                    <input id="o-title-bn" maxLength={80} value={draft.titleBn} onChange={(e) => set('titleBn', e.target.value)} placeholder="ফ্রি টপিং" className={inputClass} />
                  </Field>
                  <Field id="o-body-en" label={tx('বিবরণ (ইংরেজি)', 'Description (English)')}>
                    <textarea id="o-body-en" rows={3} maxLength={240} value={draft.bodyEn} onChange={(e) => set('bodyEn', e.target.value)} placeholder="A free topping with any bubble tea." className={`${inputClass} h-auto resize-y py-3`} />
                  </Field>
                  <Field id="o-body-bn" label={tx('বিবরণ (বাংলা)', 'Description (Bangla)')} hint={tx('ঐচ্ছিক', 'Optional')}>
                    <textarea id="o-body-bn" rows={3} maxLength={240} value={draft.bodyBn} onChange={(e) => set('bodyBn', e.target.value)} className={`${inputClass} h-auto resize-y py-3`} />
                  </Field>
                </div>

                {draft.kind === 'stamp' && (
                  <Stepper
                    label={tx('বোনাস Stamp', 'Bonus stamps')}
                    value={n(draft.stamps)}
                    onDecrease={() => setStamps(Math.max(1, draft.stamps - 1))}
                    onIncrease={() => setStamps(Math.min(3, draft.stamps + 1))}
                    decreaseLabel={tx('কমান', 'Fewer')}
                    increaseLabel={tx('বাড়ান', 'More')}
                  />
                )}
                {draft.kind === 'voucher' && (
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-4">
                    <Field id="o-reward-en" label={tx('ভাউচারের নাম (ইংরেজি)', 'Voucher name (English)')}>
                      <input id="o-reward-en" maxLength={60} value={draft.rewardEn} onChange={(e) => set('rewardEn', e.target.value)} placeholder="Free topping" className={inputClass} />
                    </Field>
                    <Field id="o-reward-bn" label={tx('ভাউচারের নাম (বাংলা)', 'Voucher name (Bangla)')} hint={tx('ঐচ্ছিক', 'Optional')}>
                      <input id="o-reward-bn" maxLength={60} value={draft.rewardBn} onChange={(e) => set('rewardBn', e.target.value)} className={inputClass} />
                    </Field>
                    <Field id="o-vdays" label={tx('ভাউচারের মেয়াদ (দিন)', 'Voucher valid for (days)')}>
                      <input id="o-vdays" type="number" min={1} max={90} value={draft.voucherDays} onChange={(e) => set('voucherDays', Math.min(90, Math.max(1, Number(e.target.value) || 1)))} className={inputClass} />
                    </Field>
                  </div>
                )}
                <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-4">
                  <Field id="o-badge" label={tx('ব্যাজ', 'Badge text')} hint={tx('ছোট, যেমন +1 বা FREE', 'Keep it short, like +1 or FREE')}>
                    <input id="o-badge" value={draft.badge} maxLength={8} onChange={(e) => set('badge', e.target.value)} className={inputClass} />
                  </Field>
                  {draft.kind !== 'birthday' && (
                    <Field id="o-days" label={tx('কতদিন চলবে', 'Runs for (days)')} hint={tx('সেভ করার সময় থেকে গোনা হয়', 'Counted from the moment you save')}>
                      <input id="o-days" type="number" min={1} max={90} value={draft.days} onChange={(e) => set('days', Math.min(90, Math.max(1, Number(e.target.value) || 1)))} className={inputClass} />
                    </Field>
                  )}
                </div>
                <fieldset>
                  <legend className="mb-2 text-sm font-bold">{tx('রং', 'Colour')}</legend>
                  <div className="flex flex-wrap gap-2.5">
                    {COLORS.map((c, i) => (
                      <button key={c.bg} type="button" aria-label={l(c.label)} aria-pressed={draft.color === i} onClick={() => set('color', i)} className={cn('size-11 rounded-full border-[3px] disabled:opacity-60', draft.color === i ? 'border-surface outline outline-2 outline-ink' : 'border-transparent')} style={{ background: c.bg }} />
                    ))}
                  </div>
                </fieldset>
              </fieldset>

              {formError && <p role="alert" className="text-[13px] font-semibold text-danger">{l(formError)}</p>}
              <div className="flex flex-wrap gap-2.5">
                <Button onClick={() => void save()} disabled={saving} className="flex-[1_1_140px]">
                  {saving ? tx('সেভ হচ্ছে…', 'Saving…') : draft.id ? tx('সেভ করুন', 'Save offer') : tx('প্রকাশ করুন', 'Publish offer')}
                </Button>
                <Button variant="secondary" onClick={() => setDraft(null)} disabled={saving}>{tx('বাতিল', 'Cancel')}</Button>
              </div>
            </Card>
          ) : (
            <Card className="flex flex-col gap-3">
              <h2 className="text-lg font-bold">{tx('কীভাবে কাজ করে', 'How offers work')}</h2>
              <ul className="list-disc space-y-2 pl-5 text-[15px] text-muted">
                <li>{tx('চালু অফারগুলো গ্রাহক অ্যাপের হেডারের নিচের চকচকে বারে ঘুরে ঘুরে দেখায়।', 'Live offers rotate in the glossy bar under the customer app’s header.')}</li>
                <li>{tx('বোনাস Stamp ও ফ্রি আইটেম গ্রাহক অ্যাপেই নিতে পারেন।', 'Customers claim bonus-stamp and free-item offers right in the app.')}</li>
                <li>{tx('বন্ধ রাখলে অফারটি গ্রাহকের কাছে আর দেখাবে না, সব হিসাব থেকে যাবে।', 'Pausing hides an offer from customers and keeps its numbers.')}</li>
                <li>{tx('“SMS” চাপলে অফারটি দিয়ে একটি মেসেজ তৈরি হয়ে যাবে।', '“SMS” drafts a text message about the offer for you.')}</li>
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
