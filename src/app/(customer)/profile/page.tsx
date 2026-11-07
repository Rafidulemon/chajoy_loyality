'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Bell, Cake, ChevronRight, Clock, FileText, Gift, Globe, HelpCircle, LogOut, Moon, Pencil, Phone, Send, Shield, Trash2 } from 'lucide-react';
import { Button, ButtonLink, Card, Segmented, Switch } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { useWallet } from '@/lib/wallet';

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
  const { tx, n, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  const [smsOffers, setSmsOffers] = useState(true);
  const [push, setPush] = useState(true);
  const [birthday, setBirthday] = useState(false);
  const { lifetime, earned, readyVouchers } = useWallet();
  const stats = [
    [lifetime, tx('Stamp', 'Stamps')],
    [earned, tx('Reward', 'Rewards')],
    [readyVouchers.length, tx('রেডি', 'Ready now')],
  ] as const;

  return (
    <div className="flex flex-wrap items-start gap-[18px]">
      <div className="flex min-w-0 flex-[2_1_300px] flex-col gap-3.5">
        <section className="relative flex flex-col gap-3.5 overflow-hidden rounded-[26px] bg-tangerine p-[22px] text-navy">
          <span aria-hidden="true" className="absolute -bottom-10 -right-8 size-[130px] rounded-full bg-rose" />
          <div className="relative flex items-center gap-3.5">
            <span className="flex size-16 shrink-0 items-center justify-center rounded-[22px] bg-[#97C334] font-display text-[26px] font-extrabold text-navy">{tx('তা', 'T')}</span>
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-2xl font-bold leading-tight">{tx('তানভীর আহমেদ', 'Tanvir Ahmed')}</h1>
              <p className="font-medium">+880 1712-345678</p>
            </div>
            <Link href="#" aria-label={tx('প্রোফাইল এডিট করুন', 'Edit profile')} className="flex size-11 items-center justify-center rounded-full bg-white text-navy"><Pencil size={18} aria-hidden="true" /></Link>
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
          <LinkRow icon={<Cake size={18} aria-hidden="true" />} color="#FF8FB1" label={tx('জন্মদিন', 'Birthday')} value={tx('১২ মার্চ', '12 March')} />
          <LinkRow icon={<Phone size={18} aria-hidden="true" />} color="#7FCBFF" label={tx('মোবাইল নম্বর', 'Mobile number')} value={tx('যাচাই করা', 'Verified')} />
          <LinkRow icon={<Clock size={18} aria-hidden="true" />} color="#97C334" label={tx('Stamp ও Reward-এর ইতিহাস', 'Stamp and reward history')} href="/history" />
        </Card>
      </div>

      <div className="flex min-w-0 flex-[3_1_340px] flex-col gap-3.5">
        <Card className="px-5 py-2">
          <h2 className="my-3 text-lg font-bold">{tx('পছন্দ', 'Preferences')}</h2>
          <Row icon={<Globe size={18} aria-hidden="true" />} color="#7FD8CE" label={tx('ভাষা', 'Language')}>
            <Segmented label={tx('ভাষা', 'Language')} value={lang} onChange={setLang} options={[{ value: 'bn', label: 'বাংলা' }, { value: 'en', label: 'English' }]} />
          </Row>
          <Row icon={<Moon size={18} aria-hidden="true" />} color="#F5D900" label={tx('থিম', 'Theme')}>
            <Segmented label={tx('থিম', 'Theme')} value={theme} onChange={setTheme} options={[{ value: 'light', label: tx('লাইট', 'Light') }, { value: 'dark', label: tx('ডার্ক', 'Dark') }]} />
          </Row>
        </Card>
        <Card className="px-5 py-2">
          <h2 className="my-3 text-lg font-bold">{tx('নোটিফিকেশন', 'Notifications')}</h2>
          <Row icon={<Send size={18} aria-hidden="true" />} color="#FF8A9A" label={tx('অফারের SMS', 'Offer SMS')} sub={tx('চা জয়-এর বিশেষ অফার', 'Special deals from ChaJoy')}>
            <Switch checked={smsOffers} onChange={setSmsOffers} label={tx('অফারের SMS', 'Offer SMS')} />
          </Row>
          <Row icon={<Bell size={18} aria-hidden="true" />} color="#8FE3D8" label={tx('Stamp ও Reward আপডেট', 'Stamp and reward updates')} sub={tx('প্রতিটি Stamp পেলে জানাবে', 'Get notified for every stamp')}>
            <Switch checked={push} onChange={setPush} label={tx('Stamp ও Reward আপডেট', 'Stamp and reward updates')} />
          </Row>
          <Row icon={<Gift size={18} aria-hidden="true" />} color="#FF8FB1" label={tx('জন্মদিনের Reward', 'Birthday rewards')} sub={tx('জন্মদিনে চা জয় উপহার পাঠাতে পারবে', 'Let ChaJoy send a birthday treat')}>
            <Switch checked={birthday} onChange={setBirthday} label={tx('জন্মদিনের Reward', 'Birthday rewards')} />
          </Row>
        </Card>
        <Card className="px-5 py-2">
          <h2 className="my-3 text-lg font-bold">{tx('সাহায্য', 'Help')}</h2>
          <LinkRow icon={<HelpCircle size={18} aria-hidden="true" />} color="#7FCBFF" label={tx('সাহায্য ও সাপোর্ট', 'Help and support')} />
          <LinkRow icon={<Shield size={18} aria-hidden="true" />} color="#8FE3D8" label={tx('প্রাইভেসি পলিসি', 'Privacy policy')} />
          <LinkRow icon={<FileText size={18} aria-hidden="true" />} color="#B8D4CF" label={tx('শর্তাবলী', 'Terms of service')} />
        </Card>
        <div className="flex flex-wrap gap-2.5">
          <ButtonLink href="/login" variant="secondary" className="flex-[1_1_160px]"><LogOut size={18} aria-hidden="true" />{tx('লগআউট', 'Log out')}</ButtonLink>
          <Button variant="danger" className="flex-[1_1_160px]"><Trash2 size={18} aria-hidden="true" />{tx('অ্যাকাউন্ট মুছুন', 'Delete account')}</Button>
        </div>
        <p className="text-center text-[13px] text-muted">{tx('chaJoy loyality · ভার্সন ১.০', 'chaJoy loyality · Version 1.0')}</p>
      </div>
    </div>
  );
}
