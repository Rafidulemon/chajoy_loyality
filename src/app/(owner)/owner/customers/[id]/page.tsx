'use client';

import { useState } from 'react';
import Link from 'next/link';
import { notFound, useParams } from 'next/navigation';
import { ArrowLeft, Send } from 'lucide-react';
import { OwnerHeader } from '@/components/owner-header';
import { Badge, Button, ButtonLink, Card, CardTitle, Field, IconChip, Notice, Stepper, inputClass } from '@/components/ui';
import { timeline, type HistoryItem } from '@/lib/data';
import { useI18n, type Text } from '@/lib/i18n';
import { bnDigits, useProgram, useStore } from '@/lib/store';
import { cn } from '@/lib/cn';

const MANAGEMENT: Text = { bn: 'ম্যানেজমেন্ট', en: 'Management' };
const REASONS: Text[] = [
  { bn: 'স্ক্যান করতে ভুলে গিয়েছিল', en: 'Cashier forgot to scan' },
  { bn: 'ভুল করে বেশি দেওয়া হয়েছে', en: 'Given by mistake' },
  { bn: 'বিশেষ উপহার', en: 'Special gift' },
];

/** A line of this session's activity, shaped like the sample timeline entries. */
function toTimeline(h: HistoryItem) {
  const count = h.count ?? 0;
  const what: Text =
    h.type === 'stamp'
      ? { bn: `${count > 0 ? '+' : ''}${bnDigits(String(count))}টি Stamp`, en: `${count > 0 ? '+' : ''}${count} stamp${Math.abs(count) > 1 ? 's' : ''}` }
      : h.detail;
  return {
    color: h.type === 'stamp' ? '#F5D900' : h.type === 'reward' ? '#FF8A9A' : '#8FE3D8',
    mark: h.type === 'stamp' ? (count < 0 ? '−' : '+') : h.type === 'reward' ? '★' : '✓',
    what,
    meta: h.type === 'stamp' ? h.detail : h.group,
    when: h.time,
  };
}

export default function OwnerCustomerPage() {
  const { id } = useParams<{ id: string }>();
  const store = useStore();
  const shop = useProgram();
  const TOTAL = shop.total;
  const customer = store.customer(id);
  const card = customer ? store.cards[customer.id] : undefined;
  const { tx, l, n } = useI18n();
  const [change, setChange] = useState(0);
  const [reason, setReason] = useState(0);
  const [saved, setSaved] = useState<{ delta: number; completed: boolean } | null>(null);
  if (!customer || !card) notFound();

  const isNew = store.added.some((c) => c.id === customer.id);
  const entries = [...card.activity.map(toTimeline), ...(isNew ? [] : timeline)];

  const stats = [
    { label: tx('মোট ভিজিট', 'Total visits'), value: n(card.visits), bg: 'var(--brand-soft)' },
    { label: tx('মোট Stamp', 'Total stamps'), value: n(card.lifetime), bg: 'var(--tangerine-soft)' },
    { label: tx('নেওয়া Reward', 'Rewards'), value: n(card.earned), bg: 'var(--rose-soft)' },
    { label: tx('গড় বিরতি', 'Average gap'), value: isNew ? '—' : tx('৪ দিন', '4 days'), bg: 'var(--aqua-soft)' },
  ];

  const save = () => {
    if (!change) return;
    const { completed } = store.addStamps(customer.id, change, {
      detail: { bn: `ম্যানেজমেন্ট সমন্বয় · ${REASONS[reason].bn}`, en: `Adjusted by management · ${REASONS[reason].en}` },
      by: MANAGEMENT,
      source: 'owner',
    });
    setSaved({ delta: change, completed });
    setChange(0);
  };

  return (
    <>
      <OwnerHeader
        back={<Link href="/owner/customers" className="inline-flex min-h-8 items-center gap-1.5 self-start text-sm font-bold"><ArrowLeft size={16} aria-hidden="true" />{tx('সব গ্রাহক', 'All customers')}</Link>}
        title={l(customer.name)}
        subtitle={isNew ? tx('আজ থেকে গ্রাহক', 'Customer since today') : tx('গ্রাহক ১২ মে ২০২৬ থেকে · মিরপুর ১০', 'Customer since 12 May 2026 · Mirpur 10')}
        actions={<ButtonLink href="/owner/sms" variant="secondary" size="sm"><Send size={18} aria-hidden="true" />{tx('SMS পাঠান', 'Send SMS')}</ButtonLink>}
      />
      <div className="flex flex-wrap items-start gap-[18px]">
        <div className="flex min-w-0 flex-[3_1_420px] flex-col gap-[18px]">
          <Card className="flex flex-wrap items-center gap-[18px]">
            <span className="flex size-[72px] items-center justify-center rounded-[24px] font-display text-[28px] font-extrabold text-navy" style={{ background: customer.avatar }}>{l(customer.initial)}</span>
            <dl className="grid flex-[1_1_260px] grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">{tx('মোবাইল', 'Mobile')}</dt><dd className="font-bold">{customer.phone}</dd>
              <dt className="text-muted">{tx('জন্মদিন', 'Birthday')}</dt><dd className="font-bold">{isNew ? '—' : tx('১২ মার্চ', '12 March')}</dd>
              <dt className="text-muted">{tx('প্রিয় আইটেম', 'Favourite item')}</dt><dd className="font-bold">{isNew ? '—' : tx('বাবল টি', 'Bubble tea')}</dd>
            </dl>
            <div className="flex basis-full flex-wrap gap-1.5">
              <Badge tone="ok">{isNew || card.visits < 10 ? tx('নতুন', 'New') : tx('নিয়মিত', 'Regular')}</Badge>
              {!isNew && <Badge tone="info">{tx('বাবল টি প্রেমী', 'Bubble tea fan')}</Badge>}
              {card.vouchers.some((v) => v.status === 'ready') && <Badge tone="warn">{tx('Reward রেডি', 'Reward ready')}</Badge>}
            </div>
          </Card>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
            {stats.map((s) => (
              <div key={s.label} className="rounded-[20px] p-4" style={{ background: s.bg }}>
                <p className="text-[13px] font-semibold text-muted">{s.label}</p>
                <p className="font-display text-[30px] font-bold leading-tight">{s.value}</p>
              </div>
            ))}
          </div>
          <Card>
            <CardTitle>{tx('কার্যকলাপ', 'Activity')}</CardTitle>
            <ul>
              {entries.map((e, i) => (
                <li key={i} className="flex min-h-[60px] items-center gap-3.5 border-t border-line">
                  <IconChip color={e.color} size={38} className="rounded-[13px]">{e.mark}</IconChip>
                  <span className="min-w-0 flex-1"><span className="block font-bold">{l(e.what)}</span><span className="block text-[13px] text-muted">{l(e.meta)}</span></span>
                  <span className="whitespace-nowrap text-[13px] text-muted">{l(e.when)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="flex min-w-0 flex-[2_1_300px] flex-col gap-[18px]">
          <section aria-label={tx('বর্তমান কার্ড', 'Current card')} className="relative flex flex-col gap-3.5 overflow-hidden rounded-[24px] p-5" style={{ background: shop.color, color: shop.fg }}>
            <span aria-hidden="true" className="absolute -right-8 -top-8 size-[110px] rounded-full" style={{ background: shop.deco1 }} />
            <div className="relative flex items-baseline justify-between"><span className="font-bold">{tx('বর্তমান কার্ড', 'Current card')}</span><span className="rounded-full px-3 font-display text-[26px] font-extrabold" style={{ background: shop.stampBg, color: shop.stampFg }}>{n(card.stamps)}/{n(TOTAL)}</span></div>
            <div className="relative grid gap-[5px]" style={{ gridTemplateColumns: `repeat(${Math.min(TOTAL, 10)}, minmax(0, 1fr))` }}>
              {Array.from({ length: TOTAL }, (_, i) => <span key={i} className={cn('aspect-square rounded-full', i >= card.stamps && 'border-2 border-dashed')} style={i < card.stamps ? { background: shop.stampBg } : { borderColor: shop.dash }} />)}
            </div>
          </section>
          <Card className="flex flex-col gap-3.5">
            <div><h2 className="text-lg font-bold">{tx('Stamp ঠিক করুন', 'Adjust stamps')}</h2><p className="mt-1 text-[13px] text-muted">{tx('ভুল হলে হাতে যোগ বা বাদ দিন। সব পরিবর্তন রেকর্ড থাকবে।', 'Fix mistakes by hand. Every change is logged.')}</p></div>
            <Stepper
              label={tx('পরিবর্তন', 'Change')}
              value={`${change > 0 ? '+' : ''}${n(change)}`}
              valueClassName={change > 0 ? 'text-ok' : change < 0 ? 'text-danger' : ''}
              onDecrease={() => { setChange(Math.max(-card.stamps, change - 1)); setSaved(null); }}
              onIncrease={() => { setChange(Math.min(TOTAL - card.stamps, change + 1)); setSaved(null); }}
              decreaseLabel={tx('কমান', 'Remove')}
              increaseLabel={tx('বাড়ান', 'Add')}
            />
            <Field id="reason" label={tx('কারণ', 'Reason')}>
              <select id="reason" value={reason} onChange={(e) => setReason(Number(e.target.value))} className={inputClass}>
                {REASONS.map((r, i) => <option key={r.en} value={i}>{l(r)}</option>)}
              </select>
            </Field>
            <Button onClick={save} disabled={!change}>{tx('সেভ করুন', 'Save change')}</Button>
            {saved && (
              <Notice>
                {saved.completed
                  ? tx('সেভ হয়েছে। কার্ড সম্পূর্ণ, গ্রাহক একটি Reward ভাউচার পেয়েছেন।', 'Saved. The card is complete and the customer got a reward voucher.')
                  : tx(`সেভ হয়েছে: ${saved.delta > 0 ? '+' : ''}${n(saved.delta)} Stamp`, `Saved: ${saved.delta > 0 ? '+' : ''}${saved.delta} stamp${Math.abs(saved.delta) === 1 ? '' : 's'}`)}
              </Notice>
            )}
          </Card>
          <Card className="flex flex-col gap-2">
            <label htmlFor="note" className="text-lg font-bold">{tx('ব্যক্তিগত নোট', 'Private note')}</label>
            <textarea id="note" rows={3} placeholder={tx('কম চিনি পছন্দ করেন', 'Prefers less sugar')} className={`${inputClass} h-auto resize-y py-3 leading-relaxed`} />
          </Card>
        </div>
      </div>
    </>
  );
}
