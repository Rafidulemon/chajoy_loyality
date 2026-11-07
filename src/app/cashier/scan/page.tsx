'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Gift, Plus, Search, Ticket, UserPlus } from 'lucide-react';
import { Badge, Button, Card, Field, Notice, inputClass } from '@/components/ui';
import { onDutyCashier } from '@/lib/data';
import { useI18n } from '@/lib/i18n';
import { useStore, useToday } from '@/lib/store';
import { cn } from '@/lib/cn';

export default function ScanPage() {
  const { tx, l, n } = useI18n();
  const router = useRouter();
  const store = useStore();
  const today = useToday();
  const by = onDutyCashier.name;

  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [unknown, setUnknown] = useState(false);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');

  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [found, setFound] = useState<{ customerId: string; voucherId: string } | null>(null);
  const [choice, setChoice] = useState(0);
  const [given, setGiven] = useState('');

  const digits = phone.replace(/\D/g, '');

  const search = () => {
    setUnknown(false);
    if (digits.length < 4) return setError(tx('অন্তত শেষ ৪ সংখ্যা লিখুন', 'Enter at least the last 4 digits'));
    // A full number must match exactly; a few digits match the end of the (masked) sample numbers.
    const match =
      digits.length >= 10
        ? store.added.find((c) => c.phone.replace(/\D/g, '').endsWith(digits.slice(-10)))
        : store.customers.find((c) => c.phone.replace(/\D/g, '').endsWith(digits.slice(-3)));
    if (!match) {
      setError(tx('এই নম্বরে কোনো গ্রাহক নেই', 'No customer with that number'));
      setUnknown(true);
      return;
    }
    router.push(`/cashier/customers/${match.id}`);
  };

  const addCustomer = () => {
    if (name.trim().length < 2) return setNameError(tx('গ্রাহকের নাম লিখুন', 'Enter the customer’s name'));
    const ten = digits.slice(-10);
    const customer = store.addCustomer(name, `+880 ${ten.slice(0, 4)}-${ten.slice(4)}`, by);
    router.push(`/cashier/customers/${customer.id}`);
  };

  const checkCode = () => {
    setGiven('');
    const hit = store.findVoucher(code);
    if (!hit) {
      setFound(null);
      return setCodeError(tx('এই কোডের কোনো ভাউচার নেই', 'No voucher with that code'));
    }
    setChoice(0);
    setFound({ customerId: hit.customerId, voucherId: hit.voucher.id });
  };

  // Read the voucher from the store each render so its status stays current if another screen changes it.
  const voucher = found ? store.cards[found.customerId]?.vouchers.find((v) => v.id === found.voucherId) : undefined;
  const holder = found ? store.customer(found.customerId) : undefined;

  const give = () => {
    if (!found || !voucher) return;
    const item = voucher.choices?.[choice];
    store.redeem(found.customerId, voucher.id, by, item);
    setGiven(tx(`Reward দেওয়া হয়েছে: ${voucher.title.bn}${item ? ` · ${item.bn}` : ''}।`, `Reward given: ${voucher.title.en.toLowerCase()}${item ? ` · ${item.en.toLowerCase()}` : ''}.`));
    setFound(null);
    setCode('');
  };

  const stats = [
    { label: tx('আজকের Stamp', 'Stamps today'), value: today.stamps, bg: 'var(--tangerine-soft)', chip: '#F5D900', Icon: Check },
    { label: tx('আজকের Reward', 'Rewards today'), value: today.rewards, bg: 'var(--rose-soft)', chip: '#FF5D73', Icon: Gift },
    { label: tx('নতুন গ্রাহক', 'New customers'), value: today.newCustomers, bg: 'var(--aqua-soft)', chip: '#2EC4B6', Icon: Plus },
  ];

  return (
    <div className="flex flex-wrap items-start gap-5">
      {/* Replace this tile with a real camera scanner (e.g. the html5-qrcode library) when wiring up the backend. */}
      <Link
        href="/cashier/customers/tanvir"
        aria-label={tx('QR স্ক্যান করুন (ডেমো)', 'Scan QR (demo)')}
        className="relative block h-[clamp(340px,50vw,480px)] min-w-0 flex-[3_1_340px] overflow-hidden rounded-hero bg-[#0E1E24]"
      >
        <span aria-hidden="true" className="absolute -left-16 -top-16 size-[200px] rounded-full bg-[#97C334]/60" />
        <span aria-hidden="true" className="absolute -bottom-12 -right-12 size-[180px] rounded-full bg-rose/35" />
        <span aria-hidden="true" className="absolute left-1/2 top-[46%] size-[220px] -translate-x-1/2 -translate-y-1/2">
          <span className="absolute left-0 top-0 size-11 rounded-tl-2xl border-l-[6px] border-t-[6px] border-tangerine" />
          <span className="absolute right-0 top-0 size-11 rounded-tr-2xl border-r-[6px] border-t-[6px] border-tangerine" />
          <span className="absolute bottom-0 left-0 size-11 rounded-bl-2xl border-b-[6px] border-l-[6px] border-tangerine" />
          <span className="absolute bottom-0 right-0 size-11 rounded-br-2xl border-b-[6px] border-r-[6px] border-tangerine" />
          <span className="absolute inset-x-[18px] top-[108px] h-1 rounded-full bg-aqua shadow-[0_0_18px_#2EC4B6]" />
        </span>
        <span className="absolute inset-x-4 bottom-[18px] text-center text-[15px] font-semibold text-white">{tx('গ্রাহকের QR কোড ফ্রেমের ভিতরে রাখুন', 'Place the customer’s QR inside the frame')}</span>
      </Link>

      <div className="flex min-w-0 flex-[2_1_280px] flex-col gap-[18px]">
        <form onSubmit={(e) => { e.preventDefault(); search(); }}>
          <Field id="cust-phone" label={tx('অথবা মোবাইল নম্বর দিয়ে খুঁজুন', 'Or search by mobile number')} error={error}>
            <div className="flex gap-2.5">
              <input id="cust-phone" type="tel" inputMode="numeric" placeholder="01XXX-XXXXXX" value={phone} onChange={(e) => { setPhone(e.target.value); setError(''); setUnknown(false); }} className={`${inputClass} h-[54px] rounded-2xl`} />
              <button type="submit" aria-label={tx('খুঁজুন', 'Search')} className="flex size-[54px] shrink-0 items-center justify-center rounded-2xl bg-brand text-brand-on">
                <Search size={22} strokeWidth={2.4} aria-hidden="true" />
              </button>
            </div>
          </Field>
        </form>

        {unknown && (
          <Card className="flex flex-col gap-3 border-2 border-brand p-4">
            <p className="flex items-center gap-2 font-bold"><UserPlus size={20} aria-hidden="true" />{tx('নতুন গ্রাহক?', 'New customer?')}</p>
            {digits.length < 10 ? (
              <p className="text-sm text-muted">{tx('নতুন গ্রাহক যোগ করতে পুরো মোবাইল নম্বরটি লিখুন।', 'Type the full mobile number to add them as a new customer.')}</p>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); addCustomer(); }} className="flex flex-col gap-3">
                <Field id="new-name" label={tx('গ্রাহকের নাম', 'Customer name')} error={nameError}>
                  <input id="new-name" autoComplete="off" value={name} onChange={(e) => { setName(e.target.value); setNameError(''); }} placeholder={tx('যেমন: তানভীর আহমেদ', 'e.g. Tanvir Ahmed')} className={inputClass} />
                </Field>
                <Button type="submit">{store.program.welcome ? tx('গ্রাহক যোগ করুন · ১টি স্বাগতম Stamp', 'Add customer · 1 welcome stamp') : tx('গ্রাহক যোগ করুন', 'Add customer')}</Button>
              </form>
            )}
          </Card>
        )}

        <form onSubmit={(e) => { e.preventDefault(); checkCode(); }}>
          <Field id="voucher-code" label={tx('Reward ভাউচার দিন', 'Redeem a reward voucher')} hint={tx('গ্রাহকের ভাউচারের QR-এর নিচের কোডটি লিখুন', 'Type the code under the customer’s voucher QR')} error={codeError}>
            <div className="flex gap-2.5">
              <input id="voucher-code" autoCapitalize="characters" autoComplete="off" placeholder="CJ-XXXX-00" value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); setCodeError(''); setFound(null); setGiven(''); }} className={`${inputClass} h-[54px] rounded-2xl font-mono tracking-wider`} />
              <button type="submit" aria-label={tx('ভাউচার দেখুন', 'Check voucher')} className="flex size-[54px] shrink-0 items-center justify-center rounded-2xl bg-[#171717] text-white">
                <Ticket size={22} strokeWidth={2.2} aria-hidden="true" />
              </button>
            </div>
          </Field>
        </form>

        {found && voucher && holder && (
          <Card className="flex flex-col gap-3 p-4">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-brand text-brand-on"><Gift size={22} aria-hidden="true" /></span>
              <div className="min-w-0 flex-1">
                <p className="font-bold">{l(voucher.title)}</p>
                <p className="text-sm text-muted">{l(holder.name)} · <span className="font-mono">{voucher.code}</span></p>
              </div>
              <Badge tone={voucher.status === 'ready' ? 'ok' : 'danger'}>
                {voucher.status === 'ready' ? tx('বৈধ', 'Valid') : voucher.status === 'used' ? tx('ব্যবহৃত', 'Used') : tx('মেয়াদ শেষ', 'Expired')}
              </Badge>
            </div>
            {voucher.status === 'ready' ? (
              <>
                <p className="text-sm text-muted">{tx(`মেয়াদ ${voucher.expires.bn} পর্যন্ত`, `Valid until ${voucher.expires.en}`)}</p>
                {voucher.choices && (
                  <fieldset>
                    <legend className="mb-2 text-sm font-bold">{tx('কোনটি দেবেন?', 'Which item?')}</legend>
                    <div className="flex flex-wrap gap-2">
                      {voucher.choices.map((c, i) => (
                        <button key={c.en} type="button" aria-pressed={choice === i} onClick={() => setChoice(i)} className={cn('min-h-11 rounded-full border-[1.5px] px-3.5 font-bold', choice === i ? 'border-brand bg-brand text-brand-on' : 'border-line2 bg-surface')}>
                          {l(c)}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                )}
                <Button variant="rose" size="lg" onClick={give}>
                  <Gift size={20} aria-hidden="true" />
                  {tx('Reward দিন', 'Give reward')}
                </Button>
              </>
            ) : (
              <Notice tone="danger">
                {voucher.status === 'used'
                  ? tx(`এই ভাউচার ${voucher.usedOn?.bn ?? ''} তারিখে ব্যবহার করা হয়েছে।`, `This voucher was already used${voucher.usedOn ? ` on ${voucher.usedOn.en}` : ''}.`)
                  : tx(`এই ভাউচারের মেয়াদ ${voucher.expires.bn} তারিখে শেষ হয়েছে।`, `This voucher expired on ${voucher.expires.en}.`)}
              </Notice>
            )}
          </Card>
        )}
        {given && <Notice>{given}</Notice>}

        <section aria-label={tx('আজকের হিসাব', 'Today')} className="grid grid-cols-3 gap-2.5">
          {stats.map(({ label, value, bg, chip, Icon }) => (
            <div key={label} className="rounded-[18px] px-3 py-3.5" style={{ background: bg }}>
              <span className="mb-2 flex size-8 items-center justify-center rounded-[10px] text-navy" style={{ background: chip }}>
                <Icon size={18} strokeWidth={2.4} aria-hidden="true" />
              </span>
              <p className="font-display text-[28px] font-bold leading-tight">{n(value)}</p>
              <p className="text-[13px] text-muted">{label}</p>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
