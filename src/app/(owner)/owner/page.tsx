'use client';

import Link from 'next/link';
import { Plus, RefreshCw, Star, Tag, UserRound, Check } from 'lucide-react';
import { OwnerHeader } from '@/components/owner-header';
import { Badge, ButtonLink, Card, CardTitle, IconChip, type Tone } from '@/components/ui';
import { branches, customers, popularItems, weeklyVisits, type ActivityType } from '@/lib/data';
import { useI18n } from '@/lib/i18n';
import { useProgram, useStore } from '@/lib/store';

const ACTIVITY_TONE: Record<ActivityType, Tone> = { stamp: 'brand', reward: 'rose', join: 'ok' };

export default function DashboardPage() {
  const { tx, l, n } = useI18n();
  const store = useStore();
  const shop = useProgram();
  const { program } = shop;
  const { live } = store;
  const liveOffers = store.offers.filter((o) => o.status === 'live').length;
  const claims = store.offers.reduce((sum, o) => sum + o.claims, 0);
  const max = Math.max(...weeklyVisits.map((d) => d.value));
  const topItem = Math.max(...popularItems.map((i) => i.stamps));
  const kpis = [
    { label: tx('মোট গ্রাহক', 'Total customers'), value: n(312 + live.newCustomers), note: tx('+২৮ এই মাসে', '+28 this month'), bg: 'var(--brand-soft)', chip: '#97C334', chipFg: '#171717', Icon: UserRound },
    { label: tx('দেওয়া Stamp', 'Stamps given'), value: n(1248 + live.stamps + live.bonus - live.cancelled), note: tx('+১২% আগের ৩০ দিনের তুলনায়', '+12% vs previous 30 days'), bg: 'var(--tangerine-soft)', chip: '#F5D900', chipFg: '#171717', Icon: Check },
    { label: tx('রিডিম হওয়া Reward', 'Rewards redeemed'), value: n(41 + live.rewards), note: tx('বাবল টি ও আইসক্রিম মিলিয়ে', 'Bubble tea and ice cream combined'), bg: 'var(--rose-soft)', chip: '#FF5D73', chipFg: '#171717', Icon: Star },
    { label: tx('ফিরে আসার হার', 'Return rate'), value: `${n(46)}%`, note: tx('৩০ দিনে ২+ বার এসেছেন', 'Came back 2+ times in 30 days'), bg: 'var(--aqua-soft)', chip: '#2EC4B6', chipFg: '#08261E', Icon: RefreshCw },
  ];

  return (
    <>
      <OwnerHeader
        title={tx('স্বাগতম, চা জয়', 'Welcome, ChaJoy')}
        subtitle={tx(`সব ${n(branches.length)}টি আউটলেট · গত ৩০ দিনের সারসংক্ষেপ`, `All ${branches.length} outlets · Last 30 days`)}
        actions={<ButtonLink href="/owner/customers?add=1" size="sm"><Plus size={18} strokeWidth={2.4} aria-hidden="true" />{tx('গ্রাহক যোগ করুন', 'Add customer')}</ButtonLink>}
      />

      <section aria-label={tx('মূল পরিসংখ্যান', 'Key numbers')} className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
        {kpis.map(({ label, value, note, bg, chip, chipFg, Icon }) => (
          <div key={label} className="flex flex-col gap-1 rounded-card px-5 py-[18px]" style={{ background: bg }}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-muted">{label}</span>
              <span className="flex size-[34px] items-center justify-center rounded-[11px]" style={{ background: chip, color: chipFg }}><Icon size={17} strokeWidth={2.4} aria-hidden="true" /></span>
            </div>
            <span className="font-display text-4xl font-bold leading-tight">{value}</span>
            <span className="text-[13px] font-bold text-muted">{note}</span>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap gap-4">
        <Card className="min-w-0 flex-[999_1_440px]">
          <CardTitle>{tx('দৈনিক ভিজিট · এই সপ্তাহ', 'Daily visits · This week')}</CardTitle>
          <div className="mt-5 flex h-[220px] items-end gap-[clamp(6px,1.5vw,14px)] border-b border-line pb-1" role="img" aria-label={tx('এই সপ্তাহের দৈনিক ভিজিটের চার্ট', 'Chart of daily visits this week')}>
            {weeklyVisits.map((d, i) => (
              <div key={d.day.en} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                <span className="text-[13px] font-bold">{n(d.value)}</span>
                <div className="w-full max-w-14 rounded-t-xl rounded-b-sm" style={{ height: `${(d.value / max) * 170}px`, background: i === weeklyVisits.length - 1 ? '#FF5D73' : 'var(--brand)' }} />
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-[clamp(6px,1.5vw,14px)]">
            {weeklyVisits.map((d) => <span key={d.day.en} className="min-w-0 flex-1 text-center text-[13px] text-muted">{l(d.day)}</span>)}
          </div>
        </Card>

        <Card className="flex min-w-0 flex-[1_1_300px] flex-col gap-3.5">
          <div className="flex items-center justify-between gap-2"><h2 className="text-lg font-bold">{tx('চলমান প্রোগ্রাম', 'Active program')}</h2><Badge tone="solidAqua">{tx('চালু', 'Live')}</Badge></div>
          <div className="relative overflow-hidden rounded-[18px] p-4" style={{ background: shop.color, color: shop.fg }}>
            <span aria-hidden="true" className="absolute -right-8 -top-8 size-[100px] rounded-full" style={{ background: shop.deco1 }} />
            <p className="relative pr-12 font-display text-lg font-bold">{tx(`${n(shop.total)}টি Stamp = ${shop.reward.bn}`, `${shop.total} stamps = ${shop.reward.en}`)}</p>
            <div className="relative mt-3 grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(shop.total, 10)}, minmax(0, 1fr))` }}>
              {Array.from({ length: shop.total }, (_, i) => {
                const last = i === shop.total - 1;
                const filled = i < Math.ceil(shop.total / 2);
                return <span key={i} className={`aspect-square rounded-full ${last ? 'bg-white' : filled ? '' : 'border-2 border-dashed'}`} style={!last && filled ? { background: shop.stampBg } : !last ? { borderColor: shop.dash } : undefined} />;
              })}
            </div>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
            <dt className="text-muted">{tx('ন্যূনতম কেনাকাটা', 'Minimum purchase')}</dt><dd className="text-right font-bold">৳{n(program.minPurchase)}</dd>
            <dt className="text-muted">{tx('প্রতি দিনে', 'Per day')}</dt><dd className="text-right font-bold">{program.dailyLimit === 0 ? tx('সীমা নেই', 'No limit') : tx(`সর্বোচ্চ ${n(program.dailyLimit)}টি Stamp`, `Max ${program.dailyLimit} stamp${program.dailyLimit > 1 ? 's' : ''}`)}</dd>
            <dt className="text-muted">{tx('Stamp-এর মেয়াদ', 'Stamp expiry')}</dt><dd className="text-right font-bold">{program.expiryDays === 0 ? tx('কখনো না', 'Never') : tx(`${n(program.expiryDays)} দিন`, `${program.expiryDays} days`)}</dd>
            <dt className="text-muted">{tx('সক্রিয় কার্ড', 'Active cards')}</dt><dd className="text-right font-bold">{n(267)}</dd>
          </dl>
          <ButtonLink href="/owner/program" variant="secondary" size="sm" className="mt-auto">{tx('প্রোগ্রাম এডিট করুন', 'Edit program')}</ButtonLink>
        </Card>
      </div>

      <div className="flex flex-wrap gap-4">
        <Card className="min-w-0 flex-[999_1_440px]">
          <CardTitle action={<Link href="/owner/customers" className="text-sm font-bold">{tx('সব দেখুন', 'See all')}</Link>}>{tx('সাম্প্রতিক কার্যকলাপ', 'Recent activity')}</CardTitle>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-muted">
                  <th className="border-b border-line px-2 py-2.5 font-semibold">{tx('গ্রাহক', 'Customer')}</th>
                  <th className="border-b border-line px-2 py-2.5 font-semibold">{tx('কার্যকলাপ', 'Activity')}</th>
                  <th className="border-b border-line px-2 py-2.5 font-semibold">{tx('স্টাফ', 'Staff')}</th>
                  <th className="border-b border-line px-2 py-2.5 text-right font-semibold">{tx('সময়', 'Time')}</th>
                </tr>
              </thead>
              <tbody>
                {store.feed.slice(0, 8).map((a, i) => {
                  const c = store.customer(a.customerId);
                  if (!c) return null;
                  return (
                    <tr key={`${a.customerId}-${i}`}>
                      <td className="border-b border-line px-2 py-3">
                        <Link href={`/owner/customers/${c.id}`} className="flex items-center gap-2.5 text-ink">
                          <IconChip color={c.avatar} size={34} className="rounded-xl">{l(c.initial)}</IconChip>
                          <span><span className="block font-bold">{l(c.name)}</span><span className="block text-[13px] text-muted">{c.phone}</span></span>
                        </Link>
                      </td>
                      <td className="border-b border-line px-2 py-3"><Badge tone={ACTIVITY_TONE[a.type]}>{l(a.action)}</Badge></td>
                      <td className="border-b border-line px-2 py-3">{l(a.staff)}</td>
                      <td className="whitespace-nowrap border-b border-line px-2 py-3 text-right text-muted">{l(a.time)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <Card className="flex flex-col gap-3.5">
            <div><h2 className="text-lg font-bold">{tx('জনপ্রিয় আইটেম', 'Popular items')}</h2><p className="text-[13px] text-muted">{tx('কোন আইটেম কিনে সবচেয়ে বেশি Stamp এসেছে', 'Which purchases earned the most stamps')}</p></div>
            {popularItems.map((it) => (
              <div key={it.name.en} className="flex flex-col gap-1.5">
                <div className="flex justify-between gap-2 text-sm"><span className="font-bold">{l(it.name)}</span><span className="font-semibold text-muted">{tx(`${n(it.stamps)}টি Stamp`, `${n(it.stamps)} stamps`)}</span></div>
                <div className="h-3 overflow-hidden rounded-full bg-surface2"><div className="h-3 rounded-full" style={{ width: `${(it.stamps / topItem) * 100}%`, background: it.color }} /></div>
              </div>
            ))}
          </Card>
          <section aria-label={tx('SMS ব্যবহার', 'SMS usage')} className="flex flex-col gap-2.5 rounded-card bg-sky-soft p-5">
            <div className="flex items-baseline justify-between"><h2 className="text-lg font-bold">{tx('SMS ব্যবহার', 'SMS usage')}</h2><span className="font-extrabold text-info">{n(120)} / {n(200)}</span></div>
            <div className="h-3 overflow-hidden rounded-full bg-surface"><div className="h-3 w-[60%] rounded-full bg-sky" /></div>
            <p className="text-[13px] text-muted">{tx('এই মাসে ৮০টি SMS বাকি আছে', '80 SMS left this month')}</p>
          </section>
          <Card className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2"><h2 className="text-lg font-bold">{tx('অফার', 'Offers')}</h2><Link href="/owner/offers" className="text-sm font-bold">{tx('পরিচালনা', 'Manage')}</Link></div>
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-brand text-brand-on"><Tag size={22} aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{tx(`${n(liveOffers)}টি অফার চালু`, `${liveOffers} live offer${liveOffers === 1 ? '' : 's'}`)}</span>
                <span className="block text-[13px] text-muted">{tx(`এ পর্যন্ত ${n(claims)}টি নেওয়া হয়েছে`, `${claims} claimed so far`)}</span>
              </span>
            </div>
          </Card>
          <Card className="flex flex-col gap-3">
            <h2 className="text-lg font-bold">{tx('সেরা গ্রাহক', 'Top customers')}</h2>
            {customers.slice(0, 3).map((c, i) => (
              <Link key={c.id} href={`/owner/customers/${c.id}`} className="flex items-center gap-3 text-ink">
                <IconChip color={c.avatar} size={42}>{l(c.initial)}</IconChip>
                <span className="min-w-0 flex-1"><span className="block font-bold">{l(c.name)}</span><span className="block text-[13px] text-muted">{tx(`${n(c.visits)} ভিজিট`, `${c.visits} visits`)}</span></span>
                <span className="font-display text-xl font-extrabold text-muted">#{n(i + 1)}</span>
              </Link>
            ))}
          </Card>
        </div>
      </div>
    </>
  );
}
