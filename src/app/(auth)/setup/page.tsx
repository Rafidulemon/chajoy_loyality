'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Cake } from 'lucide-react';
import { Button, Field, Switch, inputClass } from '@/components/ui';
import { api } from '@/lib/api/client';
import { errorText } from '@/lib/api/messages';
import { useSession } from '@/lib/api/session';
import type { MeDto } from '@/lib/contracts/dto';
import { useI18n, type Text } from '@/lib/i18n';
import { mutate } from 'swr';

/**
 * The profile step after the first sign-in (CU-02), and the "edit profile" screen later: a name, an optional birthday and
 * whether offer SMS are allowed (BR-22: asked separately, off until the customer says yes).
 */
export default function SetupPage() {
  const { tx, l, lang } = useI18n();
  const router = useRouter();
  const { customer, loading } = useSession();
  const editing = !!customer?.profileComplete;
  const [name, setName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [offers, setOffers] = useState(true);
  const [error, setError] = useState<Text | null>(null);
  const [busy, setBusy] = useState(false);
  const [filled, setFilled] = useState(false);

  // When coming back to edit, start from what is saved.
  useEffect(() => {
    if (!customer || filled) return;
    setFilled(true);
    if (customer.profileComplete) {
      setName(customer.name ?? '');
      setBirthday(customer.birthday ?? '');
      setOffers(customer.smsConsent);
    }
  }, [customer, filled]);

  const save = async () => {
    const trimmed = name.replace(/\s+/g, ' ').trim();
    if (trimmed.length < 2) return setError({ bn: 'আপনার নাম লিখুন', en: 'Enter your name' });
    setBusy(true);
    setError(null);
    try {
      const me = await api.patch<MeDto>('/api/me', { name: trimmed, birthday: birthday || null, smsConsent: offers, language: lang });
      await mutate('/api/auth/session', { customer: me, staff: null }, { revalidate: true });
      await mutate('/api/me/wallet');
      router.push(editing ? '/profile' : '/cards');
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };

  return (
    <form
      className="mx-auto flex w-full max-w-[560px] flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {!editing && (
        <div className="flex flex-col gap-2">
          <div className="flex justify-between text-sm font-bold">
            <span>{tx('ধাপ ২/২', 'Step 2 of 2')}</span>
            <span className="text-muted">{tx('প্রায় শেষ!', 'Almost done')}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface2"><div className="h-2 w-full rounded-full bg-brand" /></div>
        </div>
      )}
      <div className="relative overflow-hidden rounded-[26px] bg-tangerine p-6 text-navy">
        <span aria-hidden="true" className="absolute -right-8 -top-8 size-[120px] rounded-full bg-rose" />
        <span aria-hidden="true" className="absolute -bottom-10 right-[70px] size-20 rounded-full bg-[#97C334]" />
        <h1 className="relative max-w-[70%] font-display text-[32px] font-extrabold leading-tight">{editing ? tx('আপনার তথ্য', 'Your details') : tx('স্বাগতম!', 'Welcome!')}</h1>
        <p className="relative mt-1.5 max-w-[70%] font-medium">{editing ? tx('নাম, জন্মদিন বা SMS-এর পছন্দ বদলান।', 'Change your name, birthday or SMS choice.') : tx('আপনার নামটা বলুন, চা জয় যেন আপনাকে চিনতে পারে।', 'Tell us your name so ChaJoy can recognise you.')}</p>
      </div>
      <Field id="name" label={tx('আপনার নাম', 'Your name')} error={error ? l(error) : undefined}>
        <input id="name" autoComplete="name" placeholder={tx('তানভীর আহমেদ', 'Tanvir Ahmed')} value={name} onChange={(e) => { setName(e.target.value); setError(null); }} className={inputClass} disabled={loading} />
      </Field>
      <Field
        id="bday"
        label={<>{tx('জন্মদিন', 'Birthday')} <span className="font-medium text-muted">{tx('(ঐচ্ছিক)', '(optional)')}</span></>}
        hint={<span className="flex items-start gap-1.5"><Cake size={18} className="mt-0.5 shrink-0" aria-hidden="true" />{tx('জন্মদিনে চা জয় বিশেষ Reward দিতে পারে', 'ChaJoy can send you a birthday reward')}</span>}
      >
        <input id="bday" type="date" value={birthday} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setBirthday(e.target.value)} className={inputClass} />
      </Field>
      <div className="flex items-center gap-4 rounded-[18px] border border-line bg-surface px-4 py-3.5">
        <div className="flex-1">
          <p className="font-bold">{tx('অফারের SMS পেতে চাই', 'Send me offers by SMS')}</p>
          <p className="text-[13px] text-muted">{tx('যেকোনো সময় বন্ধ করা যাবে', 'You can turn this off anytime')}</p>
        </div>
        <Switch checked={offers} onChange={setOffers} label={tx('অফারের SMS', 'Offer SMS')} />
      </div>
      <Button type="submit" size="lg" disabled={busy || loading}>{busy ? tx('সেভ হচ্ছে…', 'Saving…') : editing ? tx('সেভ করুন', 'Save') : tx('শুরু করুন', 'Get started')}</Button>
    </form>
  );
}
