'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Bell, Cake, ChevronRight, Clock, FileText, Globe, HelpCircle, LogOut, Moon, Pencil, Phone, Send, Shield, Trash2 } from 'lucide-react';
import { Button, Card, Notice, Segmented, Switch } from '@/components/ui';
import { api } from '@/lib/api/client';
import { errorText } from '@/lib/api/messages';
import { signOut } from '@/lib/api/session';
import type { MeDto } from '@/lib/contracts/dto';
import { formatPhone } from '@/lib/domain/phone';
import { day, initialOf } from '@/lib/format';
import { useI18n, type Lang, type Text } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { useWallet } from '@/lib/wallet';
import { mutate } from 'swr';

function Row({ icon, color, label, sub, children }: { icon: ReactNode; color: string; label: string; sub?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[60px] flex-wrap items-center gap-3 border-t border-line py-2">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl text-navy" style={{ background: color }}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{label}</span>
        {sub && <span className="block text-[13px] text-muted">{sub}</span>}
      </span>
      {children}
    </div>
  );
}

function LinkRow({ icon, color, label, value, href = '#' }: { icon: ReactNode; color: string; label: string; value?: string; href?: string }) {
  return (
    <Link href={href} className="flex min-h-[60px] items-center gap-3 border-t border-line">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl text-navy" style={{ background: color }}>{icon}</span>
      <span className="flex-1 font-semibold text-ink">{label}</span>
      {value && <span className="text-sm text-muted">{value}</span>}
      <ChevronRight size={20} className="text-muted" aria-hidden="true" />
    </Link>
  );
}

export default function ProfilePage() {
  const { tx, l, n, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  const { me, lifetime, earned, readyVouchers } = useWallet();
  const [problem, setProblem] = useState<Text | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const stats = [
    [lifetime, tx('Stamp', 'Stamps')],
    [earned, tx('Reward', 'Rewards')],
    [readyVouchers.length, tx('রেডি', 'Ready now')],
  ] as const;

  const name = me?.name ?? '';
  const initial = initialOf(name || null);
  const birthday = me?.birthday ? day(Date.parse(`${me.birthday}T06:00:00+06:00`)) : null;

  /** Saves a profile change and refreshes the wallet so every screen sees it. */
  const patch = async (body: Partial<Pick<MeDto, 'smsConsent' | 'language'>>) => {
    setProblem(null);
    try {
      await api.patch<MeDto>('/api/me', body);
      await Promise.all([mutate('/api/me/wallet'), mutate('/api/auth/session')]);
    } catch (e) {
      setProblem(errorText(e));
    }
  };

  const changeLang = (next: Lang) => {
    setLang(next);
    void patch({ language: next }); // the server uses it for the language of SMS
  };

  const eraseAccount = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await api.post('/api/me/delete', { confirm: true });
      window.location.assign('/login');
    } catch (e) {
      setProblem(errorText(e));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-start gap-[18px]">
      <div className="flex min-w-0 flex-[2_1_300px] flex-col gap-3.5">
        <section className="relative flex flex-col gap-3.5 overflow-hidden rounded-[26px] bg-tangerine p-[22px] text-navy">
          <span aria-hidden="true" className="absolute -bottom-10 -right-8 size-[130px] rounded-full bg-rose" />
          <div className="relative flex items-center gap-3.5">
            <span className="flex size-16 shrink-0 items-center justify-center rounded-[22px] bg-[#97C334] font-display text-[26px] font-extrabold text-navy">{l(initial)}</span>
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-2xl font-bold leading-tight">{name || tx('আপনার নাম', 'Your name')}</h1>
              <p className="font-medium">{me ? formatPhone(me.phone) : ''}</p>
            </div>
            <Link href="/setup" aria-label={tx('প্রোফাইল এডিট করুন', 'Edit profile')} className="flex size-11 items-center justify-center rounded-full bg-white text-navy"><Pencil size={18} aria-hidden="true" /></Link>
          </div>
          <div className="relative grid grid-cols-3 gap-2 text-center">
            {stats.map(([v, label]) => (
              <div key={label} className="rounded-[14px] bg-white/75 px-1 py-2.5">
                <p className="text-xl font-extrabold">{n(v)}</p>
                <p className="text-xs font-semibold">{label}</p>
              </div>
            ))}
          </div>
        </section>
        <Card className="px-5 py-2">
          <h2 className="my-3 text-lg font-bold">{tx('ব্যক্তিগত তথ্য', 'Personal info')}</h2>
          <LinkRow icon={<Cake size={18} aria-hidden="true" />} color="#FF8FB1" label={tx('জন্মদিন', 'Birthday')} value={birthday ? l(birthday) : tx('যোগ করুন', 'Add')} href="/setup" />
          <LinkRow icon={<Phone size={18} aria-hidden="true" />} color="#7FCBFF" label={tx('মোবাইল নম্বর', 'Mobile number')} value={tx('যাচাই করা', 'Verified')} />
          <LinkRow icon={<Clock size={18} aria-hidden="true" />} color="#97C334" label={tx('Stamp ও Reward-এর ইতিহাস', 'Stamp and reward history')} href="/history" />
        </Card>
      </div>

      <div className="flex min-w-0 flex-[3_1_340px] flex-col gap-3.5">
        {problem && <Notice tone="danger">{l(problem)}</Notice>}
        <Card className="px-5 py-2">
          <h2 className="my-3 text-lg font-bold">{tx('পছন্দ', 'Preferences')}</h2>
          <Row icon={<Globe size={18} aria-hidden="true" />} color="#7FD8CE" label={tx('ভাষা', 'Language')}>
            <Segmented label={tx('ভাষা', 'Language')} value={lang} onChange={changeLang} options={[{ value: 'bn', label: 'বাংলা' }, { value: 'en', label: 'English' }]} />
          </Row>
          <Row icon={<Moon size={18} aria-hidden="true" />} color="#F5D900" label={tx('থিম', 'Theme')}>
            <Segmented label={tx('থিম', 'Theme')} value={theme} onChange={setTheme} options={[{ value: 'light', label: tx('লাইট', 'Light') }, { value: 'dark', label: tx('ডার্ক', 'Dark') }]} />
          </Row>
        </Card>
        <Card className="px-5 py-2">
          <h2 className="my-3 text-lg font-bold">{tx('নোটিফিকেশন', 'Notifications')}</h2>
          <Row icon={<Send size={18} aria-hidden="true" />} color="#FF8A9A" label={tx('অফারের SMS', 'Offer SMS')} sub={tx('চা জয়-এর বিশেষ অফার', 'Special deals from ChaJoy')}>
            <Switch checked={me?.smsConsent ?? false} onChange={(v) => void patch({ smsConsent: v })} label={tx('অফারের SMS', 'Offer SMS')} />
          </Row>
          <Row icon={<Bell size={18} aria-hidden="true" />} color="#8FE3D8" label={tx('অ্যাপের নোটিফিকেশন', 'In-app notifications')} sub={tx('Stamp, Reward ও অফারের খবর নোটিফিকেশন পাতায় দেখা যায়', 'Stamp, reward and offer news appears on the Notifications page')}>
            <Link href="/notifications" className="font-bold text-ink underline underline-offset-4">{tx('দেখুন', 'Open')}</Link>
          </Row>
        </Card>
        <Card className="px-5 py-2">
          <h2 className="my-3 text-lg font-bold">{tx('সাহায্য', 'Help')}</h2>
          <LinkRow icon={<HelpCircle size={18} aria-hidden="true" />} color="#7FCBFF" label={tx('সাহায্য ও সাপোর্ট', 'Help and support')} />
          <LinkRow icon={<Shield size={18} aria-hidden="true" />} color="#8FE3D8" label={tx('প্রাইভেসি পলিসি', 'Privacy policy')} />
          <LinkRow icon={<FileText size={18} aria-hidden="true" />} color="#B8D4CF" label={tx('শর্তাবলী', 'Terms of service')} />
        </Card>
        <div className="flex flex-wrap gap-2.5">
          <Button variant="secondary" className="flex-[1_1_160px]" onClick={() => void signOut('customer')}><LogOut size={18} aria-hidden="true" />{tx('লগআউট', 'Log out')}</Button>
          <Button variant="danger" className="flex-[1_1_160px]" onClick={() => setConfirmDelete(true)}><Trash2 size={18} aria-hidden="true" />{tx('অ্যাকাউন্ট মুছুন', 'Delete account')}</Button>
        </div>
        {confirmDelete && (
          <Card className="flex flex-col gap-3 border-2 border-danger">
            <h2 className="text-lg font-bold">{tx('অ্যাকাউন্ট মুছে ফেলবেন?', 'Delete your account?')}</h2>
            <p className="text-sm text-muted">{tx('আপনার নাম, নম্বর ও জন্মদিন মুছে যাবে এবং জমানো Stamp ও Reward আর পাওয়া যাবে না। এটি ফেরানো যায় না।', 'Your name, number and birthday are erased, and your stamps and rewards can no longer be used. This cannot be undone.')}</p>
            <div className="flex flex-wrap gap-2.5">
              <Button variant="danger" onClick={() => void eraseAccount()} disabled={busy}>{busy ? tx('মোছা হচ্ছে…', 'Deleting…') : tx('হ্যাঁ, মুছে ফেলুন', 'Yes, delete it')}</Button>
              <Button variant="secondary" onClick={() => setConfirmDelete(false)} disabled={busy}>{tx('না, থাক', 'No, keep it')}</Button>
            </div>
          </Card>
        )}
        <p className="text-center text-[13px] text-muted">{tx('chaJoy loyality · ভার্সন ১.০', 'chaJoy loyality · Version 1.0')}</p>
      </div>
    </div>
  );
}
