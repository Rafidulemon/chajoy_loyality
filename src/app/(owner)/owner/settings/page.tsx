'use client';

import { useState } from 'react';
import { useSWRConfig } from 'swr';
import { Clock, Download, Gift, LogOut, Pencil, Plus, QrCode, Send, Shield, Store } from 'lucide-react';
import { BrandIcon } from '@/components/brand';
import { ChangePinButton } from '@/components/change-pin';
import { LoadError, Skeleton } from '@/components/owner-feedback';
import { OwnerHeader } from '@/components/owner-header';
import { SwitchRow } from '@/components/setting-row';
import { Badge, Button, Card, Field, Notice, Segmented, inputClass } from '@/components/ui';
import { ADMIN_BRANCHES_KEY, useAdminBranches, useCan, type AdminBranchView } from '@/lib/api/admin-customers';
import { api } from '@/lib/api/client';
import { signOut } from '@/lib/api/session';
import type { BranchDto } from '@/lib/contracts/dto';
import { fromTime, hour12, toTime } from '@/lib/hours';
import { useI18n, type Text } from '@/lib/i18n';

/** Marks a card whose controls are drawn but not connected to the server yet: nothing typed or switched in it is kept. */
function PreviewBadge({ className }: { className?: string }) {
  const { tx } = useI18n();
  return <Badge tone="warn" wrap className={className}>{tx('শুধু প্রিভিউ, এখনো সেভ হয় না', 'Preview only, not saved yet')}</Badge>;
}

/** A closing time of exactly midnight is stored as 24:00 (1440); the time box and the 12-hour text both want 0. */
const clockMinute = (minute: number) => minute % 1440;

function Outlets() {
  const { tx, l, n } = useI18n();
  const can = useCan();
  const canEdit = can('outlets.manage');
  const { mutate } = useSWRConfig();
  const { branches, error, loading, reload } = useAdminBranches();

  /** Which outlet's opening hours are being edited, and the times typed so far. */
  const [editing, setEditing] = useState('');
  const [times, setTimes] = useState({ open: '11:00', close: '23:00' });
  /** What is wrong with the times typed (checked here), and what the server said when it refused them. */
  const [hoursError, setHoursError] = useState<Text | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [hoursSaved, setHoursSaved] = useState<Text | null>(null);

  const edit = (b: AdminBranchView) => {
    if (editing === b.id) return setEditing('');
    setTimes({ open: toTime(clockMinute(b.hours.open)), close: toTime(clockMinute(b.hours.close)) });
    setHoursError(null);
    setFailure(null);
    setHoursSaved(null);
    setEditing(b.id);
  };

  const saveHours = async (b: AdminBranchView) => {
    if (saving) return;
    const open = fromTime(times.open);
    // The time box gives 00:00 for midnight, and an outlet that closes at midnight closes at the end of the day: 24:00 (1440).
    const close = fromTime(times.close) || 1440;
    if (close <= open) return setHoursError({ bn: 'বন্ধের সময় খোলার সময়ের পরে হতে হবে', en: 'Closing time must be after opening time' });
    setSaving(true);
    setHoursError(null);
    setFailure(null);
    try {
      await api.patch<BranchDto>(`/api/admin/branches/${b.id}`, { openMinute: open, closeMinute: close });
      await mutate(ADMIN_BRANCHES_KEY);
      setEditing('');
      setHoursSaved(b.name);
    } catch (e) {
      setFailure(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{tx('আউটলেট', 'Outlets')}</h2>
        {canEdit && (
          <Button variant="secondary" size="sm" disabled title={tx('পরে যোগ হবে', 'Planned for a later release')}>
            <Plus size={16} strokeWidth={2.4} aria-hidden="true" />{tx('আউটলেট যোগ', 'Add outlet')}
          </Button>
        )}
      </div>
      {canEdit && <p className="mb-2 text-[13px] text-muted">{tx('নতুন আউটলেট যোগ করা পরের ধাপে আসছে। এখন শুধু খোলা-বন্ধের সময় বদলানো যায়।', 'Adding outlets is planned for a later release. For now you can change opening hours.')}</p>}
      {!canEdit && <p className="mb-2 text-[13px] text-muted">{tx('খোলা-বন্ধের সময় শুধু মালিক বদলাতে পারেন।', 'Only the owner can change opening hours.')}</p>}
      {hoursSaved && <Notice>{tx(`${hoursSaved.bn}-এর সময় আপডেট হয়েছে। গ্রাহকরা এক মিনিটের মধ্যে আউটলেট পেজে নতুন সময় দেখবেন।`, `${hoursSaved.en} hours updated. Customers see the new hours on the Outlets page within a minute.`)}</Notice>}
      {error && !branches.length ? (
        <LoadError error={error} onRetry={reload} className="mt-2" />
      ) : loading ? (
        <ul aria-busy="true" role="status">
          <li className="sr-only">{tx('লোড হচ্ছে…', 'Loading…')}</li>
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="flex min-h-16 items-center gap-3 border-t border-line py-3">
              <Skeleton className="size-[38px] shrink-0 rounded-[13px]" />
              <div className="flex flex-1 flex-col gap-1.5"><Skeleton className="h-4 w-40 max-w-full" /><Skeleton className="h-3 w-56 max-w-full" /></div>
            </li>
          ))}
        </ul>
      ) : (
        <ul>
          {branches.map((b) => (
            <li key={b.id} className="border-t border-line">
              <div className="flex min-h-16 items-center gap-3">
                <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[13px] text-navy" style={{ background: b.chip }}><Store size={18} aria-hidden="true" /></span>
                <span className="min-w-0 flex-1 py-2">
                  <span className="block font-bold">{l(b.name)}</span>
                  <span className="block text-[13px] text-muted">{l(b.address)}</span>
                  <span className="flex items-center gap-1 text-[13px] text-muted"><Clock size={13} aria-hidden="true" />{n(hour12(clockMinute(b.hours.open)))} – {n(hour12(clockMinute(b.hours.close)))}</span>
                  <span className="block text-[13px] text-muted">
                    {b.staff
                      ? tx(`${n(b.staff)} জন স্টাফ · ${n(b.customers)} জন গ্রাহক যোগ দিয়েছেন`, `${n(b.staff)} staff · ${n(b.customers)} customers joined here`)
                      : tx(`স্টাফ নেই · ${n(b.customers)} জন গ্রাহক যোগ দিয়েছেন`, `No staff · ${n(b.customers)} customers joined here`)}
                  </span>
                </span>
                {b.main && <Badge>{tx('প্রধান', 'Main')}</Badge>}
                {!b.active && <Badge tone="danger">{tx('স্থায়ীভাবে বন্ধ', 'Closed for good')}</Badge>}
                {canEdit && b.active && (
                  <button type="button" onClick={() => edit(b)} aria-expanded={editing === b.id} aria-label={tx(`${b.name.bn}-এর সময় এডিট করুন`, `Edit ${b.name.en} hours`)} className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface2"><Pencil size={18} aria-hidden="true" /></button>
                )}
              </div>
              {canEdit && editing === b.id && (
                <form onSubmit={(e) => { e.preventDefault(); void saveHours(b); }} className="mb-3 flex flex-wrap items-end gap-3 rounded-2xl bg-surface2 p-3.5">
                  <Field id={`open-${b.id}`} label={tx('খোলে', 'Opens')}><input id={`open-${b.id}`} type="time" required value={times.open} onChange={(e) => { setTimes({ ...times, open: e.target.value }); setHoursError(null); setFailure(null); }} className={`${inputClass} w-[140px]`} /></Field>
                  <Field id={`close-${b.id}`} label={tx('বন্ধ হয়', 'Closes')}><input id={`close-${b.id}`} type="time" required value={times.close} onChange={(e) => { setTimes({ ...times, close: e.target.value }); setHoursError(null); setFailure(null); }} className={`${inputClass} w-[140px]`} /></Field>
                  <Button type="submit" size="sm" disabled={saving}>{saving ? tx('সেভ হচ্ছে…', 'Saving…') : tx('সেভ করুন', 'Save hours')}</Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => setEditing('')} disabled={saving}>{tx('বাতিল', 'Cancel')}</Button>
                  {hoursError && <p role="alert" className="basis-full text-[13px] font-semibold text-danger">{l(hoursError)}</p>}
                  {failure != null && <LoadError error={failure} className="basis-full" />}
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function SettingsPage() {
  const { tx, l } = useI18n();
  const { branches } = useAdminBranches();
  const main = branches.find((b) => b.main);

  // The brand profile, the customer-experience switches and the QR standee are drawn but not connected to the server yet, so they
  // only hold what is typed or switched here until the page is left.
  const [address, setAddress] = useState<string | null>(null);
  const [smsStamp, setSmsStamp] = useState(false);
  const [smsReady, setSmsReady] = useState(true);
  const [selfJoin, setSelfJoin] = useState(true);
  const [smsLang, setSmsLang] = useState<'bn' | 'en'>('bn');

  const [confirmOut, setConfirmOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const logOutEverywhere = () => {
    if (signingOut) return;
    setSigningOut(true);
    // The browser goes to the sign-in screen when this is done, whether or not the request worked.
    void signOut('staff', true).catch(() => undefined);
  };

  return (
    <>
      <OwnerHeader title={tx('সেটিংস', 'Settings')} subtitle={tx('ব্র্যান্ড প্রোফাইল, আউটলেট ও পছন্দ', 'Brand profile, outlets and preferences')} />
      <div className="flex flex-wrap items-start gap-[18px]">
        <div className="flex min-w-0 flex-[3_1_420px] flex-col gap-[18px]">
          <Card className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold">{tx('ব্র্যান্ড প্রোফাইল', 'Brand profile')}</h2><PreviewBadge /></div>
            <div className="flex flex-wrap items-center gap-4">
              <BrandIcon size={120} className="rounded-full" />
              <p className="flex-[1_1_200px] text-sm leading-relaxed text-muted">{tx('গ্রাহকের কার্ড, QR স্ট্যান্ডি ও SMS-এ এই লোগো দেখাবে।', 'This logo shows on customer cards, the QR standee and SMS.')}</p>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
              <Field id="nbn" label={tx('নাম (বাংলা)', 'Name (Bangla)')}><input id="nbn" defaultValue="চা জয়" className={inputClass} /></Field>
              <Field id="nen" label={tx('নাম (ইংরেজি)', 'Name (English)')}><input id="nen" defaultValue="ChaJoy" className={inputClass} /></Field>
              <Field id="ph" label={tx('যোগাযোগ নম্বর', 'Contact number')}><input id="ph" type="tel" placeholder="01XXX-XXXXXX" className={inputClass} /></Field>
            </div>
            <Field id="addr" label={tx('প্রধান অফিসের ঠিকানা', 'Head office address')}>
              <textarea id="addr" rows={2} value={address ?? (main ? l(main.address) : '')} onChange={(e) => setAddress(e.target.value)} className={`${inputClass} h-auto resize-y py-3`} />
            </Field>
          </Card>
          <Outlets />
        </div>

        <div className="flex min-w-0 flex-[2_1_320px] flex-col gap-[18px]">
          <Card className="px-5 py-2">
            <div className="my-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold">{tx('গ্রাহকের অভিজ্ঞতা', 'Customer experience')}</h2><PreviewBadge /></div>
            <SwitchRow icon={<Send size={18} aria-hidden="true" />} color="#F5D900" label={tx('Stamp পেলে SMS', 'SMS on every stamp')} sub={tx('প্রতিটি Stamp-এ ১টি SMS খরচ হবে', 'Uses 1 SMS per stamp')} checked={smsStamp} onChange={setSmsStamp} />
            <SwitchRow icon={<Gift size={18} aria-hidden="true" />} color="#FF8A9A" label={tx('Reward রেডি হলে SMS', 'SMS when reward is ready')} sub={tx('গ্রাহককে দোকানে ফিরিয়ে আনে', 'Brings customers back to claim it')} checked={smsReady} onChange={setSmsReady} />
            <SwitchRow icon={<QrCode size={18} aria-hidden="true" />} color="#8FE3D8" label={tx('QR স্ক্যান করে নিজে যোগ দেওয়া', 'Customers join by scanning')} sub={tx('কাউন্টারের QR থেকে সরাসরি কার্ড', 'Get a card straight from the counter QR')} checked={selfJoin} onChange={setSelfJoin} />
            <div className="flex min-h-16 flex-wrap items-center gap-3 border-t border-line py-2">
              <span className="flex-[1_1_140px] font-semibold">{tx('গ্রাহকের SMS-এর ভাষা', 'Customer SMS language')}</span>
              <Segmented label={tx('গ্রাহকের SMS-এর ভাষা', 'Customer SMS language')} value={smsLang} onChange={setSmsLang} options={[{ value: 'bn', label: 'বাংলা' }, { value: 'en', label: 'English' }]} />
            </div>
          </Card>
          <section aria-label={tx('কাউন্টার QR স্ট্যান্ডি', 'Counter QR standee')} className="flex flex-wrap items-center gap-4 rounded-card bg-tangerine p-5 text-navy">
            <div aria-hidden="true" className="flex h-[136px] w-24 shrink-0 flex-col items-center justify-center gap-2 rounded-xl bg-[#97C334] text-navy shadow-[0_8px_18px_rgba(23,23,23,0.25)]">
              <span className="flex size-[60px] items-center justify-center rounded-[10px] bg-white text-navy"><QrCode size={40} aria-hidden="true" /></span>
              <span className="text-[10px] font-extrabold">{tx('স্ক্যান করুন', 'SCAN ME')}</span>
            </div>
            <div className="flex flex-[1_1_160px] flex-col items-start gap-2">
              <h2 className="text-lg font-bold">{tx('কাউন্টার QR স্ট্যান্ডি', 'Counter QR standee')}</h2>
              <PreviewBadge />
              <p className="text-sm">{tx('প্রিন্ট করে প্রতিটি আউটলেটের কাউন্টারে রাখুন', 'Print one for each outlet counter')}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled className="inline-flex min-h-11 cursor-not-allowed items-center gap-1.5 rounded-xl bg-navy px-3.5 font-bold text-white opacity-50"><Download size={16} aria-hidden="true" />A5 PDF</button>
                <button type="button" disabled className="min-h-11 cursor-not-allowed rounded-xl border-2 border-navy px-3.5 font-bold opacity-50">A4 PDF</button>
              </div>
            </div>
          </section>
          <Card className="px-5 py-2">
            <h2 className="my-3 text-lg font-bold">{tx('নিরাপত্তা', 'Security')}</h2>
            <div className="flex min-h-16 items-center gap-3 border-t border-line py-2">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl text-navy" style={{ background: '#7FD8CE' }}><Shield size={18} aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{tx('দুই ধাপে লগইন', 'Two-step login')}</span>
                <span className="block text-[13px] text-muted">{tx('ম্যানেজার ও মালিককে PIN-এর পর SMS কোডও দিতে হয়। এটি বন্ধ করা যায় না।', 'Managers and owners enter a code after the PIN. It cannot be switched off.')}</span>
              </span>
              <Badge tone="ok">{tx('সবসময় চালু', 'Always on')}</Badge>
            </div>
            <div className="flex min-h-16 items-center gap-3 border-t border-line py-2">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{tx('আপনার PIN', 'Your PIN')}</span>
                <span className="block text-[13px] text-muted">{tx('বদলালে অন্য সব ডিভাইস থেকে লগআউট হবে।', 'Changing it signs you out on your other devices.')}</span>
              </span>
              <ChangePinButton />
            </div>
            {confirmOut ? (
              <div className="flex flex-col gap-3 border-t border-line py-3">
                <p className="text-sm font-semibold">{tx('আপনার অ্যাকাউন্ট সব ডিভাইস থেকে লগআউট হবে, এই ডিভাইসসহ। আবার লগইন করতে হবে।', 'Your account will be signed out on every device, including this one. You will need to sign in again.')}</p>
                <div className="flex flex-wrap gap-2.5">
                  <Button variant="danger" size="sm" onClick={logOutEverywhere} disabled={signingOut}>{signingOut ? tx('লগআউট হচ্ছে…', 'Signing out…') : tx('হ্যাঁ, সব জায়গা থেকে লগআউট', 'Yes, log out everywhere')}</Button>
                  <Button variant="secondary" size="sm" onClick={() => setConfirmOut(false)} disabled={signingOut}>{tx('বাতিল', 'Cancel')}</Button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmOut(true)} className="flex min-h-[60px] w-full items-center gap-3 border-t border-line text-left font-semibold">
                <span className="flex size-9 items-center justify-center rounded-xl bg-line2 text-navy"><LogOut size={18} aria-hidden="true" /></span>
                {tx('সব ডিভাইস থেকে লগআউট', 'Log out of all devices')}
              </button>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
