'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Check, Copy } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { URGENT_DAYS, useDaysText, voucherQr } from '@/components/voucher-ticket';
import { ButtonLink, Card, CardTitle, Notice } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { useWallet } from '@/lib/wallet';

export default function RewardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { vouchers } = useWallet();
  const { tx, l } = useI18n();
  const days = useDaysText();
  const [copied, setCopied] = useState(false);
  const v = vouchers.find((x) => x.id === id);

  const back = (
    <Link href="/rewards" className="inline-flex min-h-10 items-center gap-1.5 self-start text-[15px] font-bold">
      <ArrowLeft size={18} aria-hidden="true" />
      {tx('Reward-এ ফিরুন', 'Back to rewards')}
    </Link>
  );

  // Vouchers live in memory, so one issued in this session is gone after a reload.
  if (!v)
    return (
      <>
        {back}
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <h1 className="font-display text-2xl font-bold">{tx('ভাউচারটি পাওয়া যায়নি', 'Voucher not found')}</h1>
          <p className="max-w-sm text-muted">{tx('এটি হয়তো আর নেই। আপনার সব Reward এক জায়গায় দেখুন।', 'It may no longer be available. See all your rewards in one place.')}</p>
          <ButtonLink href="/rewards">{tx('সব Reward', 'All rewards')}</ButtonLink>
        </Card>
      </>
    );

  const ready = v.status === 'ready';
  const urgent = ready && v.daysLeft <= URGENT_DAYS;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(v.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard can be blocked; the code is still shown on screen */
    }
  };

  const terms = [
    tx('একবারই ব্যবহার করা যাবে', 'Can be used once'),
    tx('সব আউটলেটে চলবে', 'Valid at every outlet'),
    tx('অন্য অফারের সাথে মেশানো যাবে না', 'Cannot be combined with other offers'),
    tx('নগদে বদলানো যাবে না', 'Cannot be exchanged for cash'),
  ];

  return (
    <>
      {back}
      {urgent && <Notice tone="warn">{tx(`${days(v.daysLeft)} বাকি! ${v.expires.bn}-এর মধ্যে ব্যবহার করুন।`, `Ends in ${days(v.daysLeft)}. Use it by ${v.expires.en}.`)}</Notice>}
      {v.status === 'used' && <Notice>{tx(`${v.usedOn?.bn ?? ''} তারিখে ব্যবহার করা হয়েছে।`, `Used on ${v.usedOn?.en ?? ''}.`)}</Notice>}
      {v.status === 'expired' && <Notice tone="danger">{tx(`${v.expires.bn} তারিখে মেয়াদ শেষ হয়ে গেছে।`, `This voucher expired on ${v.expires.en}.`)}</Notice>}

      <div className="flex flex-wrap items-start gap-[18px]">
        <section
          aria-label={l(v.title)}
          className="relative flex min-w-0 flex-[3_1_340px] flex-col items-center gap-4 overflow-hidden rounded-hero p-6 text-center text-[#171717]"
          style={{ background: 'radial-gradient(120% 90% at 0% 0%, rgba(255,255,255,0.38), transparent 55%), linear-gradient(135deg, #b9de63 0%, #97C334 50%, #7ea526 100%)' }}
        >
          <span aria-hidden="true" className="absolute -right-10 -top-12 size-[150px] rounded-full bg-[#F5D900]" />
          <div className="relative">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] opacity-70">{tx('Reward ভাউচার', 'Reward voucher')}</p>
            <h1 className="mt-1 font-display text-[clamp(26px,4vw,34px)] font-extrabold leading-tight">{l(v.title)}</h1>
            <p className="mt-1 text-[15px] font-medium opacity-80">{l(v.source)}</p>
          </div>

          <div className="relative rounded-[24px] border-4 border-[#F5D900] bg-white p-3.5 shadow-[0_6px_0_rgba(0,0,0,0.15)]">
            <QRCodeSVG value={voucherQr(v)} size={196} fgColor="#171717" bgColor="#FFFFFF" level="M" title={tx('ভাউচার QR কোড', 'Voucher QR code')} />
            {!ready && (
              <span className="absolute inset-0 flex items-center justify-center rounded-[20px] bg-white/90">
                <span className="-rotate-[8deg] rounded-xl border-[3px] border-[#171717] px-4 py-1.5 font-display text-2xl font-extrabold uppercase">
                  {v.status === 'used' ? tx('নেওয়া হয়েছে', 'Redeemed') : tx('মেয়াদ শেষ', 'Expired')}
                </span>
              </span>
            )}
          </div>

          <div className="relative flex flex-wrap items-center justify-center gap-2.5">
            <span className="rounded-xl bg-white/75 px-3 py-2 font-mono text-[17px] font-bold tracking-[0.16em]">{v.code}</span>
            <button type="button" onClick={copy} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-[#171717] px-3.5 font-bold text-white">
              {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
              {copied ? tx('কপি হয়েছে', 'Copied') : tx('কোড কপি', 'Copy code')}
            </button>
          </div>
          <p className="relative text-[15px] font-bold">
            {ready ? tx('ক্যাশিয়ারকে এই QR দেখান', 'Show this QR to the cashier') : tx('এই ভাউচারটি আর ব্যবহার করা যাবে না', 'This voucher can no longer be used')}
          </p>
        </section>

        <div className="flex min-w-0 flex-[2_1_280px] flex-col gap-[18px]">
          {v.choices && (
            <Card>
              <CardTitle>{tx('কাউন্টারে একটি বেছে নিন', 'Choose one at the counter')}</CardTitle>
              <ul className="flex flex-wrap gap-2">
                {v.choices.map((c) => (
                  <li key={c.en} className="rounded-full bg-brand-soft px-3.5 py-1.5 font-bold text-brand-ink">{l(c)}</li>
                ))}
              </ul>
            </Card>
          )}
          <Card>
            <CardTitle>{tx('ব্যবহারের নিয়ম', 'How to use it')}</CardTitle>
            <ol className="flex flex-col gap-2.5">
              {[tx('যেকোনো আউটলেটে যান', 'Visit any ChaJoy outlet'), tx('ক্যাশিয়ারকে এই QR কোড দেখান', 'Show this QR code to the cashier'), tx('ক্যাশিয়ার স্ক্যান করলেই আপনার Reward পাবেন', 'They scan it and you get your reward')].map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-extrabold text-brand-on">{i + 1}</span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </Card>
          <Card>
            <CardTitle>{tx('শর্তাবলী', 'Terms')}</CardTitle>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted">{tx('পেয়েছেন', 'Earned')}</dt><dd className="text-right font-bold">{l(v.earned)}</dd>
              <dt className="text-muted">{tx('মেয়াদ', 'Valid until')}</dt><dd className="text-right font-bold">{l(v.expires)}</dd>
            </dl>
            <ul className="mt-3 list-disc space-y-1 border-t border-line pl-5 pt-3 text-sm text-muted">
              {terms.map((t) => <li key={t}>{t}</li>)}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
