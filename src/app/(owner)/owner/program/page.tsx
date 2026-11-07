'use client';

import { useEffect, useMemo, useState } from 'react';
import { Cake, Check, CupSoda, Gift, Star } from 'lucide-react';
import { OwnerHeader } from '@/components/owner-header';
import { LoyaltyCard } from '@/components/loyalty-card';
import { SwitchRow } from '@/components/setting-row';
import { Button, Card, Field, Notice, Stepper, inputClass } from '@/components/ui';
import { shop as baseShop } from '@/lib/data';
import { useI18n } from '@/lib/i18n';
import { CARD_COLORS, REWARD_ITEMS, buildShop, type Program } from '@/lib/program';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/cn';

const MANAGEMENT = { bn: 'ম্যানেজমেন্ট', en: 'Management' };

export default function ProgramPage() {
  const { tx, l, n } = useI18n();
  const store = useStore();
  const live = store.program;
  // The birthday and double-stamp switches turn the matching offers on and off, so customers see them in the offers bar.
  const birthdayOffer = store.offers.find((o) => o.kind === 'birthday');
  const doubleOffer = store.offers.find((o) => o.id === 'double-friday');

  const [draft, setDraft] = useState<Program>(live);
  const [birthday, setBirthday] = useState(birthdayOffer?.status === 'live');
  const [doubleDay, setDoubleDay] = useState(doubleOffer?.status === 'live');
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState<{ completed: number } | null>(null);

  // Follow the live program until editing starts, so a change saved in another tab shows up here too.
  useEffect(() => {
    if (dirty) return;
    setDraft(live);
    setBirthday(birthdayOffer?.status === 'live');
    setDoubleDay(doubleOffer?.status === 'live');
  }, [live, birthdayOffer?.status, doubleOffer?.status, dirty]);

  const edit = (patch: Partial<Program>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
    setSaved(null);
  };
  const toggle = (set: (v: boolean) => void) => (value: boolean) => {
    set(value);
    setDirty(true);
    setSaved(null);
  };
  const toggleItem = (id: string) => edit({ items: REWARD_ITEMS.map((i) => i.id).filter((x) => (x === id ? !draft.items.includes(x) : draft.items.includes(x))) });

  // A smaller card completes the cards of customers who already have that many stamps.
  const completing = draft.total < live.total ? store.customers.filter((c) => (store.cards[c.id]?.stamps ?? 0) >= draft.total).length : 0;

  const preview = useMemo(
    () => buildShop(baseShop, { ...draft, name: { bn: draft.name.bn.trim() || draft.name.en.trim() || 'লয়্যালটি কার্ড', en: draft.name.en.trim() || 'Loyalty card' } }),
    [draft],
  );

  const save = () => {
    store.saveProgram(
      {
        ...draft,
        name: { bn: draft.name.bn.trim() || draft.name.en.trim() || 'লয়্যালটি কার্ড', en: draft.name.en.trim() || 'Loyalty card' },
        minPurchase: Math.max(0, Math.round(draft.minPurchase)),
      },
      MANAGEMENT,
    );
    if (birthdayOffer && (birthdayOffer.status === 'live') !== birthday) store.setOfferStatus(birthdayOffer.id, birthday ? 'live' : 'paused');
    if (doubleOffer && (doubleOffer.status === 'live') !== doubleDay) store.setOfferStatus(doubleOffer.id, doubleDay ? 'live' : 'paused');
    setSaved({ completed: completing });
    setDirty(false);
  };

  return (
    <>
      <OwnerHeader
        title={tx('লয়্যালটি কার্ড', 'Loyalty card')}
        subtitle={tx('গ্রাহক কীভাবে Stamp ও Reward পাবেন তা ঠিক করুন', 'Decide how customers earn stamps and rewards')}
        actions={<Button size="sm" onClick={save} disabled={!dirty || !draft.items.length}><Check size={18} strokeWidth={2.4} aria-hidden="true" />{tx('সেভ করুন', 'Save changes')}</Button>}
      />
      {saved && (
        <Notice>
          {tx('সেভ হয়েছে। সব গ্রাহকের কার্ড এখন এই প্রোগ্রাম অনুযায়ী চলছে।', 'Saved. Every customer’s card now follows this program.')}
          {saved.completed > 0 && ` ${tx(`${n(saved.completed)} জন কার্ড সম্পূর্ণ করে Reward ভাউচার পেয়েছেন।`, `${saved.completed} customer${saved.completed === 1 ? '' : 's'} completed their card and got a reward voucher.`)}`}
        </Notice>
      )}
      <div className="flex flex-wrap items-start gap-[18px]">
        <div className="flex min-w-0 flex-[3_1_420px] flex-col gap-[18px]">
          <Card className="flex flex-col gap-4">
            <h2 className="text-lg font-bold">{tx('মূল সেটিং', 'Basics')}</h2>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
              <Field id="pname-en" label={tx('কার্ডের নাম (ইংরেজি)', 'Card name (English)')}>
                <input id="pname-en" value={draft.name.en} onChange={(e) => edit({ name: { ...draft.name, en: e.target.value } })} className={inputClass} />
              </Field>
              <Field id="pname-bn" label={tx('কার্ডের নাম (বাংলা)', 'Card name (Bangla)')}>
                <input id="pname-bn" value={draft.name.bn} onChange={(e) => edit({ name: { ...draft.name, bn: e.target.value } })} className={inputClass} />
              </Field>
            </div>
            <Stepper
              label={tx('Reward-এর জন্য Stamp', 'Stamps for a reward')}
              value={n(draft.total)}
              onDecrease={() => edit({ total: Math.max(4, draft.total - 1) })}
              onIncrease={() => edit({ total: Math.min(20, draft.total + 1) })}
              decreaseLabel={tx('কমান', 'Fewer')}
              increaseLabel={tx('বাড়ান', 'More')}
            />
            {completing > 0 && (
              <Notice tone="warn">
                {tx(`${n(completing)} জনের কাছে এখনই ${n(draft.total)}টি বা তার বেশি Stamp আছে। সেভ করলে তাঁরা কার্ড সম্পূর্ণ করে একটি Reward ভাউচার পাবেন।`, `${completing} customer${completing === 1 ? ' has' : 's have'} ${draft.total} or more stamps already. They complete their card and get a reward voucher when you save.`)}
              </Notice>
            )}
            <fieldset>
              <legend className="font-bold">{tx('Reward আইটেম', 'Reward items')}</legend>
              <p className="mb-2.5 text-[13px] text-muted">{tx('গ্রাহক এর মধ্যে থেকে একটি বেছে নেবেন। আগে দেওয়া ভাউচারে আগের আইটেমই থাকবে।', 'Customers pick one of these. Vouchers already issued keep the items they had.')}</p>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2.5">
                {REWARD_ITEMS.map((it) => {
                  const on = draft.items.includes(it.id);
                  return (
                    <button
                      key={it.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleItem(it.id)}
                      className={cn('flex min-h-16 items-center gap-3 rounded-2xl border-2 px-3.5 py-2.5 text-left font-bold', on ? 'border-brand bg-brand-soft' : 'border-line bg-surface')}
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl text-navy" style={{ background: it.chip }}><CupSoda size={20} aria-hidden="true" /></span>
                      <span className="flex-1">{l(it.name)}</span>
                      <span className={cn('flex size-6 items-center justify-center rounded-lg text-brand-on', on ? 'bg-brand' : 'bg-surface2')}>{on && <Check size={16} strokeWidth={3} aria-hidden="true" />}</span>
                    </button>
                  );
                })}
              </div>
              {!draft.items.length && <p role="alert" className="mt-2 text-[13px] font-semibold text-danger">{tx('অন্তত একটি Reward বেছে নিন', 'Pick at least one reward')}</p>}
            </fieldset>
          </Card>
          <Card className="flex flex-col gap-4">
            <h2 className="text-lg font-bold">{tx('Stamp পাওয়ার নিয়ম', 'Earning rules')}</h2>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
              <Field id="min" label={tx('ন্যূনতম কেনাকাটা (৳)', 'Minimum purchase (৳)')} hint={tx('ক্যাশিয়ারের স্ক্রিনে দেখায়', 'Shown on the cashier’s screen')}>
                <input id="min" type="number" min={0} step={10} inputMode="numeric" value={draft.minPurchase} onChange={(e) => edit({ minPurchase: Math.max(0, Number(e.target.value) || 0) })} className={inputClass} />
              </Field>
              <Field id="daily" label={tx('দিনে সর্বোচ্চ', 'Daily limit')} hint={tx('ক্যাশিয়ার এর বেশি দিতে পারবেন না', 'The cashier can’t give more than this')}>
                <select id="daily" value={draft.dailyLimit} onChange={(e) => edit({ dailyLimit: Number(e.target.value) })} className={inputClass}>
                  <option value={1}>{tx('১টি Stamp', '1 stamp')}</option>
                  <option value={2}>{tx('২টি Stamp', '2 stamps')}</option>
                  <option value={3}>{tx('৩টি Stamp', '3 stamps')}</option>
                  <option value={0}>{tx('সীমা নেই', 'No limit')}</option>
                </select>
              </Field>
              <Field id="exp" label={tx('Stamp-এর মেয়াদ', 'Stamp expiry')} hint={tx('গ্রাহকের কার্ডের নিয়মে দেখায়', 'Shown in the customer’s card rules')}>
                <select id="exp" value={draft.expiryDays} onChange={(e) => edit({ expiryDays: Number(e.target.value) })} className={inputClass}>
                  <option value={30}>{tx('৩০ দিন', '30 days')}</option>
                  <option value={60}>{tx('৬০ দিন', '60 days')}</option>
                  <option value={90}>{tx('৯০ দিন', '90 days')}</option>
                  <option value={0}>{tx('কখনো না', 'Never')}</option>
                </select>
              </Field>
            </div>
            <div>
              <SwitchRow icon={<Gift size={18} aria-hidden="true" />} color="#8FE3D8" label={tx('স্বাগতম বোনাস', 'Welcome bonus')} sub={tx('নতুন গ্রাহক যোগ দিলেই ১টি Stamp', '1 free stamp when a customer joins')} checked={draft.welcome} onChange={(v) => edit({ welcome: v })} />
              <SwitchRow
                icon={<Cake size={18} aria-hidden="true" />}
                color="#FF8FB1"
                label={tx('জন্মদিনের Reward', 'Birthday reward')}
                sub={birthdayOffer ? tx('অফার বারে জন্মদিনের উপহার চালু বা বন্ধ করে', 'Turns the Birthday treat offer on or off') : tx('অফার স্ক্রিনে এই অফারটি মুছে ফেলা হয়েছে', 'This offer was deleted on the Offers screen')}
                checked={birthday}
                onChange={toggle(setBirthday)}
              />
              <SwitchRow
                icon={<Star size={18} aria-hidden="true" />}
                color="#F5D900"
                label={tx('ডাবল Stamp দিন', 'Double stamp day')}
                sub={doubleOffer ? tx('অফার বারে শুক্রবার ডাবল Stamp চালু বা বন্ধ করে', 'Turns the Double stamp Friday offer on or off') : tx('অফার স্ক্রিনে এই অফারটি মুছে ফেলা হয়েছে', 'This offer was deleted on the Offers screen')}
                checked={doubleDay}
                onChange={toggle(setDoubleDay)}
              />
            </div>
          </Card>
        </div>

        <Card className="flex min-w-0 flex-[2_1_320px] flex-col gap-4 lg:sticky lg:top-6">
          <div><h2 className="text-lg font-bold">{tx('লাইভ প্রিভিউ', 'Live preview')}</h2><p className="mt-1 text-[13px] text-muted">{tx('গ্রাহকের ফোনে কার্ড এভাবে দেখাবে', 'How the card looks on a customer’s phone')}</p></div>
          <div className="w-full max-w-[360px] self-center rounded-[36px] border-8 border-ink bg-bg px-3 py-[18px]">
            <LoyaltyCard shop={preview} collected={Math.min(3, preview.total - 1)} memberName={tx('তানভীর আহমেদ', 'Tanvir Ahmed')} memberId="A7K-2931" />
          </div>
          <fieldset>
            <legend className="mb-2.5 font-bold">{tx('কার্ডের রং', 'Card colour')}</legend>
            <div className="flex flex-wrap gap-2.5">
              {CARD_COLORS.map((col, i) => (
                <button key={col.id} type="button" aria-label={l(col.name)} aria-pressed={draft.color === i} onClick={() => edit({ color: i })} className={cn('size-11 rounded-full border-[3px]', draft.color === i ? 'border-surface outline outline-2 outline-ink' : 'border-transparent')} style={{ background: col.color }} />
              ))}
            </div>
          </fieldset>
        </Card>
      </div>
    </>
  );
}
