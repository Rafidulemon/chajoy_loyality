'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy, KeyRound, Lock, Plus, X } from 'lucide-react';
import { OwnerHeader } from '@/components/owner-header';
import { Badge, Button, Card, Field, Switch, inputClass, type Tone } from '@/components/ui';
import { ADMIN_KEYS, ALERT_CLASS, copyText, useAdminStaff } from '@/lib/api/admin-config';
import { api, isApiError } from '@/lib/api/client';
import { useBranches } from '@/lib/api/branches';
import { errorText } from '@/lib/api/messages';
import { useSession } from '@/lib/api/session';
import type { StaffRowDto, StaffSecretDto } from '@/lib/contracts/admin';
import type { StaffRoleDto } from '@/lib/contracts/dto';
import { formatPhone, normalizePhone } from '@/lib/domain/phone';
import { avatarColor, bnDigits, initialOf, relativeDays } from '@/lib/format';
import { useI18n, type Text } from '@/lib/i18n';
import { cn } from '@/lib/cn';

const t = (bn: string, en: string): Text => ({ bn, en });

const ROLE: Record<StaffRoleDto, { bn: string; en: string; tone: Tone }> = {
  owner: { bn: 'মালিক', en: 'Owner', tone: 'brand' },
  manager: { bn: 'ম্যানেজার', en: 'Manager', tone: 'ok' },
  cashier: { bn: 'ক্যাশিয়ার', en: 'Cashier', tone: 'warn' },
};

/** "Online now" within 5 minutes of the last request (the server records it about once a minute), then minutes, hours and days. */
function lastActive(iso: string | null, now: number): Text {
  if (!iso) return t('এখনো লগইন করেননি', 'Never signed in');
  const at = Date.parse(iso);
  const minutes = Math.max(0, Math.floor((now - at) / 60_000));
  if (minutes < 5) return t('এখন অনলাইন', 'Online now');
  if (minutes < 60) return t(`${bnDigits(String(minutes))} মিনিট আগে`, `${minutes} min ago`);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t(`${bnDigits(String(hours))} ঘণ্টা আগে`, `${hours} hour${hours === 1 ? '' : 's'} ago`);
  return relativeDays(at, now);
}

/** A PIN the server just made. It lives only in this component's state: it is never stored, and it is gone when the owner closes it or leaves. */
type Secret = { name: string; pin: string; kind: 'created' | 'reset' };

function PinNotice({ secret, onDone }: { secret: Secret; onDone: () => void }) {
  const { tx } = useI18n();
  const ref = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);

  // The panel appears at the top of the page, while a reset starts from a button further down: bring it into view.
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'center' });
    ref.current?.focus({ preventScroll: true });
  }, [secret]);
  useEffect(() => {
    if (copied !== 'yes') return;
    const id = setTimeout(() => setCopied(null), 2500);
    return () => clearTimeout(id);
  }, [copied]);

  const copy = async () => setCopied((await copyText(secret.pin)) ? 'yes' : 'no');

  return (
    <section ref={ref} tabIndex={-1} aria-label={tx('একবার দেখানো PIN', 'One-time PIN')} className="flex flex-col gap-3 rounded-card border-2 border-warn bg-tangerine-soft p-5 text-warn outline-none">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <KeyRound size={20} aria-hidden="true" />
        {secret.kind === 'created' ? tx(`${secret.name}-এর PIN`, `PIN for ${secret.name}`) : tx(`${secret.name}-এর নতুন PIN`, `New PIN for ${secret.name}`)}
      </h2>
      <p className="text-[15px] font-semibold">
        {tx(
          `এই PIN-টি ${secret.name}-কে দিন। এটি শুধু এখনই দেখানো হচ্ছে, পরে আর দেখা যাবে না। তিনি নিজেই PIN বদলে নিতে পারবেন।`,
          `Give this PIN to ${secret.name}. It is shown only now and cannot be read again. They can change it themselves.`,
        )}{' '}
        {secret.kind === 'created' ? tx('মোবাইল নম্বর ও এই PIN দিয়ে লগইন করবেন।', 'They sign in with their mobile number and this PIN.') : tx('তিনি সব ডিভাইস থেকে লগআউট হয়েছেন।', 'They were signed out on every device.')}
      </p>
      <p className="select-all self-start rounded-2xl bg-surface px-5 py-3 font-mono text-[32px] font-extrabold leading-none tracking-[0.3em] text-ink">{secret.pin}</p>
      <div className="flex flex-wrap items-center gap-2.5">
        <Button size="sm" onClick={() => void copy()}>
          {copied === 'yes' ? <Check size={16} strokeWidth={2.6} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          {copied === 'yes' ? tx('কপি হয়েছে', 'Copied') : tx('কপি করুন', 'Copy')}
        </Button>
        <Button variant="secondary" size="sm" onClick={onDone}>{tx('হয়েছে', 'Done')}</Button>
        {copied === 'no' && <span role="status" className="text-sm font-bold">{tx('কপি করা যায়নি। PIN-টি চেপে ধরে কপি করুন।', 'Could not copy. Select the PIN and copy it by hand.')}</span>}
      </div>
    </section>
  );
}

export default function StaffPage() {
  const { tx, l, n } = useI18n();
  const { staff: me, loading: sessionLoading } = useSession();
  // Only the owner manages staff (MG-17). Nothing is requested until the role is known to be the owner.
  const isOwner = me?.role === 'owner';
  const { data, error, isLoading, mutate } = useAdminStaff(isOwner);
  const { branches, loading: branchesLoading } = useBranches();

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'cashier' | 'manager'>('cashier');
  /** The outlets ticked so far. Null until the owner picks one, so the main outlet is the starting choice once the outlets have loaded. */
  const [picked, setPicked] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<Text | null>(null);
  const [listError, setListError] = useState<Text | null>(null);
  const [secret, setSecret] = useState<Secret | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; kind: 'off' | 'reset' } | null>(null);
  /** The person whose request is running. */
  const [busy, setBusy] = useState<string | null>(null);

  const startId = (branches.find((b) => b.main) ?? branches[0])?.id;
  const chosen = picked ?? (startId ? [startId] : []);
  // A cashier works at exactly one outlet (the select always shows one), a manager at one or more.
  const cashierOutlet = chosen[0] || startId;
  const selected = role === 'cashier' ? (cashierOutlet ? [cashierOutlet] : []) : chosen;

  const pickRole = (next: 'cashier' | 'manager') => {
    setRole(next);
    setPicked(next === 'cashier' ? (cashierOutlet ? [cashierOutlet] : []) : selected);
    setFormError(null);
  };
  const toggleBranch = (id: string) => {
    setPicked(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
    setFormError(null);
  };

  const closeForm = () => {
    setAdding(false);
    setFormError(null);
  };

  const add = async () => {
    if (saving) return;
    const normalized = normalizePhone(phone);
    if (name.trim().length < 2) return setFormError(t('নাম লিখুন (অন্তত ২ অক্ষর)', 'Enter a name (at least 2 characters)'));
    if (!normalized) return setFormError(t('সঠিক মোবাইল নম্বর দিন', 'Enter a valid Bangladeshi mobile number'));
    if (!selected.length) return setFormError(t('অন্তত একটি আউটলেট বেছে নিন', 'Pick at least one outlet'));
    setSaving(true);
    setFormError(null);
    try {
      const res = await api.post<StaffSecretDto>(ADMIN_KEYS.staff, { name: name.trim(), phone: normalized, role, branchIds: selected });
      setSecret({ name: res.staff.name, pin: res.temporaryPin, kind: 'created' });
      void mutate();
      setAdding(false);
      setName('');
      setPhone('');
      setRole('cashier');
      setPicked(null);
    } catch (e) {
      setFormError(isApiError(e) && e.code === 'PHONE_TAKEN' ? t('এই নম্বরে আগে থেকেই একজন স্টাফ আছেন।', 'A staff member with this number already exists.') : errorText(e));
    } finally {
      setSaving(false);
    }
  };

  /** Switch an account on or off. Off signs the person out at once, so the owner is asked first. */
  const setActive = async (s: StaffRowDto, active: boolean) => {
    setBusy(s.id);
    setListError(null);
    setConfirm(null);
    try {
      await mutate(
        async (current) => {
          const updated = await api.patch<StaffRowDto>(ADMIN_KEYS.staffOne(s.id), { active });
          // The answer does not carry today's stamp count, so keep the one already on screen.
          return (current ?? []).map((x) => (x.id === s.id ? { ...updated, stampsToday: x.stampsToday } : x));
        },
        { optimisticData: (current) => (current ?? []).map((x) => (x.id === s.id ? { ...x, active } : x)), rollbackOnError: true, revalidate: true },
      );
    } catch (e) {
      setListError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const resetPin = async (s: StaffRowDto) => {
    setBusy(s.id);
    setListError(null);
    setConfirm(null);
    try {
      const res = await api.post<StaffSecretDto>(ADMIN_KEYS.staffResetPin(s.id));
      setSecret({ name: res.staff.name, pin: res.temporaryPin, kind: 'reset' });
    } catch (e) {
      setListError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  // What each role can do, as the server enforces it (src/lib/domain/permissions.ts).
  const roles = [
    { name: tx('মালিক', 'Owner'), can: tx('সবকিছু: লয়্যালটি প্রোগ্রাম, স্টাফ, আউটলেট, অফার, SMS, গ্রাহক ও এক্সপোর্ট', 'Everything: the loyalty program, staff, outlets, offers, SMS, customers and exports'), bg: 'var(--brand-soft)' },
    { name: tx('ম্যানেজার', 'Manager'), can: tx('কাউন্টারের সব কাজ, সাথে গ্রাহক দেখা, Stamp ঠিক করা, অফার, SMS এবং নিজের আউটলেটের ড্যাশবোর্ড', 'Counter work, plus customers, stamp adjustments, offers, SMS and the dashboard for their own outlets'), bg: 'var(--aqua-soft)' },
    { name: tx('ক্যাশিয়ার', 'Cashier'), can: tx('কাউন্টারের কাজ: QR স্ক্যান, Stamp ও Reward দেওয়া, নতুন গ্রাহক যোগ। দিনের সীমার বেশি দিতে ম্যানেজারের PIN লাগে', 'Counter work: scan QR codes, give stamps and rewards, add new customers. Going over the daily limit needs a manager’s PIN'), bg: 'var(--tangerine-soft)' },
  ];

  const now = Date.now();

  return (
    <>
      <OwnerHeader
        title={tx('স্টাফ', 'Staff')}
        subtitle={tx('কে কোন আউটলেটে Stamp ও Reward দিতে পারবে', 'Who can give stamps and rewards, and where')}
        actions={isOwner ? <Button size="sm" onClick={() => { setAdding(true); setSecret(null); }}><Plus size={18} strokeWidth={2.4} aria-hidden="true" />{tx('স্টাফ যোগ করুন', 'Add staff')}</Button> : undefined}
      />
      {secret && <PinNotice secret={secret} onDone={() => setSecret(null)} />}
      {listError && <p role="alert" className={ALERT_CLASS}>{l(listError)}</p>}
      {adding && isOwner && (
        <Card className="flex flex-col gap-4 border-2 border-brand">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">{tx('নতুন স্টাফ', 'New staff member')}</h2>
            <button type="button" onClick={closeForm} disabled={saving} aria-label={tx('বাতিল', 'Cancel')} className="flex size-11 items-center justify-center rounded-full bg-surface2 disabled:opacity-60"><X size={20} aria-hidden="true" /></button>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); void add(); }} className="flex flex-col gap-4">
            <fieldset disabled={saving} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
              <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
                <Field id="sn" label={tx('নাম', 'Name')}><input id="sn" autoComplete="off" maxLength={80} value={name} onChange={(e) => { setName(e.target.value); setFormError(null); }} placeholder={tx('রাকিব', 'Rakib')} className={inputClass} /></Field>
                <Field id="sp" label={tx('মোবাইল নম্বর', 'Mobile number')}><input id="sp" type="tel" inputMode="numeric" autoComplete="off" value={phone} onChange={(e) => { setPhone(e.target.value); setFormError(null); }} placeholder="01XXX-XXXXXX" className={inputClass} /></Field>
                <Field id="sr" label={tx('ভূমিকা', 'Role')}>
                  <select id="sr" value={role} onChange={(e) => pickRole(e.target.value as 'cashier' | 'manager')} className={inputClass}>
                    <option value="cashier">{tx('ক্যাশিয়ার', 'Cashier')}</option>
                    <option value="manager">{tx('ম্যানেজার', 'Manager')}</option>
                  </select>
                </Field>
                {role === 'cashier' && (
                  <Field id="sb" label={tx('আউটলেট', 'Outlet')} hint={tx('ক্যাশিয়ার একটি আউটলেটেই কাজ করেন', 'A cashier works at one outlet')}>
                    <select id="sb" value={selected[0] ?? ''} onChange={(e) => { setPicked([e.target.value]); setFormError(null); }} className={inputClass}>
                      {branches.length === 0 && <option value="">{branchesLoading ? tx('লোড হচ্ছে…', 'Loading…') : tx('কোনো আউটলেট নেই', 'No outlets')}</option>}
                      {branches.map((b) => <option key={b.id} value={b.id}>{l(b.name)}</option>)}
                    </select>
                  </Field>
                )}
              </div>
              {role === 'manager' && (
                <fieldset className="min-w-0">
                  <legend className="mb-1 text-sm font-bold">{tx('আউটলেট', 'Outlets')}</legend>
                  <p className="mb-2 text-sm text-muted">{tx('ম্যানেজার এক বা একাধিক আউটলেটে কাজ করতে পারেন', 'A manager can work at one or more outlets')}</p>
                  {branches.length === 0 ? (
                    <p className="text-sm text-muted">{branchesLoading ? tx('লোড হচ্ছে…', 'Loading…') : tx('কোনো আউটলেট নেই', 'No outlets')}</p>
                  ) : (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
                      {branches.map((b) => (
                        <label key={b.id} className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border-[1.5px] border-line2 bg-surface px-3 font-semibold has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                          <input type="checkbox" checked={selected.includes(b.id)} onChange={() => toggleBranch(b.id)} className="size-5 shrink-0 accent-brand" />
                          <span className="min-w-0 break-words">{l(b.name)}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </fieldset>
              )}
            </fieldset>
            {formError && <p role="alert" className="text-sm font-semibold text-danger">{l(formError)}</p>}
            <p className="flex items-center gap-2 text-sm text-muted"><Lock size={18} className="shrink-0" aria-hidden="true" />{tx('সিস্টেম একটি ৬ সংখ্যার PIN বানাবে এবং এখনই একবার দেখাবে। সেটি স্টাফকে দিন, তিনি পরে নিজেই বদলে নিতে পারবেন।', 'The system makes a 6-digit PIN and shows it once, right after you add them. Give it to them: they can change it themselves later.')}</p>
            <div className="flex flex-wrap justify-end gap-2.5">
              <Button type="button" variant="secondary" onClick={closeForm} disabled={saving}>{tx('বাতিল', 'Cancel')}</Button>
              <Button type="submit" disabled={saving}>{saving ? tx('যোগ হচ্ছে…', 'Adding…') : tx('যোগ করুন', 'Add staff')}</Button>
            </div>
          </form>
        </Card>
      )}

      {sessionLoading || (isOwner && isLoading) ? (
        <Card role="status" className="p-8 text-center text-muted">{tx('লোড হচ্ছে…', 'Loading…')}</Card>
      ) : !isOwner ? (
        <Card className="flex flex-col items-center gap-2 p-8 text-center">
          <Lock size={24} className="text-muted" aria-hidden="true" />
          <p className="font-bold">{tx('শুধু মালিক স্টাফ পরিচালনা করতে পারেন', 'Only the owner can manage staff')}</p>
        </Card>
      ) : error && !data ? (
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <p role="alert" className="font-bold text-danger">{l(errorText(error))}</p>
          <Button variant="secondary" size="sm" onClick={() => void mutate()}>{tx('আবার চেষ্টা করুন', 'Try again')}</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
          {(data ?? []).map((s) => (
            <article key={s.id} className={cn('flex flex-col gap-3.5 rounded-card border border-line bg-surface p-5', !s.active && 'opacity-60')}>
              <div className="flex items-center gap-3">
                <span className="flex size-[50px] shrink-0 items-center justify-center rounded-[17px] font-display text-xl font-extrabold text-navy" style={{ background: avatarColor(s.id) }}>{l(initialOf(s.name))}</span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-[17px] font-bold">{s.name}</span>
                  <Badge tone={ROLE[s.role].tone} className="mt-0.5">{tx(ROLE[s.role].bn, ROLE[s.role].en)}</Badge>
                </span>
                {s.role !== 'owner' && (
                  <fieldset disabled={busy === s.id} className="m-0 shrink-0 border-0 p-0 [&_button:disabled]:opacity-60">
                    <Switch checked={s.active} onChange={(on) => (on ? void setActive(s, true) : setConfirm({ id: s.id, kind: 'off' }))} label={tx(`${s.name} সক্রিয়`, `${s.name} active`)} />
                  </fieldset>
                )}
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
                <dt className="text-muted">{tx('মোবাইল', 'Mobile')}</dt><dd className="text-right font-semibold">{formatPhone(s.phone)}</dd>
                <dt className="text-muted">{tx('আউটলেট', 'Outlet')}</dt><dd className="break-words text-right font-semibold">{s.branches.length ? s.branches.map((b) => l(b.name)).join(', ') : s.role === 'owner' ? tx('সব আউটলেট', 'All outlets') : '—'}</dd>
                <dt className="text-muted">{tx('আজ দেওয়া Stamp', 'Stamps today')}</dt><dd className="text-right font-semibold">{s.stampsToday === null ? '—' : n(s.stampsToday)}</dd>
                <dt className="text-muted">{tx('শেষ সক্রিয়', 'Last active')}</dt><dd className="text-right font-semibold">{l(lastActive(s.lastSeenAt, now))}</dd>
              </dl>
              {confirm?.id === s.id && (
                <div className="flex flex-col gap-2.5 rounded-2xl bg-danger-soft p-3.5">
                  <p role="alert" className="text-sm font-bold text-danger">
                    {confirm.kind === 'off'
                      ? tx(`${s.name}-কে বন্ধ করবেন? তিনি সঙ্গে সঙ্গে লগআউট হয়ে যাবেন।`, `Switch off ${s.name}? They are signed out at once.`)
                      : tx(`${s.name}-এর PIN রিসেট করবেন? নতুন PIN একবারই দেখানো হবে এবং তিনি সব ডিভাইস থেকে লগআউট হবেন।`, `Reset ${s.name}’s PIN? A new PIN is shown once and they are signed out on every device.`)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="danger" size="sm" disabled={busy === s.id} onClick={() => void (confirm.kind === 'off' ? setActive(s, false) : resetPin(s))}>
                      {confirm.kind === 'off' ? tx('হ্যাঁ, বন্ধ করুন', 'Yes, switch off') : tx('হ্যাঁ, রিসেট করুন', 'Yes, reset PIN')}
                    </Button>
                    <Button variant="ghost" size="sm" disabled={busy === s.id} onClick={() => setConfirm(null)}>{tx('না', 'No')}</Button>
                  </div>
                </div>
              )}
              {s.role !== 'owner' && (
                <Button variant="secondary" size="sm" className="self-start" disabled={busy === s.id} onClick={() => setConfirm({ id: s.id, kind: 'reset' })}>
                  <KeyRound size={16} aria-hidden="true" />{tx('PIN রিসেট', 'Reset PIN')}
                </Button>
              )}
            </article>
          ))}
        </div>
      )}
      <Card>
        <h2 className="text-lg font-bold">{tx('কে কী করতে পারবে', 'What each role can do')}</h2>
        <div className="mt-3.5 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
          {roles.map((r) => (
            <div key={r.name} className="rounded-[18px] p-4" style={{ background: r.bg }}>
              <p className="font-extrabold">{r.name}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{r.can}</p>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
