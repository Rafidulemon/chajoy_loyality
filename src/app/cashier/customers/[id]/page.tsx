'use client';

import { useState } from 'react';
import Link from 'next/link';
import { notFound, useParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Gift, ShieldAlert, Undo2 } from 'lucide-react';
import { Badge, Button, Card, Notice, Stepper } from '@/components/ui';
import { counterOutlet, onDutyCashier, type Voucher } from '@/lib/data';
import { useI18n } from '@/lib/i18n';
import { useProgram, useStore } from '@/lib/store';
import { cn } from '@/lib/cn';

export default function CashierCustomerPage() {
  const { id } = useParams<{ id: string }>();
  const store = useStore();
  const shop = useProgram();
  const { program } = shop;
  const TOTAL = shop.total;
  const { tx, l, n } = useI18n();
  const customer = store.customer(id);
  const card = customer ? store.cards[customer.id] : undefined;
  const [qty, setQty] = useState(1);
  const [message, setMessage] = useState('');
  /** Stamps from the last add that can still be cancelled. Cleared once the card is completed or anything else happens. */
  const [undo, setUndo] = useState<number | null>(null);
  /** Which item the cashier picked for each voucher that offers a choice. */
  const [choice, setChoice] = useState<Record<string, number>>({});
  if (!customer || !card) notFound();

  const by = onDutyCashier.name;
  const outlet = counterOutlet.name;
  const remaining = TOTAL - card.stamps;
  const ready = card.vouchers.filter((v) => v.status === 'ready');

  // The program's daily limit caps what can be added at the counter. A manager can still override it.
  const limit = program.dailyLimit;
  const room = limit === 0 ? remaining : Math.max(0, limit - card.givenToday);
  const allowance = Math.min(remaining, room);
  const blocked = allowance <= 0;
  const amount = Math.min(qty, Math.max(allowance, 1));

  const addStamps = (override = false) => {
    const added = override ? 1 : amount;
    setQty(1);
    const { completed } = store.addStamps(customer.id, added, {
      detail: override
        ? { bn: `চা জয় · ${outlet.bn} · সীমা ছাড়িয়ে`, en: `ChaJoy · ${outlet.en} · limit override` }
        : { bn: `চা জয় · ${outlet.bn}`, en: `ChaJoy · ${outlet.en}` },
      by,
      source: 'cashier',
    });
    setUndo(completed ? null : added);
    setMessage(
      completed
        ? tx('কার্ড সম্পূর্ণ! গ্রাহকের ফোনে Reward ভাউচার চলে গেছে।', 'Card complete! A reward voucher is now on the customer’s phone.')
        : tx(`${n(added)}টি Stamp যোগ হয়েছে। গ্রাহকের কার্ডে এখনই দেখা যাবে।`, `${added} stamp${added > 1 ? 's' : ''} added. It shows on the customer’s card right now.`),
    );
  };

  const undoLast = () => {
    if (undo === null) return;
    store.undoStamps(customer.id, undo, by);
    setMessage(tx(`${n(undo)}টি Stamp বাতিল করা হয়েছে।`, `${undo} stamp${undo > 1 ? 's' : ''} cancelled.`));
    setUndo(null);
  };

  const give = (v: Voucher) => {
    const item = v.choices?.[choice[v.id] ?? 0];
    store.redeem(customer.id, v.id, by, item);
    setUndo(null);
    setMessage(tx(`Reward দেওয়া হয়েছে: ${v.title.bn}${item ? ` · ${item.bn}` : ''}।`, `Reward given: ${v.title.en.toLowerCase()}${item ? ` · ${item.en.toLowerCase()}` : ''}.`));
  };

  return (
    <>
      <div className="flex items-center gap-3">
        <Link href="/cashier/scan" aria-label={tx('স্ক্যানে ফিরে যান', 'Back to scan')} className="flex size-11 items-center justify-center rounded-full border border-line bg-surface text-ink">
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>
        <h1 className="text-xl font-bold">{tx('গ্রাহক পাওয়া গেছে', 'Customer found')}</h1>
      </div>
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-[3_1_340px] flex-col gap-3.5">
          <Card className="flex flex-col gap-3.5 rounded-[24px] p-[18px]">
            <div className="flex items-center gap-3">
              <span className="flex size-[54px] items-center justify-center rounded-[18px] font-display text-xl font-extrabold text-navy" style={{ background: customer.avatar }}>{l(customer.initial)}</span>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold">{l(customer.name)}</p>
                <p className="text-sm text-muted">{customer.phone}</p>
              </div>
              <Badge tone="solidAqua">{card.visits >= 10 ? tx('নিয়মিত', 'Regular') : tx('নতুন', 'New')}</Badge>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                [n(card.visits), tx('মোট ভিজিট', 'Total visits')],
                [n(card.earned), tx('নেওয়া Reward', 'Rewards earned')],
                [card.activity.length ? tx('আজ', 'Today') : l(customer.last), tx('শেষ ভিজিট', 'Last visit')],
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
              <span className="text-[15px] font-semibold">{tx(`চা জয় · ${n(TOTAL)}টি Stamp = ${shop.reward.bn}`, `ChaJoy · ${TOTAL} stamps = ${shop.reward.en}`)}</span>
              <span className="whitespace-nowrap rounded-full px-3 font-display text-2xl font-extrabold" style={{ background: shop.stampBg, color: shop.stampFg }}>{n(card.stamps)}/{n(TOTAL)}</span>
            </div>
            <div className="relative grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(TOTAL, 10)}, minmax(0, 1fr))` }}>
              {Array.from({ length: TOTAL }, (_, i) => (
                <span
                  key={i}
                  className={cn('aspect-square rounded-full', i < card.stamps ? 'shadow-[0_2px_0_rgba(0,0,0,0.2)]' : 'border-2 border-dashed')}
                  style={i < card.stamps ? { background: shop.stampBg } : { borderColor: shop.dash }}
                />
              ))}
            </div>
          </section>
          {message ? (
            <div className="flex flex-col gap-2">
              <Notice>{message}</Notice>
              {undo !== null && (
                <Button variant="secondary" size="sm" className="self-start" onClick={undoLast}>
                  <Undo2 size={18} aria-hidden="true" />
                  {tx('ভুল হয়েছে? বাতিল করুন', 'Mistake? Undo')}
                </Button>
              )}
            </div>
          ) : (
            card.givenToday > 0 &&
            !blocked && (
              <p className="flex items-start gap-2.5 rounded-2xl bg-tangerine-soft px-3.5 py-3 text-sm font-medium text-warn">
                <AlertTriangle size={20} className="mt-px shrink-0" aria-hidden="true" />
                {tx(`এই গ্রাহক আজ ${n(card.givenToday)}টি Stamp পেয়েছেন`, `This customer already got ${card.givenToday} stamp${card.givenToday > 1 ? 's' : ''} today`)}
              </p>
            )
          )}
        </div>

        <div className="flex min-w-0 flex-[2_1_280px] flex-col gap-3">
          {ready.length > 0 && (
            <Card className="flex flex-col gap-1 p-4">
              <h2 className="font-bold">{tx('ব্যবহারের জন্য রেডি Reward', 'Rewards ready to give')}</h2>
              <ul>
                {ready.map((v) => (
                  <li key={v.id} className="flex flex-col gap-2.5 border-t border-line py-3 first:border-t-0">
                    <span className="flex flex-wrap items-center gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold">{l(v.title)}</span>
                        <span className="block text-[13px] text-muted">{v.code} · {tx(`মেয়াদ ${v.expires.bn} পর্যন্ত`, `until ${v.expires.en}`)}</span>
                      </span>
                      <Button size="sm" variant="rose" onClick={() => give(v)}>{tx('দিন', 'Give')}</Button>
                    </span>
                    {v.choices && (
                      <span role="group" aria-label={tx('কোনটি দেবেন?', 'Which item?')} className="flex flex-wrap gap-2">
                        {v.choices.map((c, i) => (
                          <button key={c.en} type="button" aria-pressed={(choice[v.id] ?? 0) === i} onClick={() => setChoice({ ...choice, [v.id]: i })} className={cn('min-h-11 rounded-full border-[1.5px] px-3.5 text-sm font-bold', (choice[v.id] ?? 0) === i ? 'border-brand bg-brand text-brand-on' : 'border-line2 bg-surface')}>
                            {l(c)}
                          </button>
                        ))}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {blocked ? (
            <div className="flex flex-col gap-2.5 rounded-[18px] bg-danger-soft px-4 py-3.5 text-danger">
              <p className="flex items-start gap-2.5 font-bold">
                <ShieldAlert size={20} className="mt-px shrink-0" aria-hidden="true" />
                {tx(`দিনের সীমা শেষ: আজ ${n(card.givenToday)}টি Stamp দেওয়া হয়েছে (সীমা ${n(limit)}টি)।`, `Daily limit reached: ${card.givenToday} stamp${card.givenToday > 1 ? 's' : ''} given today (limit ${limit}).`)}
              </p>
              <Button variant="danger" size="sm" className="self-start" onClick={() => addStamps(true)}>{tx('ম্যানেজার ওভাররাইড: ১টি Stamp', 'Manager override: add 1 stamp')}</Button>
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
              <Button size="lg" onClick={() => addStamps()}>{tx(`+${n(amount)}টি Stamp দিন`, `Add ${amount} stamp${amount > 1 ? 's' : ''}`)}</Button>
            </>
          )}
          <p className="flex min-h-[52px] items-center justify-center gap-2 rounded-[18px] border-[1.5px] border-dashed border-line2 px-3 text-center text-[15px] text-muted">
            <Gift size={18} aria-hidden="true" />
            {tx(`Reward পেতে আরও ${n(remaining)}টি Stamp লাগবে`, `${remaining} more stamp${remaining > 1 ? 's' : ''} until the reward`)}
          </p>
          <p className="px-1 text-center text-[13px] text-muted">
            {tx(`প্রতি ৳${n(program.minPurchase)} বা তার বেশি কেনাকাটায় ১টি Stamp`, `1 stamp per purchase of ৳${program.minPurchase} or more`)}
            {limit > 0 && !blocked && ` · ${tx(`আজ আরও ${n(room)}টি দেওয়া যাবে`, `${room} more allowed today`)}`}
          </p>
        </div>
      </div>
    </>
  );
}
