'use client';

import { useState } from 'react';
import { Check, Clock, Download, Gift, LogOut, Pencil, Plus, QrCode, Send, Shield, Store } from 'lucide-react';
import { BrandIcon } from '@/components/brand';
import { OwnerHeader } from '@/components/owner-header';
import { SwitchRow } from '@/components/setting-row';
import { Badge, Button, Card, Field, Notice, Segmented, inputClass } from '@/components/ui';
import { branches } from '@/lib/data';
import { fromTime, hour12, toTime } from '@/lib/hours';
import { useI18n } from '@/lib/i18n';
import { useStore } from '@/lib/store';

export default function SettingsPage() {
  const { tx, l, n } = useI18n();
  const [saved, setSaved] = useState(false);
  const [smsStamp, setSmsStamp] = useState(false);
  const [smsReady, setSmsReady] = useState(true);
  const [selfJoin, setSelfJoin] = useState(true);
  const [twoStep, setTwoStep] = useState(true);
  const [smsLang, setSmsLang] = useState<'bn' | 'en'>('bn');
  const store = useStore();
  /** Which outlet's opening hours are being edited, and the times typed so far. */
  const [editing, setEditing] = useState('');
  const [times, setTimes] = useState({ open: '11:00', close: '23:00' });
  const [hoursError, setHoursError] = useState('');
  const [hoursSaved, setHoursSaved] = useState('');

  const edit = (id: string) => {
    if (editing === id) return setEditing('');
    const h = store.hours[id];
    setTimes({ open: toTime(h.open), close: toTime(h.close) });
    setHoursError('');
    setHoursSaved('');
    setEditing(id);
  };
  const saveHours = (id: string, name: string) => {
    const open = fromTime(times.open);
    const close = fromTime(times.close);
    if (close <= open) return setHoursError(tx('বন্ধের সময় খোলার সময়ের পরে হতে হবে', 'Closing time must be after opening time'));
    store.setHours(id, { open, close });
    setEditing('');
    setHoursSaved(name);
  };

  return (
    <>
      <OwnerHeader
        title={tx('সেটিংস', 'Settings')}
        subtitle={tx('ব্র্যান্ড প্রোফাইল, আউটলেট ও পছন্দ', 'Brand profile, outlets and preferences')}
        actions={<Button size="sm" onClick={() => setSaved(true)}><Check size={18} strokeWidth={2.4} aria-hidden="true" />{tx('সেভ করুন', 'Save')}</Button>}
      />
      {saved && <Notice>{tx('সেটিংস সেভ হয়েছে।', 'Settings saved.')}</Notice>}
      <div className="flex flex-wrap items-start gap-[18px]">
        <div className="flex min-w-0 flex-[3_1_420px] flex-col gap-[18px]">
          <Card className="flex flex-col gap-4">
            <h2 className="text-lg font-bold">{tx('ব্র্যান্ড প্রোফাইল', 'Brand profile')}</h2>
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
              <textarea id="addr" rows={2} defaultValue={tx('মিরপুর ১০, ঢাকা', 'Mirpur 10, Dhaka')} className={`${inputClass} h-auto resize-y py-3`} />
            </Field>
          </Card>
          <Card>
            <div className="mb-2 flex items-center justify-between gap-2"><h2 className="text-lg font-bold">{tx('আউটলেট', 'Outlets')}</h2><Button variant="secondary" size="sm"><Plus size={16} strokeWidth={2.4} aria-hidden="true" />{tx('আউটলেট যোগ', 'Add outlet')}</Button></div>
            {hoursSaved && <Notice>{tx(`${hoursSaved}-এর সময় আপডেট হয়েছে। গ্রাহকরা আউটলেট পেজে এখনই দেখবেন।`, `${hoursSaved} hours updated. Customers see them on the Outlets page right away.`)}</Notice>}
            <ul>
              {branches.map((b) => {
                const h = store.hours[b.id];
                return (
                  <li key={b.id} className="border-t border-line">
                    <div className="flex min-h-16 items-center gap-3">
                      <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[13px] text-navy" style={{ background: b.chip }}><Store size={18} aria-hidden="true" /></span>
                      <span className="min-w-0 flex-1 py-2">
                        <span className="block font-bold">{l(b.name)}</span>
                        <span className="block text-[13px] text-muted">{l(b.address)}</span>
                        <span className="flex items-center gap-1 text-[13px] text-muted"><Clock size={13} aria-hidden="true" />{n(hour12(h.open))} – {n(hour12(h.close))}</span>
                        <span className="block text-[13px] text-muted">{b.staff ? tx(`${n(b.staff)} জন স্টাফ · ${n(b.customers)} গ্রাহক`, `${b.staff} staff · ${b.customers} customers`) : tx(`স্টাফ নেই · ${n(b.customers)} গ্রাহক`, `No staff · ${b.customers} customers`)}</span>
                      </span>
                      {b.main && <Badge>{tx('প্রধান', 'Main')}</Badge>}
                      <button type="button" onClick={() => edit(b.id)} aria-expanded={editing === b.id} aria-label={tx(`${b.name.bn}-এর সময় এডিট করুন`, `Edit ${b.name.en} hours`)} className="flex size-10 items-center justify-center rounded-xl text-muted hover:bg-surface2"><Pencil size={18} aria-hidden="true" /></button>
                    </div>
                    {editing === b.id && (
                      <form onSubmit={(e) => { e.preventDefault(); saveHours(b.id, b.name.en); }} className="mb-3 flex flex-wrap items-end gap-3 rounded-2xl bg-surface2 p-3.5">
                        <Field id={`open-${b.id}`} label={tx('খোলে', 'Opens')}><input id={`open-${b.id}`} type="time" value={times.open} onChange={(e) => { setTimes({ ...times, open: e.target.value }); setHoursError(''); }} className={`${inputClass} w-[140px]`} /></Field>
                        <Field id={`close-${b.id}`} label={tx('বন্ধ হয়', 'Closes')}><input id={`close-${b.id}`} type="time" value={times.close} onChange={(e) => { setTimes({ ...times, close: e.target.value }); setHoursError(''); }} className={`${inputClass} w-[140px]`} /></Field>
                        <Button type="submit" size="sm">{tx('সেভ করুন', 'Save hours')}</Button>
                        <Button type="button" variant="secondary" size="sm" onClick={() => setEditing('')}>{tx('বাতিল', 'Cancel')}</Button>
                        {hoursError && <p role="alert" className="basis-full text-[13px] font-semibold text-danger">{hoursError}</p>}
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>

        <div className="flex min-w-0 flex-[2_1_320px] flex-col gap-[18px]">
          <Card className="px-5 py-2">
            <h2 className="my-3 text-lg font-bold">{tx('গ্রাহকের অভিজ্ঞতা', 'Customer experience')}</h2>
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
            <div className="flex flex-[1_1_160px] flex-col gap-2">
              <h2 className="text-lg font-bold">{tx('কাউন্টার QR স্ট্যান্ডি', 'Counter QR standee')}</h2>
              <p className="text-sm">{tx('প্রিন্ট করে প্রতিটি আউটলেটের কাউন্টারে রাখুন', 'Print one for each outlet counter')}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-navy px-3.5 font-bold text-white"><Download size={16} aria-hidden="true" />A5 PDF</button>
                <button type="button" className="min-h-11 rounded-xl border-2 border-navy px-3.5 font-bold">A4 PDF</button>
              </div>
            </div>
          </section>
          <Card className="px-5 py-2">
            <h2 className="my-3 text-lg font-bold">{tx('নিরাপত্তা', 'Security')}</h2>
            <SwitchRow icon={<Shield size={18} aria-hidden="true" />} color="#7FD8CE" label={tx('দুই ধাপে লগইন', 'Two-step login')} sub={tx('লগইনের সময় OTP লাগবে', 'Ask for a code when logging in')} checked={twoStep} onChange={setTwoStep} />
            <button type="button" className="flex min-h-[60px] w-full items-center gap-3 border-t border-line text-left font-semibold">
              <span className="flex size-9 items-center justify-center rounded-xl bg-line2 text-navy"><LogOut size={18} aria-hidden="true" /></span>
              {tx('সব ডিভাইস থেকে লগআউট', 'Log out of all devices')}
            </button>
          </Card>
        </div>
      </div>
    </>
  );
}
