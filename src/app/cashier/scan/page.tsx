'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { mutate } from 'swr';
import { Camera, CameraOff, Check, ChevronRight, Gift, Plus, Search, Ticket, UserPlus, X } from 'lucide-react';
import { Badge, Button, Card, Field, IconChip, Notice, inputClass } from '@/components/ui';
import { toCustomer, toVoucher } from '@/lib/api/adapters';
import { api, isApiError, withQuery } from '@/lib/api/client';
import { QR_PREFIX, asciiDigits, cashierKeys, checkSignedOut, memberCode, scanError, useQrScanner, useToday, voucherLookupError, type CustomerListDto } from '@/lib/api/cashier';
import { errorText } from '@/lib/api/messages';
import { useProgram } from '@/lib/api/program';
import type { CashierCustomerDto, RedeemResultDto, VoucherLookupDto } from '@/lib/contracts/dto';
import { formatPhone, normalizePhone } from '@/lib/domain/phone';
import { useI18n, type Text } from '@/lib/i18n';
import { cn } from '@/lib/cn';

const t = (bn: string, en: string): Text => ({ bn, en });

const SHORT_NUMBER = t('অন্তত শেষ ৪ সংখ্যা লিখুন', 'Enter at least the last 4 digits');
const NO_CUSTOMER = t('এই নম্বরে কোনো গ্রাহক নেই', 'No customer with that number');
const NEED_CODE = t('ভাউচারের কোড লিখুন', 'Enter the voucher code');
const NOT_OURS = t('এটি চা জয়-এর QR কোড নয়।', 'That is not a ChaJoy QR code.');

/**
 * The dark camera tile. It opens the camera only when the cashier taps Start, reads a member QR, and goes to that customer.
 * A voucher QR is handed to `onVoucher`. Where the browser cannot scan it says so plainly instead of pretending to.
 */
function QrTile({ onVoucher }: { onVoucher: (code: string) => void }) {
  const { tx, l } = useI18n();
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [issue, setIssue] = useState<Text | null>(null);
  const flash = useRef<number | undefined>(undefined);

  /** Show a message under the tile; with `forMs` it goes away by itself. */
  const show = (text: Text | null, forMs?: number) => {
    window.clearTimeout(flash.current);
    setIssue(text);
    if (text && forMs) flash.current = window.setTimeout(() => setIssue(null), forMs);
  };
  useEffect(() => () => window.clearTimeout(flash.current), []);

  const openMember = async (token: string) => {
    setChecking(true);
    show(null);
    try {
      const { customerId } = await api.post<{ customerId: string }>('/api/cashier/scan', { token });
      router.push(`/cashier/customers/${customerId}`);
    } catch (e) {
      checkSignedOut(e);
      setChecking(false);
      show(scanError(e));
    }
  };

  const { videoRef, state, error, start, stop } = useQrScanner((value) => {
    if (value.startsWith(QR_PREFIX.member)) {
      void openMember(value.trim());
      return true;
    }
    if (value.startsWith(QR_PREFIX.voucher)) {
      onVoucher(value.slice(QR_PREFIX.voucher.length));
      return true;
    }
    show(NOT_OURS, 3500);
    return false;
  });

  const scanning = state === 'scanning';
  const problem = error ?? issue;

  return (
    <div className="flex min-w-0 flex-[3_1_340px] flex-col gap-3">
      <div role="region" aria-label={tx('QR স্ক্যানার', 'QR scanner')} className="relative h-[clamp(340px,50vw,480px)] overflow-hidden rounded-hero bg-[#0E1E24]">
        {!scanning && (
          <>
            <span aria-hidden="true" className="absolute -left-16 -top-16 size-[200px] rounded-full bg-[#97C334]/60" />
            <span aria-hidden="true" className="absolute -bottom-12 -right-12 size-[180px] rounded-full bg-rose/35" />
          </>
        )}
        {/* Always in the page, so the camera has somewhere to play; only visible while scanning. */}
        <video ref={videoRef} muted playsInline aria-hidden="true" className={cn('absolute inset-0 size-full object-cover', !scanning && 'opacity-0')} />

        {state === 'unsupported' ? (
          <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-white">
            <CameraOff size={40} aria-hidden="true" />
            <p className="text-base font-semibold">{tx('এই ব্রাউজারে ক্যামেরা দিয়ে স্ক্যান করা যায় না। মোবাইল নম্বর দিয়ে খুঁজুন।', 'Camera scanning is not available in this browser. Search by mobile number instead.')}</p>
          </div>
        ) : (
          <>
            <span aria-hidden="true" className="absolute left-1/2 top-[46%] size-[220px] -translate-x-1/2 -translate-y-1/2">
              <span className="absolute left-0 top-0 size-11 rounded-tl-2xl border-l-[6px] border-t-[6px] border-tangerine" />
              <span className="absolute right-0 top-0 size-11 rounded-tr-2xl border-r-[6px] border-t-[6px] border-tangerine" />
              <span className="absolute bottom-0 left-0 size-11 rounded-bl-2xl border-b-[6px] border-l-[6px] border-tangerine" />
              <span className="absolute bottom-0 right-0 size-11 rounded-br-2xl border-b-[6px] border-r-[6px] border-tangerine" />
              <span className="absolute inset-x-[18px] top-[108px] h-1 rounded-full bg-aqua shadow-[0_0_18px_#2EC4B6]" />
            </span>

            {state === 'idle' && !checking && (
              <span className="absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2">
                <Button size="sm" onClick={() => void start()}>
                  <Camera size={18} aria-hidden="true" />
                  {tx('ক্যামেরা চালু করুন', 'Start camera')}
                </Button>
              </span>
            )}
            {(state === 'starting' || checking) && (
              <p role="status" className="absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/60 px-4 py-2 text-[15px] font-bold text-white">
                {checking ? tx('QR যাচাই হচ্ছে…', 'Checking the QR…') : tx('ক্যামেরা খুলছে…', 'Opening camera…')}
              </p>
            )}
            {scanning && (
              <Button variant="secondary" size="sm" className="absolute right-3 top-3" onClick={stop}>
                <X size={18} aria-hidden="true" />
                {tx('বন্ধ করুন', 'Stop')}
              </Button>
            )}
            <span className="absolute inset-x-4 bottom-[18px] text-center">
              <span className="inline-block rounded-full bg-black/45 px-3 py-1 text-[15px] font-semibold text-white">
                {state === 'idle' && !checking ? tx('ক্যামেরা চালু করে গ্রাহকের QR কোড ফ্রেমের ভিতরে রাখুন', 'Start the camera, then place the customer’s QR inside the frame') : tx('গ্রাহকের QR কোড ফ্রেমের ভিতরে রাখুন', 'Place the customer’s QR inside the frame')}
              </span>
            </span>
          </>
        )}
      </div>
      {problem && <Notice tone={problem === NOT_OURS ? 'warn' : 'danger'}>{l(problem)}</Notice>}
    </div>
  );
}

export default function ScanPage() {
  const { tx, l, n } = useI18n();
  const router = useRouter();
  const shop = useProgram();
  const today = useToday();

  // Find a customer by phone number.
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<Text | null>(null);
  const [searching, setSearching] = useState(false);
  const [matches, setMatches] = useState<CustomerListDto['items'] | null>(null);
  const [unknown, setUnknown] = useState(false);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<Text | null>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<Text | null>(null);

  // Redeem a voucher by its code.
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<Text | null>(null);
  const [looking, setLooking] = useState(false);
  const [found, setFound] = useState<VoucherLookupDto | null>(null);
  /** The id of the item the cashier picked, for a voucher that offers a choice. Nothing is picked for them. */
  const [pick, setPick] = useState<string | null>(null);
  const [giving, setGiving] = useState(false);
  const [giveError, setGiveError] = useState<Text | null>(null);
  const [given, setGiven] = useState<Text | null>(null);

  const digits = asciiDigits(phone);
  /** The typed number as a complete, valid Bangladeshi mobile number, or null. */
  const fullNumber = normalizePhone(phone);

  const search = async () => {
    if (searching) return;
    setUnknown(false);
    setMatches(null);
    setAddError(null);
    if (digits.length < 4) return setPhoneError(SHORT_NUMBER);
    setSearching(true);
    try {
      const res = await api.get<CustomerListDto>(cashierKeys.customers(digits));
      if (res.items.length === 1) {
        router.push(`/cashier/customers/${res.items[0].id}`);
        return;
      }
      if (res.items.length > 1) {
        setMatches(res.items);
        return;
      }
      setPhoneError(NO_CUSTOMER);
      setUnknown(true);
    } catch (e) {
      checkSignedOut(e);
      setPhoneError(errorText(e));
    } finally {
      setSearching(false);
    }
  };

  const addCustomer = async () => {
    if (adding || !fullNumber) return;
    const clean = name.replace(/\s+/g, ' ').trim();
    if (clean.length < 2) return setNameError(t('গ্রাহকের নাম লিখুন', 'Enter the customer’s name'));
    setAdding(true);
    setAddError(null);
    try {
      const created = await api.post<CashierCustomerDto>('/api/cashier/customers', { name: clean, phone: fullNumber });
      // The customer page opens with this card already in hand; it still reloads it from the server.
      await mutate(cashierKeys.customer(created.customer.id), created, { revalidate: false });
      void mutate(cashierKeys.today);
      router.push(`/cashier/customers/${created.customer.id}`);
    } catch (e) {
      checkSignedOut(e);
      setAddError(errorText(e));
      setAdding(false);
    }
  };

  const checkCode = async (raw = code) => {
    if (looking) return;
    const value = raw.trim();
    setGiven(null);
    setGiveError(null);
    setFound(null);
    if (value.length < 4) return setCodeError(NEED_CODE);
    setLooking(true);
    try {
      setFound(await api.get<VoucherLookupDto>(withQuery('/api/cashier/vouchers/lookup', { code: value })));
      setPick(null);
    } catch (e) {
      checkSignedOut(e);
      setCodeError(voucherLookupError(e));
    } finally {
      setLooking(false);
    }
  };

  const voucher = found ? toVoucher(found.voucher) : null;
  const hasChoices = !!voucher?.choiceIds?.length;
  /** The item to give: the one the cashier tapped, or the only one there is. */
  const picked = pick ?? (voucher?.choiceIds?.length === 1 ? voucher.choiceIds[0] : null);

  const give = async () => {
    if (!found || !voucher || giving) return;
    if (hasChoices && !picked) return;
    setGiving(true);
    setGiveError(null);
    try {
      const res = await api.post<RedeemResultDto>(`/api/cashier/vouchers/${found.voucher.id}/redeem`, hasChoices ? { itemId: picked } : {});
      const item = res.voucher.chosen;
      setGiven(t(`Reward দেওয়া হয়েছে: ${res.voucher.title.bn}${item ? ` · ${item.bn}` : ''}।`, `Reward given: ${res.voucher.title.en.toLowerCase()}${item ? ` · ${item.en.toLowerCase()}` : ''}.`));
      setFound(null);
      setCode('');
      void mutate(cashierKeys.customer(found.customer.id));
      void mutate(cashierKeys.today);
    } catch (e) {
      checkSignedOut(e);
      if (isApiError(e) && (e.code === 'VOUCHER_USED' || e.code === 'VOUCHER_EXPIRED')) {
        // Someone used it first, or it ran out a moment ago: show the voucher as it is now, which says so.
        try {
          const fresh = await api.get<VoucherLookupDto>(withQuery('/api/cashier/vouchers/lookup', { code: found.voucher.code }));
          setFound(fresh);
          if (fresh.voucher.status !== 'ready') return;
        } catch {
          // Keep what is on screen and show the message below.
        }
      }
      setGiveError(errorText(e));
    } finally {
      setGiving(false);
    }
  };

  const stats = [
    { label: tx('আজকের Stamp', 'Stamps today'), value: today.stats.stamps, bg: 'var(--tangerine-soft)', chip: '#F5D900', Icon: Check },
    { label: tx('আজকের Reward', 'Rewards today'), value: today.stats.rewards, bg: 'var(--rose-soft)', chip: '#FF5D73', Icon: Gift },
    { label: tx('নতুন গ্রাহক', 'New customers'), value: today.stats.newCustomers, bg: 'var(--aqua-soft)', chip: '#2EC4B6', Icon: Plus },
  ];

  return (
    <div className="flex flex-wrap items-start gap-5">
      <QrTile
        onVoucher={(c) => {
          setCode(c.toUpperCase());
          void checkCode(c);
        }}
      />

      <div className="flex min-w-0 flex-[2_1_280px] flex-col gap-[18px]">
        <form onSubmit={(e) => { e.preventDefault(); void search(); }}>
          <Field id="cust-phone" label={tx('অথবা মোবাইল নম্বর দিয়ে খুঁজুন', 'Or search by mobile number')} error={phoneError ? l(phoneError) : undefined}>
            <div className="flex gap-2.5">
              <input
                id="cust-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="off"
                placeholder="01XXX-XXXXXX"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setPhoneError(null);
                  setUnknown(false);
                  setMatches(null);
                }}
                className={`${inputClass} h-[54px] rounded-2xl`}
              />
              <button type="submit" disabled={searching} aria-label={tx('খুঁজুন', 'Search')} aria-busy={searching} className={cn('flex size-[54px] shrink-0 items-center justify-center rounded-2xl bg-brand text-brand-on', searching && 'animate-pulse opacity-70')}>
                <Search size={22} strokeWidth={2.4} aria-hidden="true" />
              </button>
            </div>
          </Field>
        </form>

        {matches && (
          <Card className="flex flex-col gap-1 p-4">
            <h2 className="font-bold">{tx('একাধিক গ্রাহক মিলেছে। একজনকে বেছে নিন', 'Several customers match. Pick one')}</h2>
            <ul>
              {matches.map((row) => {
                const c = toCustomer(row);
                return (
                  <li key={c.id}>
                    <Link href={`/cashier/customers/${c.id}`} className="flex min-h-16 items-center gap-3 border-t border-line py-2 text-ink first:border-t-0">
                      <IconChip color={c.avatar}>{l(c.initial)}</IconChip>
                      <span className="min-w-0 flex-1">
                        <span className="block break-words font-bold">{l(c.name)}</span>
                        <span className="block text-sm text-muted">{c.phone} · {n(c.stamps)}/{n(shop.total)} Stamp</span>
                      </span>
                      <ChevronRight size={20} className="shrink-0 text-muted" aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        {unknown && (
          <Card className="flex flex-col gap-3 border-2 border-brand p-4">
            <p className="flex items-center gap-2 font-bold"><UserPlus size={20} aria-hidden="true" />{tx('নতুন গ্রাহক?', 'New customer?')}</p>
            {digits.length < 10 ? (
              <p className="text-sm text-muted">{tx('নতুন গ্রাহক যোগ করতে পুরো মোবাইল নম্বরটি লিখুন।', 'Type the full mobile number to add them as a new customer.')}</p>
            ) : !fullNumber ? (
              <p className="text-sm text-muted">{tx('এটি সঠিক মোবাইল নম্বর নয়। নম্বরটি দেখে আবার লিখুন।', 'That is not a valid mobile number. Check it and type it again.')}</p>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); void addCustomer(); }} className="flex flex-col gap-3">
                <p className="text-sm text-muted">{tx('নম্বর', 'Number')}: <span className="font-bold text-ink">{formatPhone(fullNumber)}</span></p>
                <Field id="new-name" label={tx('গ্রাহকের নাম', 'Customer name')} error={nameError ? l(nameError) : undefined}>
                  <input id="new-name" autoComplete="off" maxLength={80} value={name} onChange={(e) => { setName(e.target.value); setNameError(null); }} placeholder={tx('যেমন: তানভীর আহমেদ', 'e.g. Tanvir Ahmed')} className={inputClass} />
                </Field>
                {addError && <Notice tone="danger">{l(addError)}</Notice>}
                <Button type="submit" disabled={adding}>
                  {adding ? tx('যোগ হচ্ছে…', 'Adding…') : shop.program.welcome ? tx('গ্রাহক যোগ করুন · ১টি স্বাগতম Stamp', 'Add customer · 1 welcome stamp') : tx('গ্রাহক যোগ করুন', 'Add customer')}
                </Button>
              </form>
            )}
          </Card>
        )}

        <form onSubmit={(e) => { e.preventDefault(); void checkCode(); }}>
          <Field id="voucher-code" label={tx('Reward ভাউচার দিন', 'Redeem a reward voucher')} hint={tx('গ্রাহকের ভাউচারের QR-এর নিচের কোডটি লিখুন', 'Type the code under the customer’s voucher QR')} error={codeError ? l(codeError) : undefined}>
            <div className="flex gap-2.5">
              <input
                id="voucher-code"
                autoCapitalize="characters"
                autoComplete="off"
                maxLength={40}
                placeholder="CJ-XXXX-XXXX"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  setCodeError(null);
                  setFound(null);
                  setGiven(null);
                  setGiveError(null);
                }}
                className={`${inputClass} h-[54px] rounded-2xl font-mono tracking-wider`}
              />
              <button type="submit" disabled={looking} aria-label={tx('ভাউচার দেখুন', 'Check voucher')} aria-busy={looking} className={cn('flex size-[54px] shrink-0 items-center justify-center rounded-2xl bg-[#171717] text-white', looking && 'animate-pulse opacity-70')}>
                <Ticket size={22} strokeWidth={2.2} aria-hidden="true" />
              </button>
            </div>
          </Field>
        </form>

        {found && voucher && (
          <Card className="flex flex-col gap-3 p-4">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-brand text-brand-on"><Gift size={22} aria-hidden="true" /></span>
              <div className="min-w-0 flex-1">
                <p className="font-bold">{l(voucher.title)}</p>
                <p className="break-words text-sm text-muted">{found.customer.name || tx('গ্রাহক', 'Customer')} · {memberCode(found.customer.memberNo)}</p>
                <p className="font-mono text-sm text-muted">{voucher.code}</p>
              </div>
              <Badge tone={voucher.status === 'ready' ? 'ok' : 'danger'}>
                {voucher.status === 'ready' ? tx('বৈধ', 'Valid') : voucher.status === 'used' ? tx('ব্যবহৃত', 'Used') : tx('মেয়াদ শেষ', 'Expired')}
              </Badge>
            </div>
            {voucher.status === 'ready' ? (
              <>
                <p className="text-sm text-muted">{tx(`মেয়াদ ${voucher.expires.bn} পর্যন্ত`, `Valid until ${voucher.expires.en}`)}</p>
                {voucher.choices && voucher.choiceIds && (
                  <fieldset>
                    <legend className="mb-2 text-sm font-bold">{tx('কোনটি দেবেন?', 'Which item?')}</legend>
                    <div className="flex flex-wrap gap-2">
                      {voucher.choices.map((c, i) => (
                        <button key={voucher.choiceIds![i]} type="button" aria-pressed={picked === voucher.choiceIds![i]} onClick={() => setPick(voucher.choiceIds![i])} className={cn('min-h-11 rounded-full border-[1.5px] px-3.5 font-bold', picked === voucher.choiceIds![i] ? 'border-brand bg-brand text-brand-on' : 'border-line2 bg-surface')}>
                          {l(c)}
                        </button>
                      ))}
                    </div>
                    {!picked && <p className="mt-2 text-sm text-muted">{tx('গ্রাহক যেটি নেবেন সেটি বেছে নিন', 'Pick the item the customer takes')}</p>}
                  </fieldset>
                )}
                {giveError && <Notice tone="danger">{l(giveError)}</Notice>}
                <Button variant="rose" size="lg" disabled={giving || (hasChoices && !picked)} onClick={() => void give()}>
                  <Gift size={20} aria-hidden="true" />
                  {giving ? tx('দেওয়া হচ্ছে…', 'Giving…') : tx('Reward দিন', 'Give reward')}
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
        {given && <Notice>{l(given)}</Notice>}

        <section aria-label={tx('আজকের হিসাব', 'Today')} className="grid grid-cols-3 gap-2.5">
          {stats.map(({ label, value, bg, chip, Icon }) => (
            <div key={label} className="rounded-[18px] px-3 py-3.5" style={{ background: bg }}>
              <span className="mb-2 flex size-8 items-center justify-center rounded-[10px] text-navy" style={{ background: chip }}>
                <Icon size={18} strokeWidth={2.4} aria-hidden="true" />
              </span>
              <p className="font-display text-[28px] font-bold leading-tight">{today.ready ? n(value) : '–'}</p>
              <p className="text-[13px] text-muted">{label}</p>
            </div>
          ))}
        </section>
        {today.failed && <p className="px-1 text-center text-[13px] text-muted">{tx('আজকের হিসাব লোড করা যায়নি। সংযোগ দেখুন।', 'Could not load today’s figures. Check your connection.')}</p>}
      </div>
    </div>
  );
}
