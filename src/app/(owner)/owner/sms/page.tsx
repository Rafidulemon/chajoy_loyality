'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Send } from 'lucide-react';
import { OwnerHeader } from '@/components/owner-header';
import { Badge, Button, Card, Chip, Notice, inputClass } from '@/components/ui';
import { campaigns } from '@/lib/data';
import { useI18n } from '@/lib/i18n';
import { useStore } from '@/lib/store';

type Audience = 'all' | 'inactive' | 'ready' | 'birthday';
const COUNTS: Record<Audience, number> = { all: 312, inactive: 45, ready: 18, birthday: 6 };
const BALANCE = 80;

/** Bangla (Unicode) SMS fit 70 characters, or 67 per part when split. English fits 160, or 153 per part. */
function smsParts(text: string) {
  const len = Array.from(text).length;
  const unicode = /[^\x00-\x7F]/.test(text);
  const per = unicode ? (len <= 70 ? 70 : 67) : len <= 160 ? 160 : 153;
  return { len, unicode, parts: Math.max(1, Math.ceil(len / per)) };
}

export default function SmsPage() {
  const { tx, l, n } = useI18n();
  const [audience, setAudience] = useState<Audience>('inactive');
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [message, setMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // The Offers screen links here with ?offer=<id> to draft a message about that offer.
  const store = useStore();
  const [offerId, setOfferId] = useState<string | null>(null);
  useEffect(() => {
    setOfferId(new URLSearchParams(window.location.search).get('offer'));
  }, []);
  const offer = offerId ? store.offers.find((o) => o.id === offerId) : undefined;
  const offerText = offer ? tx(`চা জয়: ${offer.title.bn} - ${offer.body.bn} অ্যাপে দেখুন: [লিংক]`, `ChaJoy: ${offer.title.en} - ${offer.body.en} See it in the app: [link]`) : null;
  const text = message ?? offerText ?? tx('চা জয়: এই শুক্রবার প্রতিটি বাবল টি-তে ডাবল Stamp! আপনার কার্ড দেখুন: [লিংক]', 'ChaJoy: Double stamps on every bubble tea this Friday! See your card: [link]');
  const { len, unicode, parts } = smsParts(text);
  const recipients = COUNTS[audience];
  const total = recipients * parts;
  const short = total > BALANCE;

  const audiences: { id: Audience; label: string }[] = [
    { id: 'all', label: tx('সব গ্রাহক', 'All customers') },
    { id: 'inactive', label: tx('৩০ দিনে আসেননি', 'Not seen in 30 days') },
    { id: 'ready', label: tx('Reward রেডি', 'Reward ready') },
    { id: 'birthday', label: tx('এই সপ্তাহে জন্মদিন', 'Birthday this week') },
  ];

  return (
    <>
      <OwnerHeader
        title={tx('SMS ক্যাম্পেইন', 'SMS campaigns')}
        subtitle={tx('অফার পাঠিয়ে গ্রাহককে ফিরিয়ে আনুন', 'Send offers that bring customers back')}
      />
      <div className="flex flex-wrap items-start gap-[18px]">
        <Card className="flex min-w-0 flex-[3_1_440px] flex-col gap-[18px]">
          <h2 className="text-lg font-bold">{tx('নতুন মেসেজ', 'New message')}</h2>
          <fieldset>
            <legend className="mb-2.5 text-sm font-bold">{tx('কাকে পাঠাবেন?', 'Who should get it?')}</legend>
            <div className="flex flex-wrap gap-2">
              {audiences.map((a) => <Chip key={a.id} active={audience === a.id} onClick={() => { setAudience(a.id); setSent(false); }} count={n(COUNTS[a.id])}>{a.label}</Chip>)}
            </div>
          </fieldset>
          <div className="flex flex-col gap-2">
            <label htmlFor="msg" className="text-sm font-bold">{tx('মেসেজ', 'Message')}</label>
            <textarea id="msg" rows={5} value={text} onChange={(e) => { setMessage(e.target.value); setSent(false); }} className={`${inputClass} h-auto resize-y py-3 leading-relaxed`} />
            <div className="flex flex-wrap justify-between gap-2 text-[13px] text-muted">
              <span>{tx(`${n(len)} অক্ষর · ${n(parts)}টি SMS`, `${len} characters · ${parts} SMS`)}</span>
              <span>{unicode ? tx('বাংলা SMS: ৭০ অক্ষরে ১টি SMS', 'Bangla SMS: 70 characters per SMS') : tx('ইংরেজি SMS: ১৬০ অক্ষরে ১টি SMS', 'English SMS: 160 characters per SMS')}</span>
            </div>
          </div>
          <fieldset>
            <legend className="mb-2.5 text-sm font-bold">{tx('কখন পাঠাবেন?', 'When?')}</legend>
            <div className="flex flex-wrap gap-2">
              <Chip active={when === 'now'} onClick={() => setWhen('now')}>{tx('এখনই', 'Now')}</Chip>
              <Chip active={when === 'later'} onClick={() => setWhen('later')}>{tx('শুক্রবার সকাল ১০টা', 'Friday 10 AM')}</Chip>
            </div>
          </fieldset>
          <div className="grid grid-cols-3 gap-2.5 rounded-[18px] bg-surface2 p-3.5 text-center">
            <div><p className="text-[22px] font-extrabold">{n(recipients)}</p><p className="text-xs text-muted">{tx('প্রাপক', 'Recipients')}</p></div>
            <div><p className="text-[22px] font-extrabold">{n(parts)}</p><p className="text-xs text-muted">{tx('জনপ্রতি SMS', 'SMS each')}</p></div>
            <div><p className={short ? 'text-[22px] font-extrabold text-danger' : 'text-[22px] font-extrabold'}>{n(total)}</p><p className="text-xs text-muted">{tx('মোট SMS', 'Total SMS')}</p></div>
          </div>
          {short && (
            <p role="alert" className="flex flex-wrap items-center gap-2 rounded-2xl bg-danger-soft px-3.5 py-3 text-sm font-bold text-danger">
              <AlertTriangle size={18} aria-hidden="true" />
              {tx(`ব্যালেন্সে ${n(BALANCE)}টি SMS আছে, দরকার ${n(total)}টি।`, `You have ${BALANCE} SMS but need ${total}.`)}
            </p>
          )}
          {sent && <Notice>{when === 'now' ? tx(`${n(recipients)} জনের কাছে পাঠানো হচ্ছে। ফলাফল এখানে দেখাবে।`, `Sending to ${recipients} people. Results will show here.`) : tx('শুক্রবার সকাল ১০টায় পাঠানো হবে।', 'Scheduled for Friday at 10 AM.')}</Notice>}
          <Button size="lg" disabled={short || !text.trim()} onClick={() => setSent(true)}>
            <Send size={18} aria-hidden="true" />
            {when === 'now' ? tx(`${n(recipients)} জনকে পাঠান`, `Send to ${recipients}`) : tx('শিডিউল করুন', 'Schedule')}
          </Button>
        </Card>

        <div className="flex min-w-0 flex-[2_1_300px] flex-col gap-[18px]">
          <Card className="flex flex-col gap-3">
            <h2 className="text-lg font-bold">{tx('গ্রাহকের ফোনে', 'On the customer’s phone')}</h2>
            <div className="flex flex-col gap-2 rounded-[22px] bg-surface2 p-4">
              <span className="text-[13px] font-extrabold text-muted">CHAJOY</span>
              <p className="whitespace-pre-wrap rounded-[4px_18px_18px_18px] bg-surface px-3.5 py-3 text-[15px] leading-relaxed">{text}</p>
            </div>
            <p className="text-[13px] text-muted">{tx('প্রেরকের জায়গায় CHAJOY নাম দেখাবে (মাস্কিং SMS)।', 'CHAJOY appears as the sender (masked SMS).')}</p>
          </Card>
          <section aria-label={tx('SMS ব্যালেন্স', 'SMS balance')} className="flex flex-col gap-2.5 rounded-card bg-sky-soft p-5">
            <div className="flex items-baseline justify-between"><h2 className="text-lg font-bold">{tx('SMS ব্যালেন্স', 'SMS balance')}</h2><span className="font-extrabold text-info">{n(BALANCE)} / {n(200)}</span></div>
            <div className="h-3 overflow-hidden rounded-full bg-surface"><div className="h-3 w-[40%] rounded-full bg-sky" /></div>
            <p className="text-[13px] text-muted">{tx('প্রতি মাসে ২০০ SMS বরাদ্দ। ১ ডিসেম্বর রিসেট হবে।', '200 SMS allotted each month. Resets on 1 December.')}</p>
          </section>
          <Card>
            <h2 className="mb-2 text-lg font-bold">{tx('আগের ক্যাম্পেইন', 'Past campaigns')}</h2>
            <ul>
              {campaigns.map((c) => (
                <li key={c.name.en} className="flex min-h-[60px] items-center gap-3 border-t border-line">
                  <span className="min-w-0 flex-1"><span className="block font-bold">{l(c.name)}</span><span className="block text-[13px] text-muted">{l(c.meta)}</span></span>
                  <Badge tone="ok">{l(c.result)}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
