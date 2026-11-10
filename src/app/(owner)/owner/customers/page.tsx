'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Download, Plus, Search, X } from 'lucide-react';
import { LoadError, Skeleton, linkButtonClass } from '@/components/owner-feedback';
import { OwnerHeader } from '@/components/owner-header';
import { Badge, Button, Card, Chip, Field, IconChip, Notice, inputClass, type Tone } from '@/components/ui';
import { adminCustomersExportHref, asciiDigits, useAdminCustomers, useCan, useDebouncedValue, useRefreshCustomers, type CustomerSort } from '@/lib/api/admin-customers';
import { toCustomer } from '@/lib/api/adapters';
import { api } from '@/lib/api/client';
import { useProgram } from '@/lib/api/program';
import type { AdminCustomerDto, CustomerSegment } from '@/lib/contracts/admin';
import type { CustomerStatus } from '@/lib/data';
import { normalizePhone } from '@/lib/domain/phone';
import { useI18n, type Text } from '@/lib/i18n';

const STATUS: Record<CustomerStatus, { bn: string; en: string; tone: Tone }> = {
  active: { bn: 'সক্রিয়', en: 'Active', tone: 'ok' },
  ready: { bn: 'Reward রেডি', en: 'Reward ready', tone: 'warn' },
  inactive: { bn: 'অনিয়মিত', en: 'Inactive', tone: 'danger' },
};
const PAGE_SIZE = 25;

export default function CustomersPage() {
  const { tx, l, n } = useI18n();
  const can = useCan();
  const shop = useProgram();
  const refreshCustomers = useRefreshCustomers();

  const [segment, setSegment] = useState<CustomerSegment>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<CustomerSort>('recent');

  // The search goes to the server once the typing pauses. The page number belongs to one combination of filters,
  // so changing a filter starts again from page 1 without an extra request for the old page.
  const q = useDebouncedValue(asciiDigits(query.trim()), 300);
  const filters = `${segment}|${q}|${sort}`;
  const [paging, setPaging] = useState({ filters, page: 1 });
  const page = paging.filters === filters ? paging.page : 1;
  const goTo = (next: number) => setPaging({ filters, page: next });

  const { list, error, loading, refreshing, reload } = useAdminCustomers({ segment, q, sort, page, pageSize: PAGE_SIZE });
  const total = list?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // If the list got shorter while this page was open (a filter, someone else's change), step back to the last page that exists.
  useEffect(() => {
    if (list && !error && page > lastPage) setPaging({ filters, page: lastPage });
  }, [list, error, page, lastPage, filters]);

  const rows = useMemo(() => {
    const now = Date.now();
    return (list?.items ?? []).map((r) => ({ r, c: toCustomer(r, now) }));
  }, [list]);

  const from = rows.length ? (page - 1) * PAGE_SIZE + 1 : 0;
  const to = rows.length ? from + rows.length - 1 : 0;
  const filtered = segment !== 'all' || q !== '';

  const segments: { id: CustomerSegment; label: string }[] = [
    { id: 'all', label: tx('সব', 'All') },
    { id: 'active', label: tx('সক্রিয়', 'Active') },
    { id: 'ready', label: tx('Reward রেডি', 'Reward ready') },
    { id: 'inactive', label: tx('৩০ দিনে আসেননি', 'Not seen in 30 days') },
  ];

  // Adding a customer. The dashboard's "Add customer" button links here with ?add=1.
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  /** What is wrong with what was typed (checked here), and what the server said when it refused the request. */
  const [formError, setFormError] = useState<Text | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState<{ id: string; name: string; welcome: boolean } | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('add')) setAdding(true);
  }, []);

  const closeForm = () => {
    setAdding(false);
    setFormError(null);
    setFailure(null);
  };

  const addCustomer = async () => {
    if (saving) return;
    const cleanName = name.replace(/\s+/g, ' ').trim();
    const e164 = normalizePhone(phone);
    if (cleanName.length < 2) return setFormError({ bn: 'গ্রাহকের নাম লিখুন (কমপক্ষে ২ অক্ষর)', en: 'Enter the customer’s name (at least 2 letters)' });
    if (!e164) return setFormError({ bn: 'সঠিক মোবাইল নম্বর দিন, যেমন ০১৭১২-৩৪৫৬৭৮', en: 'Enter a valid mobile number, like 01712-345678' });
    setSaving(true);
    setFormError(null);
    setFailure(null);
    try {
      const made = await api.post<AdminCustomerDto>('/api/admin/customers', { name: cleanName, phone: e164 });
      setAdded({ id: made.row.id, name: made.row.name ?? cleanName, welcome: made.program.welcome });
      setAdding(false);
      setName('');
      setPhone('');
      void refreshCustomers();
    } catch (e) {
      setFailure(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <OwnerHeader
        title={tx('গ্রাহক', 'Customers')}
        subtitle={tx('চা জয় · সব আউটলেট', 'ChaJoy · All outlets')}
        actions={
          <>
            {can('customers.export') && (
              <a href={adminCustomersExportHref({ segment, q })} download className={linkButtonClass}>
                <Download size={18} aria-hidden="true" />
                {tx('CSV এক্সপোর্ট', 'Export CSV')}
              </a>
            )}
            <Button size="sm" onClick={() => { setAdding(true); setAdded(null); }}><Plus size={18} strokeWidth={2.4} aria-hidden="true" />{tx('গ্রাহক যোগ করুন', 'Add customer')}</Button>
          </>
        }
      />
      {added && (
        <Notice>
          {added.welcome ? tx(`${added.name} যোগ হয়েছেন। ১টি স্বাগতম Stamp দেওয়া হয়েছে।`, `${added.name} added with 1 welcome stamp.`) : tx(`${added.name} যোগ হয়েছেন।`, `${added.name} added.`)}{' '}
          <Link href={`/owner/customers/${added.id}`} className="underline">{tx('দেখুন', 'View')}</Link>
        </Notice>
      )}
      {adding && (
        <Card className="flex flex-col gap-4 border-2 border-brand">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">{tx('নতুন গ্রাহক', 'New customer')}</h2>
            <button type="button" onClick={closeForm} disabled={saving} aria-label={tx('বাতিল', 'Cancel')} className="flex size-11 items-center justify-center rounded-full bg-surface2 disabled:opacity-50"><X size={20} aria-hidden="true" /></button>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); void addCustomer(); }} className="flex flex-col gap-4">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
              <Field id="nc-name" label={tx('নাম', 'Name')}><input id="nc-name" autoFocus autoComplete="off" maxLength={80} value={name} onChange={(e) => { setName(e.target.value); setFormError(null); setFailure(null); }} placeholder={tx('তানভীর আহমেদ', 'Tanvir Ahmed')} className={inputClass} /></Field>
              <Field id="nc-phone" label={tx('মোবাইল নম্বর', 'Mobile number')}><input id="nc-phone" type="tel" inputMode="numeric" autoComplete="off" value={phone} onChange={(e) => { setPhone(e.target.value); setFormError(null); setFailure(null); }} placeholder="01XXX-XXXXXX" className={inputClass} /></Field>
            </div>
            {formError && <p role="alert" className="text-[13px] font-semibold text-danger">{l(formError)}</p>}
            {failure != null && <LoadError error={failure} />}
            <div className="flex flex-wrap gap-2.5">
              <Button type="submit" disabled={saving}>
                {saving ? tx('যোগ হচ্ছে…', 'Adding…') : shop.program.welcome ? tx('যোগ করুন · ১টি স্বাগতম Stamp', 'Add · 1 welcome stamp') : tx('যোগ করুন', 'Add')}
              </Button>
              <Button type="button" variant="secondary" onClick={closeForm} disabled={saving}>{tx('বাতিল', 'Cancel')}</Button>
            </div>
          </form>
        </Card>
      )}
      <div className="flex flex-wrap gap-2">
        {segments.map((s) => <Chip key={s.id} active={segment === s.id} onClick={() => setSegment(s.id)} count={list ? n(list.counts[s.id]) : undefined}>{s.label}</Chip>)}
      </div>
      <div className="flex flex-wrap gap-2.5">
        <div className="relative flex-[999_1_280px]">
          <label htmlFor="q" className="sr-only">{tx('গ্রাহক খুঁজুন', 'Search customers')}</label>
          <Search size={20} className="absolute left-3.5 top-[15px] text-muted" aria-hidden="true" />
          <input id="q" type="search" maxLength={60} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tx('নাম বা মোবাইল নম্বর', 'Name or mobile number')} className={`${inputClass} pl-11`} />
        </div>
        <label htmlFor="sort" className="sr-only">{tx('সাজান', 'Sort')}</label>
        <select id="sort" value={sort} onChange={(e) => setSort(e.target.value as CustomerSort)} className={`${inputClass} w-auto flex-[1_1_180px]`}>
          <option value="recent">{tx('সাম্প্রতিক ভিজিট', 'Most recent visit')}</option>
          <option value="visits">{tx('সবচেয়ে বেশি ভিজিট', 'Most visits')}</option>
          <option value="name">{tx('নাম', 'Name')}</option>
        </select>
      </div>
      <section aria-label={tx('গ্রাহক তালিকা', 'Customer list')} aria-busy={loading || refreshing} className="rounded-card border border-line bg-surface px-3 py-2">
        {error ? (
          <LoadError error={error} onRetry={reload} className="my-2" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                  <tr className="text-left text-muted">
                    {[tx('গ্রাহক', 'Customer'), tx('কার্ড', 'Card'), tx('ভিজিট', 'Visits'), tx('শেষ ভিজিট', 'Last visit'), tx('অবস্থা', 'Status')].map((h) => <th key={h} className="border-b border-line px-2.5 py-3 font-semibold">{h}</th>)}
                    <th className="border-b border-line px-2.5 py-3"><span className="sr-only">{tx('বিস্তারিত', 'Details')}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {loading &&
                    Array.from({ length: 6 }, (_, i) => (
                      <tr key={i} aria-hidden="true">
                        <td className="border-b border-line px-2.5 py-3"><div className="flex items-center gap-2.5"><Skeleton className="size-[38px] shrink-0 rounded-[13px]" /><div className="flex flex-col gap-1.5"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-24" /></div></div></td>
                        <td className="border-b border-line px-2.5 py-3"><Skeleton className="h-4 w-28" /></td>
                        <td className="border-b border-line px-2.5 py-3"><Skeleton className="h-4 w-8" /></td>
                        <td className="border-b border-line px-2.5 py-3"><Skeleton className="h-4 w-20" /></td>
                        <td className="border-b border-line px-2.5 py-3"><Skeleton className="h-6 w-20 rounded-full" /></td>
                        <td className="border-b border-line px-2.5 py-3" />
                      </tr>
                    ))}
                  {rows.map(({ r, c }) => (
                    <tr key={c.id}>
                      <td className="border-b border-line px-2.5 py-3">
                        <div className="flex items-center gap-2.5">
                          <IconChip color={c.avatar} size={38} className="rounded-[13px]">{l(c.initial)}</IconChip>
                          <span><Link href={`/owner/customers/${c.id}`} className="block font-bold text-ink">{l(c.name)}</Link><span className="block text-[13px] text-muted">{c.phone}</span></span>
                        </div>
                      </td>
                      <td className="border-b border-line px-2.5 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="h-2 w-[90px] overflow-hidden rounded-full bg-surface2"><span className="block h-2 rounded-full bg-brand" style={{ width: `${Math.min(100, (c.stamps / Math.max(1, shop.total)) * 100)}%` }} /></span>
                          <span className="font-bold">{n(c.stamps)}/{n(shop.total)}</span>
                        </div>
                      </td>
                      <td className="border-b border-line px-2.5 py-3 font-semibold">{n(c.visits)}</td>
                      <td className="border-b border-line px-2.5 py-3 text-muted">{r.lastVisitAt ? l(c.last) : '—'}</td>
                      <td className="border-b border-line px-2.5 py-3"><Badge tone={STATUS[c.status].tone}>{tx(STATUS[c.status].bn, STATUS[c.status].en)}</Badge></td>
                      <td className="border-b border-line px-2.5 py-3 text-right">
                        <Link href={`/owner/customers/${c.id}`} aria-label={tx(`${l(c.name)}-এর বিস্তারিত`, `Open ${l(c.name)}`)} className="inline-flex size-10 items-center justify-center rounded-xl text-muted hover:bg-surface2"><ChevronRight size={20} aria-hidden="true" /></Link>
                      </td>
                    </tr>
                  ))}
                  {!loading && rows.length === 0 && (
                    <tr><td colSpan={6} className="px-2.5 py-10 text-center text-muted">{filtered ? tx('কোনো গ্রাহক পাওয়া যায়নি। অন্য নাম বা নম্বর দিয়ে খুঁজুন।', 'No customers match. Try another name or number.') : tx('এখনো কোনো গ্রাহক নেই।', 'No customers yet.')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2.5 px-2.5 pb-1.5 pt-3">
              <span className="text-sm text-muted" aria-live="polite">
                {loading ? ' ' : refreshing ? tx('হালনাগাদ হচ্ছে…', 'Updating…') : rows.length ? tx(`${n(from)}–${n(to)} দেখানো হচ্ছে, মোট ${n(total)} জন`, `Showing ${n(from)}–${n(to)} of ${n(total)}`) : tx('কোনো গ্রাহক নেই', 'No customers')}
              </span>
              <span className="flex gap-2">
                <Button variant="secondary" size="sm" disabled={page <= 1 || loading} onClick={() => goTo(page - 1)}>{tx('আগের', 'Previous')}</Button>
                <Button variant="secondary" size="sm" disabled={page >= lastPage || loading} onClick={() => goTo(page + 1)}>{tx('পরের', 'Next')}</Button>
              </span>
            </div>
          </>
        )}
      </section>
    </>
  );
}
