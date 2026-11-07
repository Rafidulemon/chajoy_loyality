'use client';

import { useState } from 'react';
import { Lock, Plus, X } from 'lucide-react';
import { OwnerHeader } from '@/components/owner-header';
import { Badge, Button, Card, Field, Notice, Switch, inputClass, type Tone } from '@/components/ui';
import { branches, staffMembers, type Role, type Staff } from '@/lib/data';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/cn';

const ROLE: Record<Role, { bn: string; en: string; tone: Tone }> = {
  owner: { bn: 'মালিক', en: 'Owner', tone: 'brand' },
  manager: { bn: 'ম্যানেজার', en: 'Manager', tone: 'ok' },
  cashier: { bn: 'ক্যাশিয়ার', en: 'Cashier', tone: 'warn' },
};

export default function StaffPage() {
  const { tx, l, n } = useI18n();
  const [staff, setStaff] = useState<Staff[]>(staffMembers);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<Role>('cashier');
  const [branch, setBranch] = useState(Math.max(0, branches.findIndex((b) => b.main)));
  const [error, setError] = useState('');
  const [toast, setToast] = useState(false);

  const save = () => {
    if (!name.trim()) return setError(tx('নাম লিখুন', 'Enter a name'));
    if (phone.replace(/\D/g, '').length < 10) return setError(tx('সঠিক মোবাইল নম্বর দিন', 'Enter a valid mobile number'));
    setStaff([...staff, { id: String(Date.now()), initial: { bn: name.trim()[0], en: name.trim()[0].toUpperCase() }, name: { bn: name.trim(), en: name.trim() }, role, branch: branches[branch].name, today: 0, seen: { bn: 'এখনো লগইন করেননি', en: 'Not logged in yet' }, active: true, avatar: '#B8D4CF' }]);
    setAdding(false);
    setToast(true);
    setName(''); setPhone(''); setError('');
  };

  const roles = [
    { name: tx('মালিক', 'Owner'), can: tx('সবকিছু: স্টাফ, প্রোগ্রাম, SMS ও রিপোর্ট', 'Everything: staff, program, SMS and reports'), bg: 'var(--brand-soft)' },
    { name: tx('ম্যানেজার', 'Manager'), can: tx('গ্রাহক দেখা, Stamp ঠিক করা, SMS পাঠানো ও রিপোর্ট', 'View customers, adjust stamps, send SMS, see reports'), bg: 'var(--aqua-soft)' },
    { name: tx('ক্যাশিয়ার', 'Cashier'), can: tx('শুধু QR স্ক্যান করে Stamp ও Reward দেওয়া', 'Only scan QR codes to give stamps and rewards'), bg: 'var(--tangerine-soft)' },
  ];

  return (
    <>
      <OwnerHeader
        title={tx('স্টাফ', 'Staff')}
        subtitle={tx('কে কোন আউটলেটে Stamp ও Reward দিতে পারবে', 'Who can give stamps and rewards, and where')}
        actions={<Button size="sm" onClick={() => { setAdding(true); setToast(false); }}><Plus size={18} strokeWidth={2.4} aria-hidden="true" />{tx('স্টাফ যোগ করুন', 'Add staff')}</Button>}
      />
      {toast && <Notice>{tx('স্টাফ যোগ হয়েছে। লগইন লিংক SMS-এ পাঠানো হয়েছে।', 'Staff added. Login link sent by SMS.')}</Notice>}
      {adding && (
        <Card className="flex flex-col gap-4 border-2 border-brand">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">{tx('নতুন স্টাফ', 'New staff member')}</h2>
            <button type="button" onClick={() => setAdding(false)} aria-label={tx('বাতিল', 'Cancel')} className="flex size-11 items-center justify-center rounded-full bg-surface2"><X size={20} aria-hidden="true" /></button>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
            <Field id="sn" label={tx('নাম', 'Name')}><input id="sn" value={name} onChange={(e) => { setName(e.target.value); setError(''); }} placeholder={tx('রাকিব', 'Rakib')} className={inputClass} /></Field>
            <Field id="sp" label={tx('মোবাইল নম্বর', 'Mobile number')}><input id="sp" type="tel" inputMode="numeric" value={phone} onChange={(e) => { setPhone(e.target.value); setError(''); }} placeholder="01XXX-XXXXXX" className={inputClass} /></Field>
            <Field id="sr" label={tx('ভূমিকা', 'Role')}>
              <select id="sr" value={role} onChange={(e) => setRole(e.target.value as Role)} className={inputClass}>
                <option value="cashier">{tx('ক্যাশিয়ার', 'Cashier')}</option>
                <option value="manager">{tx('ম্যানেজার', 'Manager')}</option>
              </select>
            </Field>
            <Field id="sb" label={tx('আউটলেট', 'Outlet')}>
              <select id="sb" value={branch} onChange={(e) => setBranch(Number(e.target.value))} className={inputClass}>
                {branches.map((b, i) => <option key={b.name.en} value={i}>{l(b.name)}</option>)}
              </select>
            </Field>
          </div>
          {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
          <p className="flex items-center gap-2 text-sm text-muted"><Lock size={18} aria-hidden="true" />{tx('স্টাফ SMS-এ একটি লগইন লিংক পাবেন এবং নিজের ৪ সংখ্যার PIN সেট করবেন।', 'They’ll get a login link by SMS and set their own 4-digit PIN.')}</p>
          <div className="flex flex-wrap justify-end gap-2.5"><Button variant="secondary" onClick={() => setAdding(false)}>{tx('বাতিল', 'Cancel')}</Button><Button onClick={save}>{tx('যোগ করুন', 'Add staff')}</Button></div>
        </Card>
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
        {staff.map((s) => (
          <article key={s.id} className={cn('flex flex-col gap-3.5 rounded-card border border-line bg-surface p-5', !s.active && 'opacity-60')}>
            <div className="flex items-center gap-3">
              <span className="flex size-[50px] shrink-0 items-center justify-center rounded-[17px] font-display text-xl font-extrabold text-navy" style={{ background: s.avatar }}>{l(s.initial)}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[17px] font-bold">{l(s.name)}</span>
                <Badge tone={ROLE[s.role].tone} className="mt-0.5">{tx(ROLE[s.role].bn, ROLE[s.role].en)}</Badge>
              </span>
              {s.role !== 'owner' && <Switch checked={s.active} onChange={(v) => setStaff(staff.map((x) => (x.id === s.id ? { ...x, active: v } : x)))} label={tx(`${s.name.bn} সক্রিয়`, `${s.name.en} active`)} />}
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-muted">{tx('আউটলেট', 'Outlet')}</dt><dd className="text-right font-semibold">{l(s.branch)}</dd>
              <dt className="text-muted">{tx('আজ দেওয়া Stamp', 'Stamps today')}</dt><dd className="text-right font-semibold">{s.today === null ? '—' : n(s.today)}</dd>
              <dt className="text-muted">{tx('শেষ সক্রিয়', 'Last active')}</dt><dd className="text-right font-semibold">{l(s.seen)}</dd>
            </dl>
          </article>
        ))}
      </div>
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
