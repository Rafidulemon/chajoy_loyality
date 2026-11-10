'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { mutate } from 'swr';
import { AlertTriangle, ArrowLeft, Gift, ShieldAlert, Undo2 } from 'lucide-react';
import { Badge, Button, ButtonLink, Card, Field, Notice, Stepper } from '@/components/ui';
import { toCustomer, toVoucher } from '@/lib/api/adapters';
import { api, isApiError } from '@/lib/api/client';
import { applyStampResult, cashierKeys, checkSignedOut, isUncertain, newIdempotencyKey, useCashierCustomer, useCashierMe } from '@/lib/api/cashier';
import { errorText } from '@/lib/api/messages';
import { useProgram } from '@/lib/api/program';
import type { CashierCustomerDto, RedeemResultDto, StampResultDto } from '@/lib/contracts/dto';
import type { Voucher } from '@/lib/data';
import { UNDO_WINDOW_MS } from '@/lib/domain/rules';
import { bnDigits, relativeDays } from '@/lib/format';
import { useI18n, type Text } from '@/lib/i18n';
import { cn } from '@/lib/cn';

const t = (bn: string, en: string): Text => ({ bn, en });
const plural = (count: number, word: string) => (count === 1 ? word : `${word}s`);

const COMPLETED = t('কার্ড সম্পূর্ণ! গ্রাহকের ফোনে Reward ভাউচার চলে গেছে।', 'Card complete! A reward voucher is now on the customer’s phone.');
const OVERRIDDEN = t('ম্যানেজারের অনুমতিতে ১টি Stamp যোগ হয়েছে।', '1 stamp added with manager approval.');
const PIN_SIX = t('PIN হলো ৬টি সংখ্যা', 'The PIN is 6 digits');
const added = (count: number) => t(`${bnDigits(String(count))}টি Stamp যোগ হয়েছে। গ্রাহকের কার্ডে একটু পরেই দেখা যাবে।`, `${count} ${plural(count, 'stamp')} added. It will show on the customer’s card in a moment.`);
const cancelled = (count: number) => t(`${bnDigits(String(count))}টি Stamp বাতিল করা হয়েছে।`, `${count} ${plural(count, 'stamp')} cancelled.`);
const onlyMore = (room: number) => t(`আজ আর মাত্র ${bnDigits(String(room))}টি Stamp দেওয়া যাবে।`, `Only ${room} more ${plural(room, 'stamp')} can be given today.`);
const rewardGiven = (title: Text, item: Text | null) =>
  t(`Reward দেওয়া হয়েছে: ${title.bn}${item ? ` · ${item.bn}` : ''}।`, `Reward given: ${title.en.toLowerCase()}${item ? ` · ${item.en.toLowerCase()}` : ''}.`);

function PageHeader({ title }: { title: string }) {
  const { tx } = useI18n();
  return (
    <div className="flex items-center gap-3">
      <Link href="/cashier/scan" aria-label={tx('স্ক্যানে ফিরে যান', 'Back to scan')} className="flex size-11 items-center justify-center rounded-full border border-line bg-surface text-ink">
        <ArrowLeft size={20} aria-hidden="true" />
      </Link>
      <h1 className="text-xl font-bold">{title}</h1>
    </div>
  );
}

export default function CashierCustomerPage() {
  const { id } = useParams<{ id: string }>();
  const { tx } = useI18n();
  const { customer, loading, notFound, refresh } = useCashierCustomer(id);

  // `key` starts the screen afresh for another customer, so one customer's half-finished stamp request never carries over to the next.
  if (customer) return <CustomerView key={customer.customer.id} data={customer} />;

  return (
    <>
      <PageHeader title={loading ? tx('গ্রাহক লোড হচ্ছে…', 'Loading customer…') : notFound ? tx('গ্রাহক পাওয়া যায়নি', 'Customer not found') : tx('গ্রাহক লোড করা যায়নি', 'Could not load the customer')} />
      {loading ? (
        <div aria-busy="true" aria-label={tx('লোড হচ্ছে', 'Loading')} className="flex flex-wrap items-start gap-4">
          <div className="flex min-w-0 flex-[3_1_340px] flex-col gap-3.5">
            <div className="h-[168px] animate-pulse rounded-[24px] bg-surface2" />
            <div className="h-[150px] animate-pulse rounded-[24px] bg-surface2" />
          </div>
          <div className="flex min-w-0 flex-[2_1_280px] flex-col gap-3">
            <div className="h-[72px] animate-pulse rounded-[18px] bg-surface2" />
            <div className="h-14 animate-pulse rounded-2xl bg-surface2" />
          </div>
        </div>
      ) : notFound ? (
        <Card className="flex flex-col items-start gap-3">
          <p className="text-muted">{tx('এই গ্রাহককে পাওয়া যায়নি। নম্বরটি আবার খুঁজে দেখুন।', 'We could not find this customer. Try searching for the number again.')}</p>
          <ButtonLink href="/cashier/scan" variant="secondary" size="sm">{tx('স্ক্যানে ফিরে যান', 'Back to scan')}</ButtonLink>
        </Card>
      ) : (
        <Card className="flex flex-col items-start gap-3">
          <Notice tone="danger">{tx('গ্রাহকের তথ্য লোড করা যায়নি। সংযোগ দেখে আবার চেষ্টা করুন।', 'Could not load this customer. Check your connection and try again.')}</Notice>
          <Button variant="secondary" size="sm" onClick={() => void refresh()}>{tx('আবার চেষ্টা করুন', 'Try again')}</Button>
        </Card>
      )}
    </>
  );
}

function CustomerView({ data }: { data: CashierCustomerDto }) {
  const { tx, l, n } = useI18n();
  const shop = useProgram();
  const { me, isManagement } = useCashierMe();
  const { customer: row, card, program, givenToday, roomToday } = data;
  const person = toCustomer(row);
  const key = cashierKeys.customer(row.id);
  const total = program.total;
  const limit = program.dailyLimit;
  const remaining = Math.max(0, total - card.stamps);
  const ready = data.readyVouchers.map((v) => toVoucher(v));
  /** A manager or owner with no outlet cannot give stamps: the server records every stamp against an outlet. */
  const noOutlet = !!me && me.branch === null;

  const [qty, setQty] = useState(1);
  const [message, setMessage] = useState<Text | null>(null);
  const [error, setError] = useState<Text | null>(null);
  /** The stamps from the last add that can still be cancelled. Cleared once the card completes, anything else happens, or the undo window closes. */
  const [undo, setUndo] = useState<{ entryId: string; count: number } | null>(null);
  const [busy, setBusy] = useState(false);
  /** The server said no more stamps today, even though the screen's numbers had not caught up yet. */
  const [limitHit, setLimitHit] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<Text | null>(null);
  /** The item picked for each voucher that offers a choice: voucher id -> item id. Nothing is picked for the cashier, unless there is only one item to pick. */
  const [pick, setPick] = useState<Record<string, string>>({});
  const pickedFor = (v: Voucher) => pick[v.id] ?? (v.choiceIds?.length === 1 ? v.choiceIds[0] : undefined);
  const [giving, setGiving] = useState<string | null>(null);

  /**
   * The key of a stamp request that may or may not have reached the server (a lost connection, a 5xx). The next press reuses it,
   * so the server answers with the first result instead of stamping twice (CA-20). It is dropped after a success and after
   * any answer that says the request definitely did not happen.
   */
  const keyRef = useRef<string | null>(null);
  const inFlight = useRef(false);

  const blocked = (roomToday !== null && roomToday <= 0) || limitHit;
  const allowance = Math.max(1, Math.min(remaining, roomToday ?? remaining));
  const amount = Math.min(qty, allowance);

  // Fresh numbers that show room again (a new day, a changed limit) lift a block that was only the server's earlier answer.
  useEffect(() => {
    if (roomToday === null || roomToday > 0) setLimitHit(false);
  }, [roomToday]);

  // The server refuses an undo after ten minutes, so the button goes away then too.
  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(() => setUndo(null), UNDO_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, [undo]);

  /** One write at a time: another tap while a request is open does nothing. */
  const run = async (work: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await work();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const reload = () => void mutate(key);
  const refreshToday = () => void mutate(cashierKeys.today);
  const closePin = () => {
    setPinOpen(false);
    setPin('');
    setPinError(null);
  };

  const addStamps = (input: { count: number; override?: boolean; pin?: string }) =>
    run(async () => {
      setMessage(null);
      const idempotencyKey = (keyRef.current ??= newIdempotencyKey());
      try {
        const res = await api.post<StampResultDto>('/api/cashier/stamps', { customerId: row.id, count: input.count, idempotencyKey, ...(input.pin ? { overridePin: input.pin } : {}) });
        keyRef.current = null;
        setQty(1);
        closePin();
        setLimitHit(false);
        setUndo(res.completed > 0 ? null : { entryId: res.entryId, count: res.added });
        setMessage(res.completed > 0 ? COMPLETED : input.override ? OVERRIDDEN : added(res.added));
        void mutate<CashierCustomerDto>(key, (cur) => (cur ? applyStampResult(cur, res) : cur));
        refreshToday();
      } catch (e) {
        checkSignedOut(e);
        if (!isUncertain(e)) keyRef.current = null;
        const code = isApiError(e) ? e.code : undefined;
        if (input.pin && (code === 'OVERRIDE_NOT_APPROVED' || code === 'ACCOUNT_LOCKED')) {
          setPin('');
          setPinError(errorText(e));
          return;
        }
        if (code === 'DAILY_LIMIT_REACHED') {
          const room = (isApiError(e) ? (e.details as { room?: unknown } | undefined)?.room : undefined);
          if (typeof room === 'number' && room > 0) {
            setError(onlyMore(room));
          } else {
            setLimitHit(true);
            setError(errorText(e));
          }
        } else {
          setError(errorText(e));
        }
        reload();
      }
    });

  const undoLast = () =>
    run(async () => {
      if (!undo) return;
      try {
        const res = await api.post<StampResultDto>(`/api/cashier/stamps/${undo.entryId}/undo`);
        setMessage(cancelled(undo.count));
        setUndo(null);
        void mutate<CashierCustomerDto>(key, (cur) => (cur ? applyStampResult(cur, res) : cur));
        refreshToday();
      } catch (e) {
        checkSignedOut(e);
        if (isApiError(e) && e.code === 'UNDO_NOT_ALLOWED') setUndo(null);
        setError(errorText(e));
        reload();
      }
    });

  const give = (v: Voucher) =>
    run(async () => {
      const itemId = v.choiceIds ? pickedFor(v) : undefined;
      if (v.choiceIds && !itemId) return;
      setMessage(null);
      setUndo(null);
      setGiving(v.id);
      try {
        const res = await api.post<RedeemResultDto>(`/api/cashier/vouchers/${v.id}/redeem`, itemId ? { itemId } : {});
        setMessage(rewardGiven(res.voucher.title, res.voucher.chosen));
        void mutate<CashierCustomerDto>(key, (cur) => {
          if (!cur) return cur;
          const left = cur.readyVouchers.filter((x) => x.id !== v.id);
          return { ...cur, card: res.card, customer: { ...cur.customer, visits: res.card.visits, lastVisitAt: res.card.lastVisitAt, hasReadyVoucher: left.length > 0 }, readyVouchers: left };
        });
        refreshToday();
      } catch (e) {
        checkSignedOut(e);
        setError(errorText(e));
        reload();
      } finally {
        setGiving(null);
      }
    });

  const submitPin = () => {
    if (!/^\d{6}$/.test(pin)) return setPinError(PIN_SIX);
    setPinError(null);
    void addStamps({ count: 1, override: true, pin });
  };

  const overrideLabel = tx('ম্যানেজার ওভাররাইড: ১টি Stamp', 'Manager override: add 1 stamp');

  return (
    <>
      <PageHeader title={tx('গ্রাহক পাওয়া গেছে', 'Customer found')} />
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-[3_1_340px] flex-col gap-3.5">
          <Card className="flex flex-col gap-3.5 rounded-[24px] p-[18px]">
            <div className="flex items-center gap-3">
              <span className="flex size-[54px] shrink-0 items-center justify-center rounded-[18px] font-display text-xl font-extrabold text-navy" style={{ background: person.avatar }}>{l(person.initial)}</span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-lg font-bold">{l(person.name)}</p>
                <p className="text-sm text-muted">{person.phone}</p>
              </div>
              {card.visits >= 10 ? <Badge tone="solidAqua">{tx('নিয়মিত', 'Regular')}</Badge> : card.visits <= 1 ? <Badge tone="solidAqua">{tx('নতুন', 'New')}</Badge> : null}
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                [n(card.visits), tx('মোট ভিজিট', 'Total visits')],
                [n(card.rewardsEarned), tx('নেওয়া Reward', 'Rewards earned')],
                [l(relativeDays(card.lastVisitAt ? Date.parse(card.lastVisitAt) : null)), tx('শেষ ভিজিট', 'Last visit')],
              ].map(([v, k]) => (
                <div key={k} className="rounded-[14px] bg-brand-soft px-1 py-2.5">
                  <p className="text-[17px] font-extrabold text-brand-ink">{v}</p>
                  <p className="text-xs text-muted">{k}</p>
                </div>
              ))}
            </div>
          </Card>
          <section aria-label={tx('কার্ডের অগ্রগতি', 'Card progress')} className="relative flex flex-col gap-3.5 overflow-hidden rounded-[24px] p-[18px]" style={{ background: shop.color, color: shop.fg }}>
            <span aria-hidden="true" className="absolute -right-8 -top-10 size-[120px] rounded-full" style={{ background: shop.deco1 }} />
            <div className="relative flex items-baseline justify-between gap-2">
              <span className="text-[15px] font-semibold">{tx(`চা জয় · ${n(total)}টি Stamp = ${shop.reward.bn}`, `ChaJoy · ${total} stamps = ${shop.reward.en}`)}</span>
              <span className="whitespace-nowrap rounded-full px-3 font-display text-2xl font-extrabold" style={{ background: shop.stampBg, color: shop.stampFg }}>{n(card.stamps)}/{n(total)}</span>
            </div>
            <div className="relative grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(total, 10)}, minmax(0, 1fr))` }}>
              {Array.from({ length: total }, (_, i) => (
                <span
                  key={i}
                  className={cn('aspect-square rounded-full', i < card.stamps ? 'shadow-[0_2px_0_rgba(0,0,0,0.2)]' : 'border-2 border-dashed')}
                  style={i < card.stamps ? { background: shop.stampBg } : { borderColor: shop.dash }}
                />
              ))}
            </div>
          </section>
          {error && <Notice tone="danger">{l(error)}</Notice>}
          {message ? (
            <div className="flex flex-col gap-2">
              <Notice>{l(message)}</Notice>
              {undo && (
                <Button variant="secondary" size="sm" className="self-start" disabled={busy} onClick={() => void undoLast()}>
                  <Undo2 size={18} aria-hidden="true" />
                  {tx('ভুল হয়েছে? বাতিল করুন', 'Mistake? Undo')}
                </Button>
              )}
            </div>
          ) : (
            !error &&
            givenToday > 0 &&
            !blocked && (
              <p className="flex items-start gap-2.5 rounded-2xl bg-tangerine-soft px-3.5 py-3 text-sm font-medium text-warn">
                <AlertTriangle size={20} className="mt-px shrink-0" aria-hidden="true" />
                {tx(`এই গ্রাহক আজ ${n(givenToday)}টি Stamp পেয়েছেন`, `This customer already got ${givenToday} ${plural(givenToday, 'stamp')} today`)}
              </p>
            )
          )}
        </div>

        <div className="flex min-w-0 flex-[2_1_280px] flex-col gap-3">
          {ready.length > 0 && (
            <Card className="flex flex-col gap-1 p-4">
              <h2 className="font-bold">{tx('ব্যবহারের জন্য রেডি Reward', 'Rewards ready to give')}</h2>
              <ul>
                {ready.map((v) => {
                  const ids = v.choiceIds;
                  const picked = pickedFor(v);
                  const needsPick = !!ids && !picked;
                  return (
                    <li key={v.id} className="flex flex-col gap-2.5 border-t border-line py-3 first:border-t-0">
                      <span className="flex flex-wrap items-center gap-3">
                        <span className="min-w-0 flex-1">
                          <span className="block font-bold">{l(v.title)}</span>
                          <span className="block text-[13px] text-muted">{v.code} · {tx(`মেয়াদ ${v.expires.bn} পর্যন্ত`, `until ${v.expires.en}`)}</span>
                        </span>
                        <Button size="sm" variant="rose" disabled={busy || needsPick} onClick={() => void give(v)}>{giving === v.id ? tx('দেওয়া হচ্ছে…', 'Giving…') : tx('দিন', 'Give')}</Button>
                      </span>
                      {v.choices && ids && (
                        <>
                          <span role="group" aria-label={tx('কোনটি দেবেন?', 'Which item?')} className="flex flex-wrap gap-2">
                            {v.choices.map((c, i) => (
                              <button key={ids[i]} type="button" aria-pressed={picked === ids[i]} onClick={() => setPick({ ...pick, [v.id]: ids[i] })} className={cn('min-h-11 rounded-full border-[1.5px] px-3.5 text-sm font-bold', picked === ids[i] ? 'border-brand bg-brand text-brand-on' : 'border-line2 bg-surface')}>
                                {l(c)}
                              </button>
                            ))}
                          </span>
                          {needsPick && <span className="text-[13px] text-muted">{tx('গ্রাহক যেটি নেবেন সেটি বেছে নিন', 'Pick the item the customer takes')}</span>}
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          {noOutlet && (
            <Notice tone="warn">{tx('আপনার অ্যাকাউন্টে কোনো আউটলেট ঠিক করা নেই, তাই Stamp দেওয়া যাবে না। মালিককে একটি আউটলেট দিতে বলুন।', 'No outlet is assigned to your account yet, so stamps cannot be given. Ask the owner to assign one.')}</Notice>
          )}

          {blocked ? (
            <div className="flex flex-col gap-2.5 rounded-[18px] bg-danger-soft px-4 py-3.5 text-danger">
              <p className="flex items-start gap-2.5 font-bold">
                <ShieldAlert size={20} className="mt-px shrink-0" aria-hidden="true" />
                {tx(`দিনের সীমা শেষ: আজ ${n(givenToday)}টি Stamp দেওয়া হয়েছে (সীমা ${n(limit)}টি)।`, `Daily limit reached: ${givenToday} ${plural(givenToday, 'stamp')} given today (limit ${limit}).`)}
              </p>
              {isManagement ? (
                <Button variant="danger" size="sm" className="self-start" disabled={busy || noOutlet} onClick={() => void addStamps({ count: 1, override: true })}>{overrideLabel}</Button>
              ) : pinOpen ? (
                <form onSubmit={(e) => { e.preventDefault(); submitPin(); }} className="flex flex-col gap-2.5 text-ink">
                  <Field id="override-pin" label={tx('ম্যানেজারের ৬ সংখ্যার PIN', 'Manager’s 6-digit PIN')} hint={tx('ম্যানেজারকে নিজে PIN দিতে বলুন', 'Ask the manager to type their PIN')} error={pinError ? l(pinError) : undefined}>
                    <input
                      id="override-pin"
                      type="password"
                      inputMode="numeric"
                      // Not "off" or a password hint: this is somebody else's PIN, so the browser must not fill in the cashier's own saved one.
                      autoComplete="one-time-code"
                      data-1p-ignore
                      data-lpignore="true"
                      maxLength={6}
                      autoFocus
                      placeholder="••••••"
                      value={pin}
                      onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setPinError(null); }}
                      className="h-14 w-full rounded-[14px] border-[1.5px] border-line2 bg-surface px-3.5 text-center font-mono text-2xl tracking-[0.4em] text-ink focus:border-brand focus:outline-none"
                    />
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" variant="danger" size="sm" disabled={busy || noOutlet || pin.length !== 6}>{busy ? tx('যাচাই হচ্ছে…', 'Checking…') : tx('অনুমতি দিন · ১টি Stamp', 'Approve · add 1 stamp')}</Button>
                    <Button variant="ghost" size="sm" disabled={busy} onClick={closePin}>{tx('বাতিল', 'Cancel')}</Button>
                  </div>
                </form>
              ) : (
                <Button variant="danger" size="sm" className="self-start" disabled={busy || noOutlet} onClick={() => setPinOpen(true)}>{overrideLabel}</Button>
              )}
            </div>
          ) : (
            <>
              <Stepper
                label={tx('Stamp সংখ্যা', 'Stamps to add')}
                value={n(amount)}
                onDecrease={() => setQty(Math.max(1, amount - 1))}
                onIncrease={() => setQty(Math.min(allowance, amount + 1))}
                decreaseLabel={tx('কমান', 'Decrease')}
                increaseLabel={tx('বাড়ান', 'Increase')}
              />
              <Button size="lg" disabled={busy || noOutlet} onClick={() => void addStamps({ count: amount })}>
                {busy ? tx('যোগ হচ্ছে…', 'Adding…') : tx(`+${n(amount)}টি Stamp দিন`, `Add ${amount} ${plural(amount, 'stamp')}`)}
              </Button>
            </>
          )}
          <p className="flex min-h-[52px] items-center justify-center gap-2 rounded-[18px] border-[1.5px] border-dashed border-line2 px-3 text-center text-[15px] text-muted">
            <Gift size={18} aria-hidden="true" />
            {tx(`Reward পেতে আরও ${n(remaining)}টি Stamp লাগবে`, `${remaining} more ${plural(remaining, 'stamp')} until the reward`)}
          </p>
          <p className="px-1 text-center text-[13px] text-muted">
            {tx(`প্রতি ৳${n(program.minPurchase)} বা তার বেশি কেনাকাটায় ১টি Stamp`, `1 stamp per purchase of ৳${n(program.minPurchase)} or more`)}
            {roomToday !== null && !blocked && ` · ${tx(`আজ আরও ${n(roomToday)}টি দেওয়া যাবে`, `${roomToday} more allowed today`)}`}
          </p>
        </div>
      </div>
    </>
  );
}
