'use client';

import { useMemo, useRef, useState } from 'react';
import { useSWRConfig } from 'swr';
import { Cake, Check, CupSoda, Gift, Lock, Star } from 'lucide-react';
import { OwnerHeader } from '@/components/owner-header';
import { LoyaltyCard } from '@/components/loyalty-card';
import { SwitchRow } from '@/components/setting-row';
import { Button, Card, Field, Notice, Stepper, inputClass } from '@/components/ui';
import { toProgram, toProgramSave } from '@/lib/api/adapters';
import { ADMIN_KEYS, ALERT_CLASS, isAdminKey, useAdminProgram, useProgramImpact } from '@/lib/api/admin-config';
import { ApiError, api, isApiError } from '@/lib/api/client';
import { errorText } from '@/lib/api/messages';
import { useSession } from '@/lib/api/session';
import type { AdminProgramDto, ProgramImpactDto, ProgramSaveResultDto } from '@/lib/contracts/admin';
import { shop as baseShop } from '@/lib/data';
import { useI18n, type Text } from '@/lib/i18n';
import { CARD_COLORS, REWARD_ITEMS, buildShop, type Program } from '@/lib/program';
import { cn } from '@/lib/cn';

const DEFAULT_NAME: Text = { bn: 'লয়্যালটি কার্ড', en: 'Loyalty card' };

/** The same text the server answers a stale save with, for when the screen notices a newer version before saving. */
const CONFLICT: Text = errorText(new ApiError(409, 'VERSION_CONFLICT', 'The program was changed by someone else'));

/** What is saved and previewed: names trimmed (Bangla stands in with the English name), the minimum purchase a whole number in range. */
const clean = (p: Program): Program => ({
  ...p,
  name: { bn: p.name.bn.trim() || p.name.en.trim() || DEFAULT_NAME.bn, en: p.name.en.trim() || DEFAULT_NAME.en },
  minPurchase: Math.min(100_000, Math.max(0, Math.round(p.minPurchase))),
});

const same = (a: Program, b: Program) =>
  a.name.bn === b.name.bn &&
  a.name.en === b.name.en &&
  a.total === b.total &&
  a.minPurchase === b.minPurchase &&
  a.dailyLimit === b.dailyLimit &&
  a.expiryDays === b.expiryDays &&
  a.welcome === b.welcome &&
  a.color === b.color &&
  a.items.length === b.items.length &&
  a.items.every((id) => b.items.includes(id));

/** What the owner has changed on this screen and not saved yet. While there is none, the screen simply follows the server. */
type Edits = {
  program: Program;
  birthday: boolean;
  doubleDay: boolean;
  /** What the editing started from: the version to send back with the save, and the switches as they were. */
  from: { version: number; birthday: boolean | null; doubleDay: boolean | null };
};

export default function ProgramPage() {
  const { tx, l, n } = useI18n();
  const { mutate } = useSWRConfig();
  const { staff, loading: sessionLoading } = useSession();
  const { data, error, isLoading, mutate: refetch } = useAdminProgram();

  const [edits, setEdits] = useState<Edits | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<ProgramImpactDto | null>(null);
  const [problem, setProblem] = useState<Text | null>(null);
  const [conflict, setConflict] = useState(false);
  const [reloading, setReloading] = useState(false);
  /** The version this screen itself just saved, so the newer version it sees right after saving is not mistaken for someone else's. */
  const ownVersion = useRef<number | null>(null);

  // Only the owner can change the program (MG-08). A manager sees the same screen, read only.
  const canEdit = staff?.role === 'owner';
  const readOnly = !sessionLoading && !!staff && !canEdit;
  const locked = !canEdit || saving;

  const server = useMemo(() => (data ? toProgram(data.program) : null), [data]);
  const program = edits?.program ?? server;
  // The birthday and double-stamp switches turn the matching offers on and off. Null from the server means that offer was deleted.
  const birthday = edits ? edits.birthday : data?.birthdayOn === true;
  const doubleDay = edits ? edits.doubleDay : data?.doubleStampOn === true;
  const birthdayGone = data?.birthdayOn === null;
  const doubleGone = data?.doubleStampOn === null;

  // A smaller card completes the cards of customers who already have that many stamps: ask the server how many (MG-09).
  const { impact, error: impactError } = useProgramImpact(program?.total ?? 0, server?.total ?? null, canEdit && !!edits);

  const preview = useMemo(() => (program ? buildShop(baseShop, clean(program)) : null), [program]);

  const changed =
    !!edits &&
    !!server &&
    (!same(clean(edits.program), clean(server)) || edits.birthday !== (edits.from.birthday === true) || edits.doubleDay !== (edits.from.doubleDay === true));
  // Someone else saved while this screen was being edited: the version it started from is out of date.
  const stale = !!edits && !!data && data.program.version !== edits.from.version && data.program.version !== ownVersion.current;
  const needsReload = conflict || stale;

  const update = (change: (e: Edits) => Edits) => {
    if (!canEdit || !data || !server) return;
    setSaved(null);
    setProblem(null);
    setEdits((current) => {
      const base: Edits = current ?? {
        program: server,
        birthday: data.birthdayOn === true,
        doubleDay: data.doubleStampOn === true,
        from: { version: data.program.version, birthday: data.birthdayOn, doubleDay: data.doubleStampOn },
      };
      return change(base);
    });
  };
  const edit = (patch: Partial<Program>) => update((e) => ({ ...e, program: { ...e.program, ...patch } }));
  const toggleItem = (id: string) => {
    if (!program) return;
    edit({ items: REWARD_ITEMS.map((i) => i.id).filter((x) => (x === id ? !program.items.includes(x) : program.items.includes(x))) });
  };

  const save = async () => {
    if (!edits || !data || saving || !changed) return;
    setSaving(true);
    setProblem(null);
    setSaved(null);
    try {
      const res = await api.put<ProgramSaveResultDto>(ADMIN_KEYS.program, {
        ...toProgramSave(clean(edits.program), edits.from.version),
        // Send a switch only when this owner changed it, so a switch someone else flipped meanwhile is not undone.
        ...(!birthdayGone && edits.birthday !== (edits.from.birthday === true) ? { birthdayOn: edits.birthday } : {}),
        ...(!doubleGone && edits.doubleDay !== (edits.from.doubleDay === true) ? { doubleStampOn: edits.doubleDay } : {}),
      });
      const fresh: AdminProgramDto = { program: res.program, birthdayOn: res.birthdayOn, doubleStampOn: res.doubleStampOn };
      ownVersion.current = res.program.version;
      // Set both caches from the answer instead of asking again (GET /api/program is cached for a short while and could hand back
      // the old program). All of this runs in one tick, so the screen goes straight from "editing" to "saved".
      void mutate(ADMIN_KEYS.program, fresh, { revalidate: false });
      void mutate(ADMIN_KEYS.publicProgram, res.program, { revalidate: false });
      // Cards may have been completed and offers switched, so the customer list, dashboard and offers are out of date too.
      void mutate((key) => isAdminKey(key) && key !== ADMIN_KEYS.program);
      setEdits(null);
      setSaved(res.completed);
    } catch (e) {
      // A stale save has its own banner with the "Reload latest" button. Anything else is shown as a line of its own.
      if (isApiError(e) && e.code === 'VERSION_CONFLICT') setConflict(true);
      else setProblem(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  /** Throws the edits away and takes the latest program from the server. */
  const reload = async () => {
    setReloading(true);
    setProblem(null);
    try {
      const fresh = await api.get<AdminProgramDto>(ADMIN_KEYS.program);
      await Promise.all([mutate(ADMIN_KEYS.program, fresh, { revalidate: false }), mutate(ADMIN_KEYS.publicProgram, fresh.program, { revalidate: false })]);
      setEdits(null);
      setConflict(false);
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setReloading(false);
    }
  };

  return (
    <>
      <OwnerHeader
        title={tx('লয়্যালটি কার্ড', 'Loyalty card')}
        subtitle={tx('গ্রাহক কীভাবে Stamp ও Reward পাবেন তা ঠিক করুন', 'Decide how customers earn stamps and rewards')}
        actions={
          canEdit ? (
            <Button size="sm" onClick={() => void save()} disabled={!changed || !program?.items.length || saving || needsReload}>
              <Check size={18} strokeWidth={2.4} aria-hidden="true" />
              {saving ? tx('সেভ হচ্ছে…', 'Saving…') : tx('সেভ করুন', 'Save changes')}
            </Button>
          ) : undefined
        }
      />
      {readOnly && (
        <Notice tone="warn">
          <Lock size={16} className="mr-1.5 inline align-[-2px]" aria-hidden="true" />
          {tx('শুধু মালিক প্রোগ্রাম বদলাতে পারেন', 'Only the owner can change the program')}
        </Notice>
      )}
      {saved && (
        <Notice>
          {tx('সেভ হয়েছে। সব গ্রাহকের কার্ড এখন এই প্রোগ্রাম অনুযায়ী চলছে।', 'Saved. Every customer’s card now follows this program.')}
          {saved.cards > 0 &&
            ` ${tx(
              `${n(saved.cards)} জনের কার্ড সম্পূর্ণ হয়েছে এবং ${n(saved.vouchers)}টি Reward ভাউচার দেওয়া হয়েছে।`,
              `${saved.cards} customer${saved.cards === 1 ? '' : 's'} completed their card and ${saved.vouchers} reward voucher${saved.vouchers === 1 ? ' was' : 's were'} issued.`,
            )}`}
        </Notice>
      )}
      {needsReload && (
        <div role="alert" className={cn(ALERT_CLASS, 'flex flex-wrap items-center gap-3')}>
          <p className="flex-[1_1_240px]">{l(CONFLICT)}</p>
          <Button variant="secondary" size="sm" onClick={() => void reload()} disabled={reloading}>
            {reloading ? tx('লোড হচ্ছে…', 'Loading…') : tx('সর্বশেষটি লোড করুন', 'Reload latest')}
          </Button>
        </div>
      )}
      {problem && <p role="alert" className={ALERT_CLASS}>{l(problem)}</p>}

      {!program || !preview ? (
        error && !data ? (
          <Card className="flex flex-col items-center gap-3 p-8 text-center">
            <p role="alert" className="font-bold text-danger">{l(errorText(error))}</p>
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>{tx('আবার চেষ্টা করুন', 'Try again')}</Button>
          </Card>
        ) : (
          <Card role="status" className="p-8 text-center text-muted">{isLoading ? tx('লোড হচ্ছে…', 'Loading…') : tx('প্রোগ্রাম পাওয়া যায়নি।', 'The program could not be loaded.')}</Card>
        )
      ) : (
        <div className="flex flex-wrap items-start gap-[18px]">
          <fieldset disabled={locked} className="m-0 flex min-w-0 flex-[3_1_420px] flex-col gap-[18px] border-0 p-0 [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-60">
            <Card className="flex flex-col gap-4">
              <h2 className="text-lg font-bold">{tx('মূল সেটিং', 'Basics')}</h2>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
                <Field id="pname-en" label={tx('কার্ডের নাম (ইংরেজি)', 'Card name (English)')}>
                  <input id="pname-en" maxLength={40} value={program.name.en} onChange={(e) => edit({ name: { ...program.name, en: e.target.value } })} className={inputClass} />
                </Field>
                <Field id="pname-bn" label={tx('কার্ডের নাম (বাংলা)', 'Card name (Bangla)')}>
                  <input id="pname-bn" maxLength={40} value={program.name.bn} onChange={(e) => edit({ name: { ...program.name, bn: e.target.value } })} className={inputClass} />
                </Field>
              </div>
              <Stepper
                label={tx('Reward-এর জন্য Stamp', 'Stamps for a reward')}
                value={n(program.total)}
                onDecrease={() => edit({ total: Math.max(4, program.total - 1) })}
                onIncrease={() => edit({ total: Math.min(20, program.total + 1) })}
                decreaseLabel={tx('কমান', 'Fewer')}
                increaseLabel={tx('বাড়ান', 'More')}
              />
              {impact && impact.cards > 0 && (
                <Notice tone="warn">
                  {tx(
                    `${n(impact.cards)} জনের কাছে এখনই ${n(program.total)}টি বা তার বেশি Stamp আছে। সেভ করলে তাঁরা কার্ড সম্পূর্ণ করে Reward ভাউচার পাবেন${impact.vouchers > impact.cards ? ` (মোট ${n(impact.vouchers)}টি ভাউচার)` : ''}।`,
                    `${impact.cards} customer${impact.cards === 1 ? ' has' : 's have'} ${program.total} or more stamps already. They complete their card and get a reward voucher when you save${impact.vouchers > impact.cards ? ` (${impact.vouchers} vouchers in all)` : ''}.`,
                  )}
                </Notice>
              )}
              {impactError && !impact && (
                <Notice tone="warn">
                  {tx(
                    `কতজনের কার্ড সম্পূর্ণ হবে তা এখন দেখা যাচ্ছে না। যাঁদের কাছে ${n(program.total)}টি বা তার বেশি Stamp আছে, সেভ করলে তাঁদের কার্ড সম্পূর্ণ হয়ে যাবে।`,
                    `Could not check how many customers this affects. Anyone with ${program.total} or more stamps completes their card when you save.`,
                  )}
                </Notice>
              )}
              <fieldset>
                <legend className="font-bold">{tx('Reward আইটেম', 'Reward items')}</legend>
                <p className="mb-2.5 text-[13px] text-muted">{tx('গ্রাহক এর মধ্যে থেকে একটি বেছে নেবেন। আগে দেওয়া ভাউচারে আগের আইটেমই থাকবে।', 'Customers pick one of these. Vouchers already issued keep the items they had.')}</p>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2.5">
                  {REWARD_ITEMS.map((it) => {
                    const on = program.items.includes(it.id);
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
                {!program.items.length && <p role="alert" className="mt-2 text-[13px] font-semibold text-danger">{tx('অন্তত একটি Reward বেছে নিন', 'Pick at least one reward')}</p>}
              </fieldset>
            </Card>
            <Card className="flex flex-col gap-4">
              <h2 className="text-lg font-bold">{tx('Stamp পাওয়ার নিয়ম', 'Earning rules')}</h2>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
                <Field id="min" label={tx('ন্যূনতম কেনাকাটা (৳)', 'Minimum purchase (৳)')} hint={tx('ক্যাশিয়ারের স্ক্রিনে দেখায়', 'Shown on the cashier’s screen')}>
                  <input id="min" type="number" min={0} max={100000} step={10} inputMode="numeric" value={program.minPurchase} onChange={(e) => edit({ minPurchase: Math.min(100_000, Math.max(0, Number(e.target.value) || 0)) })} className={inputClass} />
                </Field>
                <Field id="daily" label={tx('দিনে সর্বোচ্চ', 'Daily limit')} hint={tx('এর বেশি দিতে ক্যাশিয়ারকে ম্যানেজারের PIN দিতে হবে', 'A cashier needs a manager’s PIN to go over this')}>
                  <select id="daily" value={program.dailyLimit} onChange={(e) => edit({ dailyLimit: Number(e.target.value) })} className={inputClass}>
                    <option value={1}>{tx('১টি Stamp', '1 stamp')}</option>
                    <option value={2}>{tx('২টি Stamp', '2 stamps')}</option>
                    <option value={3}>{tx('৩টি Stamp', '3 stamps')}</option>
                    <option value={0}>{tx('সীমা নেই', 'No limit')}</option>
                  </select>
                </Field>
                <Field id="exp" label={tx('Stamp-এর মেয়াদ', 'Stamp expiry')} hint={tx('গ্রাহকের কার্ডের নিয়মে দেখায়', 'Shown in the customer’s card rules')}>
                  <select id="exp" value={program.expiryDays} onChange={(e) => edit({ expiryDays: Number(e.target.value) })} className={inputClass}>
                    <option value={30}>{tx('৩০ দিন', '30 days')}</option>
                    <option value={60}>{tx('৬০ দিন', '60 days')}</option>
                    <option value={90}>{tx('৯০ দিন', '90 days')}</option>
                    <option value={0}>{tx('কখনো না', 'Never')}</option>
                  </select>
                </Field>
              </div>
              <div>
                <SwitchRow icon={<Gift size={18} aria-hidden="true" />} color="#8FE3D8" label={tx('স্বাগতম বোনাস', 'Welcome bonus')} sub={tx('নতুন গ্রাহক যোগ দিলেই ১টি Stamp', '1 free stamp when a customer joins')} checked={program.welcome} onChange={(v) => edit({ welcome: v })} />
                <fieldset disabled={birthdayGone} className={cn('m-0 min-w-0 border-0 p-0', birthdayGone && 'opacity-60')}>
                  <SwitchRow
                    icon={<Cake size={18} aria-hidden="true" />}
                    color="#FF8FB1"
                    label={tx('জন্মদিনের Reward', 'Birthday reward')}
                    sub={birthdayGone ? tx('অফার স্ক্রিনে এই অফারটি মুছে ফেলা হয়েছে', 'This offer was deleted on the Offers screen') : tx('অফার বারে জন্মদিনের অফার চালু বা বন্ধ করে', 'Turns the birthday offer on or off')}
                    checked={birthday}
                    onChange={(v) => update((e) => ({ ...e, birthday: v }))}
                  />
                </fieldset>
                <fieldset disabled={doubleGone} className={cn('m-0 min-w-0 border-0 p-0', doubleGone && 'opacity-60')}>
                  <SwitchRow
                    icon={<Star size={18} aria-hidden="true" />}
                    color="#F5D900"
                    label={tx('ডাবল Stamp দিন', 'Double stamp day')}
                    sub={doubleGone ? tx('অফার স্ক্রিনে এই অফারটি মুছে ফেলা হয়েছে', 'This offer was deleted on the Offers screen') : tx('অফার বারে ডাবল Stamp অফার চালু বা বন্ধ করে', 'Turns the double-stamp offer on or off')}
                    checked={doubleDay}
                    onChange={(v) => update((e) => ({ ...e, doubleDay: v }))}
                  />
                </fieldset>
              </div>
            </Card>
          </fieldset>

          <Card className="flex min-w-0 flex-[2_1_320px] flex-col gap-4 lg:sticky lg:top-6">
            <div><h2 className="text-lg font-bold">{tx('লাইভ প্রিভিউ', 'Live preview')}</h2><p className="mt-1 text-[13px] text-muted">{tx('গ্রাহকের ফোনে কার্ড এভাবে দেখাবে', 'How the card looks on a customer’s phone')}</p></div>
            <div className="w-full max-w-[360px] self-center rounded-[36px] border-8 border-ink bg-bg px-3 py-[18px]">
              <LoyaltyCard shop={preview} collected={Math.min(3, preview.total - 1)} memberName={tx('সদস্যের নাম', 'Member name')} memberId="CJ-000123" />
            </div>
            <fieldset disabled={locked} className="min-w-0 [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-60">
              <legend className="mb-2.5 font-bold">{tx('কার্ডের রং', 'Card colour')}</legend>
              <div className="flex flex-wrap gap-2.5">
                {CARD_COLORS.map((col, i) => (
                  <button key={col.id} type="button" aria-label={l(col.name)} aria-pressed={program.color === i} onClick={() => edit({ color: i })} className={cn('size-11 rounded-full border-[3px]', program.color === i ? 'border-surface outline outline-2 outline-ink' : 'border-transparent')} style={{ background: col.color }} />
                ))}
              </div>
            </fieldset>
          </Card>
        </div>
      )}
    </>
  );
}
