'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Download, Plus, Search, X } from 'lucide-react';
import { OwnerHeader } from '@/components/owner-header';
import { Badge, Button, Card, Chip, Field, IconChip, Notice, inputClass, type Tone } from '@/components/ui';
import { customerCounts, customers as sampleCustomers, type CustomerStatus } from '@/lib/data';
import { useI18n } from '@/lib/i18n';
import { useProgram, useStore } from '@/lib/store';

type Segment = 'all' | CustomerStatus;
const STATUS: Record<CustomerStatus, { bn: string; en: string; tone: Tone }> = {
  active: { bn: 'সক্রিয়', en: 'Active', tone: 'ok' },
  ready: { bn: 'Reward রেডি', en: 'Reward ready', tone: 'warn' },
  inactive: { bn: 'অনিয়মিত', en: 'Inactive', tone: 'danger' },
};
const MANAGEMENT = { bn: 'ম্যানেজমেন্ট', en: 'Management' };
const SAMPLE_READY = sampleCustomers.filter((c) => c.status === 'ready').length;

export default function CustomersPage() {
  const { tx, l, n } = useI18n();
  const store = useStore();
  const shop = useProgram();
  const [segment, setSegment] = useState<Segment>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'recent' | 'visits' | 'name'>('recent');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [added, setAdded] = useState('');

  // The dashboard's "Add customer" button links here with ?add=1.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('add')) setAdding(true);
  }, []);

  // A completed card is a ready voucher, so "Reward ready" follows the live vouchers rather than the sample status.
  const all = useMemo(
    () =>
      store.customers.map((c) => {
        const card = store.cards[c.id];
        const hasReady = card.vouchers.some((v) => v.status === 'ready');
        const status: CustomerStatus = hasReady ? 'ready' : c.status === 'ready' ? 'active' : c.status;
        const last = card.activity.length ? { bn: 'আজ', en: 'Today' } : c.last;
        return { c, card, status, last };
      }),
    [store.customers, store.cards],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = all
      .filter((r) => segment === 'all' || r.status === segment)
      .filter(({ c }) => !q || c.name.en.toLowerCase().includes(q) || c.name.bn.includes(q) || c.phone.replace(/\D/g, '').includes(q.replace(/\D/g, '') || '#'));
    if (sort === 'visits') return [...list].sort((a, b) => b.card.visits - a.card.visits);
    if (sort === 'name') return [...list].sort((a, b) => a.c.name.en.localeCompare(b.c.name.en));
    return list;
  }, [all, segment, query, sort]);

  const counts: Record<Segment, number> = {
    all: customerCounts.all + store.live.newCustomers,
    active: customerCounts.active,
    ready: customerCounts.ready + (all.filter((r) => r.status === 'ready').length - SAMPLE_READY),
    inactive: customerCounts.inactive,
  };

  const segments: { id: Segment; label: string }[] = [
    { id: 'all', label: tx('সব', 'All') },
    { id: 'active', label: tx('সক্রিয়', 'Active') },
    { id: 'ready', label: tx('Reward রেডি', 'Reward ready') },
    { id: 'inactive', label: tx('৩০ দিনে আসেননি', 'Not seen in 30 days') },
  ];

  const addCustomer = () => {
    const digits = phone.replace(/\D/g, '');
    if (name.trim().length < 2) return setError(tx('গ্রাহকের নাম লিখুন', 'Enter the customer’s name'));
    if (digits.length < 10) return setError(tx('পুরো মোবাইল নম্বর দিন', 'Enter the full mobile number'));
    const ten = digits.slice(-10);
    const customer = store.addCustomer(name, `+880 ${ten.slice(0, 4)}-${ten.slice(4)}`, MANAGEMENT);
    setAdded(customer.name.en);
    setAdding(false);
    setName('');
    setPhone('');
    setError('');
  };

  const exportCsv = () => {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const head = ['Name', 'Mobile', 'Stamps', 'Visits', 'Last visit', 'Status'];
    const lines = rows.map(({ c, card, status, last }) => [c.name.en, c.phone, `${card.stamps}/${shop.total}`, card.visits, last.en, STATUS[status].en].map(esc).join(','));
    const blob = new Blob(['﻿' + [head.map(esc).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chajoy-customers.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <OwnerHeader
        title={tx('গ্রাহক', 'Customers')}
        subtitle={tx('চা জয় · সব আউটলেট', 'ChaJoy · All outlets')}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={exportCsv}><Download size={18} aria-hidden="true" />{tx('CSV এক্সপোর্ট', 'Export CSV')}</Button>
            <Button size="sm" onClick={() => { setAdding(true); setAdded(''); }}><Plus size={18} strokeWidth={2.4} aria-hidden="true" />{tx('গ্রাহক যোগ করুন', 'Add customer')}</Button>
          </>
        }
      />
      {added && <Notice>{store.program.welcome ? tx(`${added} যোগ হয়েছেন। ১টি স্বাগতম Stamp দেওয়া হয়েছে।`, `${added} added with 1 welcome stamp.`) : tx(`${added} যোগ হয়েছেন।`, `${added} added.`)}</Notice>}
      {adding && (
        <Card className="flex flex-col gap-4 border-2 border-brand">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">{tx('নতুন গ্রাহক', 'New customer')}</h2>
            <button type="button" onClick={() => { setAdding(false); setError(''); }} aria-label={tx('বাতিল', 'Cancel')} className="flex size-11 items-center justify-center rounded-full bg-surface2"><X size={20} aria-hidden="true" /></button>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); addCustomer(); }} className="flex flex-col gap-4">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
              <Field id="nc-name" label={tx('নাম', 'Name')}><input id="nc-name" autoComplete="off" value={name} onChange={(e) => { setName(e.target.value); setError(''); }} placeholder={tx('তানভীর আহমেদ', 'Tanvir Ahmed')} className={inputClass} /></Field>
              <Field id="nc-phone" label={tx('মোবাইল নম্বর', 'Mobile number')}><input id="nc-phone" type="tel" inputMode="numeric" value={phone} onChange={(e) => { setPhone(e.target.value); setError(''); }} placeholder="01XXX-XXXXXX" className={inputClass} /></Field>
            </div>
            {error && <p role="alert" className="text-[13px] font-semibold text-danger">{error}</p>}
            <div className="flex flex-wrap gap-2.5">
              <Button type="submit">{store.program.welcome ? tx('যোগ করুন · ১টি স্বাগতম Stamp', 'Add · 1 welcome stamp') : tx('যোগ করুন', 'Add')}</Button>
              <Button type="button" variant="secondary" onClick={() => { setAdding(false); setError(''); }}>{tx('বাতিল', 'Cancel')}</Button>
            </div>
          </form>
        </Card>
      )}
      <div className="flex flex-wrap gap-2">
        {segments.map((s) => <Chip key={s.id} active={segment === s.id} onClick={() => setSegment(s.id)} count={n(counts[s.id])}>{s.label}</Chip>)}
      </div>
      <div className="flex flex-wrap gap-2.5">
        <div className="relative flex-[999_1_280px]">
          <label htmlFor="q" className="sr-only">{tx('গ্রাহক খুঁজুন', 'Search customers')}</label>
          <Search size={20} className="absolute left-3.5 top-[15px] text-muted" aria-hidden="true" />
          <input id="q" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tx('নাম বা মোবাইল নম্বর', 'Name or mobile number')} className={`${inputClass} pl-11`} />
        </div>
        <label htmlFor="sort" className="sr-only">{tx('সাজান', 'Sort')}</label>
        <select id="sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={`${inputClass} w-auto flex-[1_1_180px]`}>
          <option value="recent">{tx('সাম্প্রতিক ভিজিট', 'Most recent visit')}</option>
          <option value="visits">{tx('সবচেয়ে বেশি ভিজিট', 'Most visits')}</option>
          <option value="name">{tx('নাম', 'Name')}</option>
        </select>
      </div>
      <section aria-label={tx('গ্রাহক তালিকা', 'Customer list')} className="rounded-card border border-line bg-surface px-3 py-2">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-muted">
                {[tx('গ্রাহক', 'Customer'), tx('কার্ড', 'Card'), tx('ভিজিট', 'Visits'), tx('শেষ ভিজিট', 'Last visit'), tx('অবস্থা', 'Status')].map((h) => <th key={h} className="border-b border-line px-2.5 py-3 font-semibold">{h}</th>)}
                <th className="border-b border-line px-2.5 py-3"><span className="sr-only">{tx('বিস্তারিত', 'Details')}</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, card, status, last }) => (
                <tr key={c.id}>
                  <td className="border-b border-line px-2.5 py-3">
                    <div className="flex items-center gap-2.5">
                      <IconChip color={c.avatar} size={38} className="rounded-[13px]">{l(c.initial)}</IconChip>
                      <span><Link href={`/owner/customers/${c.id}`} className="block font-bold text-ink">{l(c.name)}</Link><span className="block text-[13px] text-muted">{c.phone}</span></span>
                    </div>
                  </td>
                  <td className="border-b border-line px-2.5 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="h-2 w-[90px] overflow-hidden rounded-full bg-surface2"><span className="block h-2 rounded-full bg-brand" style={{ width: `${(card.stamps / shop.total) * 100}%` }} /></span>
                      <span className="font-bold">{n(card.stamps)}/{n(shop.total)}</span>
                    </div>
                  </td>
                  <td className="border-b border-line px-2.5 py-3 font-semibold">{n(card.visits)}</td>
                  <td className="border-b border-line px-2.5 py-3 text-muted">{l(last)}</td>
                  <td className="border-b border-line px-2.5 py-3"><Badge tone={STATUS[status].tone}>{tx(STATUS[status].bn, STATUS[status].en)}</Badge></td>
                  <td className="border-b border-line px-2.5 py-3 text-right">
                    <Link href={`/owner/customers/${c.id}`} aria-label={tx(`${c.name.bn}-এর বিস্তারিত`, `Open ${c.name.en}`)} className="inline-flex size-10 items-center justify-center rounded-xl text-muted hover:bg-surface2"><ChevronRight size={20} aria-hidden="true" /></Link>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-2.5 py-10 text-center text-muted">{tx('কোনো গ্রাহক পাওয়া যায়নি। অন্য নাম বা নম্বর দিয়ে খুঁজুন।', 'No customers match. Try another name or number.')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2.5 px-2.5 pb-1.5 pt-3">
          <span className="text-sm text-muted">{tx(`${n(rows.length)} জন দেখানো হচ্ছে, মোট ${n(counts.all)}`, `Showing ${rows.length} of ${counts.all}`)}</span>
          <span className="flex gap-2"><Button variant="secondary" size="sm" disabled>{tx('আগের', 'Previous')}</Button><Button variant="secondary" size="sm">{tx('পরের', 'Next')}</Button></span>
        </div>
      </section>
    </>
  );
}
