'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Send } from 'lucide-react';
import { OwnerHeader } from '@/components/owner-header';
import { Badge, Button, Card, Chip, Field, Notice, inputClass, type Tone } from '@/components/ui';
import { ADMIN_KEYS, ALERT_CLASS, dhakaInputNow, dhakaInputToIso, useAdminOffers, useSmsOverview } from '@/lib/api/admin-config';
import { api } from '@/lib/api/client';
import { errorText } from '@/lib/api/messages';
import type { SmsAudienceDto, SmsCampaignDto } from '@/lib/contracts/admin';
import type { SmsCampaignCreate } from '@/lib/contracts/schemas';
import { smsInfo } from '@/lib/domain/sms';
import { clock, day } from '@/lib/format';
import { useI18n, type Text } from '@/lib/i18n';
import { cn } from '@/lib/cn';

const t = (bn: string, en: string): Text => ({ bn, en });

const AUDIENCES: { id: SmsAudienceDto; label: Text }[] = [
  { id: 'all', label: t('সব গ্রাহক', 'All customers') },
  { id: 'lapsed', label: t('৩০ দিনে আসেননি', 'Not seen in 30 days') },
  { id: 'reward-ready', label: t('Reward রেডি', 'Reward ready') },
  { id: 'birthday-week', label: t('এই সপ্তাহে জন্মদিন', 'Birthday this week') },
];

/** The first request may leave messages queued on the server. Ask it to carry on, at most this many times and this far apart. */
const MAX_STEPS = 30;
const STEP_MS = 800;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** How a past campaign is labelled. A campaign that was sent shows how many customers came back instead. */
const STATUS: Record<Exclude<SmsCampaignDto['status'], 'sent'>, { label: Text; tone: Tone }> = {
  draft: { label: t('খসড়া', 'Draft'), tone: 'info' },
  scheduled: { label: t('শিডিউল করা', 'Scheduled'), tone: 'info' },
  sending: { label: t('পাঠানো হচ্ছে', 'Sending'), tone: 'warn' },
  failed: { label: t('ব্যর্থ', 'Failed'), tone: 'danger' },
};

/** What the owner is told after pressing Send. */
type Outcome =
  | { kind: 'sending'; done: number; total: number }
  | { kind: 'sent'; sent: number; failed: number }
  | { kind: 'failed'; failed: number }
  | { kind: 'partial'; done: number; total: number }
  | { kind: 'scheduled'; at: number };

function outcomeOf(c: SmsCampaignDto): Outcome {
  if (c.status === 'sent') return { kind: 'sent', sent: c.sent, failed: c.failed };
  if (c.status === 'failed') return { kind: 'failed', failed: c.failed || c.recipients };
  return { kind: 'partial', done: c.sent + c.failed, total: c.recipients };
}

function CampaignItem({ c }: { c: SmsCampaignDto }) {
  const { tx, l, n } = useI18n();
  const at = Date.parse(c.status === 'scheduled' && c.scheduledAt ? c.scheduledAt : (c.sentAt ?? c.createdAt));
  const when = c.status === 'scheduled' ? `${l(day(at))} ${l(clock(at))}` : l(day(at));
  const people = tx(`${n(c.recipients)} জন`, `${n(c.recipients)} ${c.recipients === 1 ? 'person' : 'people'}`);
  return (
    <li className="flex min-h-[60px] items-center gap-3 border-t border-line py-2">
      <span className="min-w-0 flex-1">
        <span className="block break-words font-bold">{c.name}</span>
        <span className="block text-[13px] text-muted">
          {when} · {people}
          {c.failed > 0 && ` · ${tx(`${n(c.failed)}টি ব্যর্থ`, `${n(c.failed)} failed`)}`}
        </span>
      </span>
      {c.status === 'sent' ? (
        <Badge tone="ok" wrap>{tx(`${n(c.cameBack)} জন এসেছেন`, `${n(c.cameBack)} came back`)}</Badge>
      ) : (
        <Badge tone={STATUS[c.status].tone} wrap>{l(STATUS[c.status].label)}</Badge>
      )}
    </li>
  );
}

export default function SmsPage() {
  const { tx, l, n } = useI18n();
  const { data: overview, error, mutate } = useSmsOverview();
  const [audience, setAudience] = useState<SmsAudienceDto>('lapsed');
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [at, setAt] = useState('');
  /** Null until the owner types, so the message follows the offer it was drafted from. */
  const [message, setMessage] = useState<string | null>(null);
  const [campaignName, setCampaignName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Text | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  // Stop waiting for a send in progress when the owner leaves the page. The server carries on by itself.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // The Offers screen links here with ?offer=<id> to draft a message about that offer.
  const [offerId, setOfferId] = useState<string | null>(null);
  useEffect(() => {
    setOfferId(new URLSearchParams(window.location.search).get('offer'));
  }, []);
  const { rows: offers } = useAdminOffers(!!offerId);
  const offer = offerId ? offers.find((o) => o.id === offerId) : undefined;
  const offerText = offer ? tx(`চা জয়: ${offer.title.bn} - ${offer.body.bn} অ্যাপে দেখুন।`, `ChaJoy: ${offer.title.en} - ${offer.body.en} See it in the app.`) : null;

  const text = message ?? offerText ?? '';
  // The server counts the trimmed message, so the numbers here are worked out from the same text.
  const body = text.trim();
  const info = smsInfo(body);
  const recipients = overview?.audiences[audience] ?? 0;
  const needed = recipients * info.parts;
  const balance = overview?.balance ?? 0;
  const short = !!overview && needed > balance;
  const defaultName = offer ? l(offer.title) : tx(`ক্যাম্পেইন ${l(day(Date.now()))}`, `Campaign ${l(day(Date.now()))}`);
  /** How much of this month's SMS (what is left plus what was used) is still left, for the bar. */
  const leftShare = overview && overview.balance + overview.usedThisMonth > 0 ? Math.round((overview.balance / (overview.balance + overview.usedThisMonth)) * 100) : 0;

  const send = async () => {
    if (busy || !overview) return;
    let scheduledAt: string | undefined;
    if (when === 'later') {
      const iso = dhakaInputToIso(at);
      if (!iso) return setProblem(t('কখন পাঠাবেন তার তারিখ ও সময় বেছে নিন', 'Pick the date and time to send'));
      if (Date.parse(iso) <= Date.now()) return setProblem(t('ভবিষ্যতের একটি সময় বেছে নিন, অথবা এখনই পাঠান', 'Pick a time in the future, or send now'));
      scheduledAt = iso;
    }
    const request: SmsCampaignCreate = {
      name: ((campaignName ?? defaultName).trim() || defaultName).slice(0, 80),
      audience,
      message: body,
      ...(scheduledAt ? { scheduledAt } : {}),
      ...(offer ? { offerId: offer.id } : {}),
    };

    setBusy(true);
    setProblem(null);
    setOutcome(null);
    let created: SmsCampaignDto | null = null;
    try {
      let campaign = await api.post<SmsCampaignDto>(ADMIN_KEYS.smsCampaigns, request);
      created = campaign;
      void mutate();
      if (campaign.status === 'scheduled') {
        setOutcome({ kind: 'scheduled', at: Date.parse(campaign.scheduledAt ?? scheduledAt ?? '') });
        return;
      }
      // The server sends in batches. While it says "sending", ask it to carry on until it is done.
      for (let step = 0; campaign.status === 'sending' && step < MAX_STEPS; step++) {
        setOutcome({ kind: 'sending', done: campaign.sent + campaign.failed, total: campaign.recipients });
        await sleep(STEP_MS);
        if (!alive.current) return;
        campaign = await api.post<SmsCampaignDto>(ADMIN_KEYS.smsSend(campaign.id));
      }
      setOutcome(outcomeOf(campaign));
    } catch (e) {
      const why = errorText(e);
      setOutcome(null);
      // Once the campaign exists it keeps its place in Past campaigns, whatever went wrong while waiting for it.
      setProblem(created ? t(`${why.bn} ক্যাম্পেইনটি তৈরি হয়েছে: কতদূর গেল তা “আগের ক্যাম্পেইন”-এ দেখুন।`, `${why.en} The campaign was created: see Past campaigns for how far it got.`) : why);
    } finally {
      void mutate();
      if (alive.current) setBusy(false);
    }
  };

  const sendDisabled = busy || !overview || !body || recipients === 0 || short;

  return (
    <>
      <OwnerHeader
        title={tx('SMS ক্যাম্পেইন', 'SMS campaigns')}
        subtitle={tx('অফার পাঠিয়ে গ্রাহককে ফিরিয়ে আনুন', 'Send offers that bring customers back')}
      />
      {error && !overview && (
        <div role="alert" className={cn(ALERT_CLASS, 'flex flex-wrap items-center gap-3')}>
          <p className="flex-[1_1_240px]">{l(errorText(error))}</p>
          <Button variant="secondary" size="sm" onClick={() => void mutate()}>{tx('আবার চেষ্টা করুন', 'Try again')}</Button>
        </div>
      )}
      <div className="flex flex-wrap items-start gap-[18px]">
        <Card className="flex min-w-0 flex-[3_1_440px] flex-col gap-[18px]">
          <h2 className="text-lg font-bold">{tx('নতুন মেসেজ', 'New message')}</h2>
          <fieldset disabled={busy} className="m-0 flex min-w-0 flex-col gap-[18px] border-0 p-0 [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-60">
            <fieldset className="min-w-0">
              <legend className="mb-2.5 text-sm font-bold">{tx('কাকে পাঠাবেন?', 'Who should get it?')}</legend>
              <div className="flex flex-wrap gap-2">
                {AUDIENCES.map((a) => (
                  <Chip key={a.id} active={audience === a.id} onClick={() => { setAudience(a.id); setOutcome(null); setProblem(null); }} count={overview ? n(overview.audiences[a.id]) : undefined}>{l(a.label)}</Chip>
                ))}
              </div>
              <p className="mt-2 text-[13px] text-muted">{tx('শুধু যারা অফার SMS পেতে রাজি হয়েছেন, তাঁদের গোনা হয়।', 'Only customers who agreed to receive offer SMS are counted.')}</p>
            </fieldset>
            <Field id="cname" label={tx('ক্যাম্পেইনের নাম', 'Campaign name')} hint={tx('শুধু আপনার তালিকার জন্য, গ্রাহক দেখবেন না', 'For your own list only, customers never see it')}>
              <input id="cname" maxLength={80} value={campaignName ?? defaultName} onChange={(e) => { setCampaignName(e.target.value); setProblem(null); }} className={inputClass} />
            </Field>
            <div className="flex flex-col gap-2">
              <label htmlFor="msg" className="text-sm font-bold">{tx('মেসেজ', 'Message')}</label>
              <textarea
                id="msg"
                rows={5}
                maxLength={640}
                value={text}
                placeholder={tx('যেমন: চা জয়: এই শুক্রবার ডাবল Stamp! অ্যাপে দেখুন।', 'e.g. ChaJoy: Double stamps this Friday! See it in the app.')}
                onChange={(e) => { setMessage(e.target.value); setOutcome(null); setProblem(null); }}
                className={`${inputClass} h-auto resize-y py-3 leading-relaxed`}
              />
              <div className="flex flex-wrap justify-between gap-2 text-[13px] text-muted">
                <span>{tx(`${n(info.length)} অক্ষর · ${n(info.parts)}টি SMS`, `${n(info.length)} characters · ${n(info.parts)} SMS`)}</span>
                <span>
                  {info.unicode
                    ? tx(`বাংলা SMS: ${n(info.single)} অক্ষরে ১টি SMS, লম্বা হলে প্রতিটিতে ${n(info.perPart)}`, `Bangla SMS: ${info.single} characters in one SMS, ${info.perPart} each when split`)
                    : tx(`ইংরেজি SMS: ${n(info.single)} অক্ষরে ১টি SMS, লম্বা হলে প্রতিটিতে ${n(info.perPart)}`, `English SMS: ${info.single} characters in one SMS, ${info.perPart} each when split`)}
                </span>
              </div>
            </div>
            <fieldset className="min-w-0">
              <legend className="mb-2.5 text-sm font-bold">{tx('কখন পাঠাবেন?', 'When?')}</legend>
              <div className="flex flex-wrap gap-2">
                <Chip active={when === 'now'} onClick={() => { setWhen('now'); setProblem(null); }}>{tx('এখনই', 'Now')}</Chip>
                <Chip active={when === 'later'} onClick={() => { setWhen('later'); setProblem(null); }}>{tx('সময় ঠিক করুন', 'Schedule')}</Chip>
              </div>
              {when === 'later' && (
                <div className="mt-3 max-w-[280px]">
                  <Field id="sat" label={tx('তারিখ ও সময়', 'Date and time')} hint={tx('বাংলাদেশ সময়', 'Bangladesh time')}>
                    <input id="sat" type="datetime-local" min={dhakaInputNow()} value={at} onChange={(e) => { setAt(e.target.value); setProblem(null); }} className={inputClass} />
                  </Field>
                </div>
              )}
            </fieldset>
          </fieldset>
          <div className="grid grid-cols-3 gap-2.5 rounded-[18px] bg-surface2 p-3.5 text-center">
            <div><p className="text-[22px] font-extrabold">{overview ? n(recipients) : '—'}</p><p className="text-xs text-muted">{tx('প্রাপক', 'Recipients')}</p></div>
            <div><p className="text-[22px] font-extrabold">{info.parts ? n(info.parts) : '—'}</p><p className="text-xs text-muted">{tx('জনপ্রতি SMS', 'SMS each')}</p></div>
            <div><p className={cn('text-[22px] font-extrabold', short && 'text-danger')}>{overview && info.parts ? n(needed) : '—'}</p><p className="text-xs text-muted">{tx('মোট SMS', 'Total SMS')}</p></div>
          </div>
          {short && (
            <p role="alert" className="flex flex-wrap items-center gap-2 rounded-2xl bg-danger-soft px-3.5 py-3 text-sm font-bold text-danger">
              <AlertTriangle size={18} aria-hidden="true" />
              {tx(`ব্যালেন্সে ${n(balance)}টি SMS আছে, দরকার ${n(needed)}টি।`, `You have ${n(balance)} SMS but need ${n(needed)}.`)}
            </p>
          )}
          {overview && recipients === 0 && (
            <p role="status" className="rounded-2xl bg-surface2 px-3.5 py-3 text-sm font-semibold text-muted">{tx('এই গ্রুপে কেউ অফার SMS পেতে রাজি নেই।', 'Nobody in this group has agreed to receive offer SMS.')}</p>
          )}
          {problem && <p role="alert" className={ALERT_CLASS}>{l(problem)}</p>}
          {outcome?.kind === 'sending' && <Notice>{tx(`পাঠানো হচ্ছে… ${n(outcome.done)} / ${n(outcome.total)}`, `Sending… ${n(outcome.done)} of ${n(outcome.total)}`)}</Notice>}
          {outcome?.kind === 'sent' && (
            <Notice>
              {tx(
                `${n(outcome.sent)} জনকে পাঠানো হয়েছে${outcome.failed > 0 ? `, ${n(outcome.failed)} জনের ব্যর্থ হয়েছে` : ''}।`,
                `Sent to ${n(outcome.sent)} ${outcome.sent === 1 ? 'person' : 'people'}${outcome.failed > 0 ? `, ${n(outcome.failed)} failed` : ''}.`,
              )}
            </Notice>
          )}
          {outcome?.kind === 'failed' && <p role="alert" className={ALERT_CLASS}>{tx(`কোনো মেসেজ পাঠানো যায়নি (${n(outcome.failed)}টি ব্যর্থ)। একটু পরে আবার চেষ্টা করুন।`, `No message could be sent (${n(outcome.failed)} failed). Please try again in a while.`)}</p>}
          {outcome?.kind === 'partial' && (
            <Notice tone="warn">{tx(`এখনো পাঠানো চলছে: এ পর্যন্ত ${n(outcome.done)} / ${n(outcome.total)}। ফল “আগের ক্যাম্পেইন”-এ দেখাবে।`, `Still sending in the background: ${n(outcome.done)} of ${n(outcome.total)} so far. The result will show under Past campaigns.`)}</Notice>
          )}
          {outcome?.kind === 'scheduled' && (
            <Notice>{tx(`${l(day(outcome.at))} ${l(clock(outcome.at))} সময়ে পাঠানো হবে।`, `Scheduled for ${l(day(outcome.at))} at ${l(clock(outcome.at))}.`)}</Notice>
          )}
          <Button size="lg" disabled={sendDisabled} onClick={() => void send()}>
            <Send size={18} aria-hidden="true" />
            {busy
              ? when === 'now' ? tx('পাঠানো হচ্ছে…', 'Sending…') : tx('শিডিউল হচ্ছে…', 'Scheduling…')
              : when === 'now' ? tx(`${n(recipients)} জনকে পাঠান`, `Send to ${n(recipients)}`) : tx('শিডিউল করুন', 'Schedule')}
          </Button>
        </Card>

        <div className="flex min-w-0 flex-[2_1_300px] flex-col gap-[18px]">
          <Card className="flex flex-col gap-3">
            <h2 className="text-lg font-bold">{tx('গ্রাহকের ফোনে', 'On the customer’s phone')}</h2>
            <div className="flex flex-col gap-2 rounded-[22px] bg-surface2 p-4">
              <span className="text-[13px] font-extrabold text-muted">CHAJOY</span>
              <p className="whitespace-pre-wrap break-words rounded-[4px_18px_18px_18px] bg-surface px-3.5 py-3 text-[15px] leading-relaxed">{body || <span className="text-muted">{tx('আপনার মেসেজ এখানে দেখাবে', 'Your message shows here')}</span>}</p>
            </div>
            <p className="text-[13px] text-muted">{tx('প্রেরকের জায়গায় CHAJOY নাম দেখাবে (মাস্কিং SMS)।', 'CHAJOY appears as the sender (masked SMS).')}</p>
          </Card>
          <section aria-label={tx('SMS ব্যালেন্স', 'SMS balance')} className="flex flex-col gap-2.5 rounded-card bg-sky-soft p-5">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-lg font-bold">{tx('SMS ব্যালেন্স', 'SMS balance')}</h2>
              <span className="font-extrabold text-info">{overview ? tx(`${n(overview.balance)}টি`, `${n(overview.balance)} SMS`) : '—'}</span>
            </div>
            <div aria-hidden="true" className="h-3 overflow-hidden rounded-full bg-surface"><div className="h-3 rounded-full bg-sky" style={{ width: `${leftShare}%` }} /></div>
            {overview && <p className="text-[13px] text-muted">{tx(`এই মাসে ${n(overview.usedThisMonth)}টি SMS খরচ হয়েছে।`, `${n(overview.usedThisMonth)} SMS used this month.`)}</p>}
            <p className="text-[13px] text-muted">{tx('প্রতিটি প্রাপকের জন্য মেসেজের প্রতি অংশে ১টি SMS লাগে। বাংলা অক্ষর থাকলে এক অংশে ৭০ অক্ষর, ইংরেজিতে ১৬০।', 'Each recipient uses 1 SMS for every part of the message. With Bangla letters a part is 70 characters, in English 160.')}</p>
          </section>
          <Card>
            <h2 className="mb-2 text-lg font-bold">{tx('আগের ক্যাম্পেইন', 'Past campaigns')}</h2>
            {!overview ? (
              <p role="status" className="border-t border-line py-4 text-center text-muted">{error ? tx('ক্যাম্পেইন লোড করা যায়নি।', 'Campaigns could not be loaded.') : tx('লোড হচ্ছে…', 'Loading…')}</p>
            ) : overview.campaigns.length === 0 ? (
              <p className="border-t border-line py-4 text-center text-muted">{tx('এখনো কোনো ক্যাম্পেইন পাঠানো হয়নি।', 'No campaigns yet.')}</p>
            ) : (
              <ul>
                {overview.campaigns.map((c) => <CampaignItem key={c.id} c={c} />)}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
