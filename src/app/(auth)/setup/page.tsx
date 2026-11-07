'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Cake } from 'lucide-react';
import { Button, Field, Switch, inputClass } from '@/components/ui';
import { useI18n } from '@/lib/i18n';

export default function SetupPage() {
  const { tx } = useI18n();
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [offers, setOffers] = useState(true);

  return (
    <form
      className="mx-auto flex w-full max-w-[560px] flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return setError(tx('আপনার নাম লিখুন', 'Enter your name'));
        router.push('/cards');
      }}
    >
      <div className="flex flex-col gap-2">
        <div className="flex justify-between text-sm font-bold">
          <span>{tx('ধাপ ২/২', 'Step 2 of 2')}</span>
          <span className="text-muted">{tx('প্রায় শেষ!', 'Almost done')}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface2"><div className="h-2 w-full rounded-full bg-brand" /></div>
      </div>
      <div className="relative overflow-hidden rounded-[26px] bg-tangerine p-6 text-navy">
        <span aria-hidden="true" className="absolute -right-8 -top-8 size-[120px] rounded-full bg-rose" />
        <span aria-hidden="true" className="absolute -bottom-10 right-[70px] size-20 rounded-full bg-[#97C334]" />
        <h1 className="relative max-w-[70%] font-display text-[32px] font-extrabold leading-tight">{tx('স্বাগতম!', 'Welcome!')}</h1>
        <p className="relative mt-1.5 max-w-[70%] font-medium">{tx('আপনার নামটা বলুন, চা জয় যেন আপনাকে চিনতে পারে।', 'Tell us your name so ChaJoy can recognise you.')}</p>
      </div>
      <Field id="name" label={tx('আপনার নাম', 'Your name')} error={error}>
        <input id="name" autoComplete="name" placeholder={tx('তানভীর আহমেদ', 'Tanvir Ahmed')} value={name} onChange={(e) => { setName(e.target.value); setError(''); }} className={inputClass} />
      </Field>
      <Field
        id="bday"
        label={<>{tx('জন্মদিন', 'Birthday')} <span className="font-medium text-muted">{tx('(ঐচ্ছিক)', '(optional)')}</span></>}
        hint={<span className="flex items-start gap-1.5"><Cake size={18} className="mt-0.5 shrink-0" aria-hidden="true" />{tx('জন্মদিনে চা জয় বিশেষ Reward দিতে পারে', 'ChaJoy can send you a birthday reward')}</span>}
      >
        <input id="bday" type="date" className={inputClass} />
      </Field>
      <div className="flex items-center gap-4 rounded-[18px] border border-line bg-surface px-4 py-3.5">
        <div className="flex-1">
          <p className="font-bold">{tx('অফারের SMS পেতে চাই', 'Send me offers by SMS')}</p>
          <p className="text-[13px] text-muted">{tx('যেকোনো সময় বন্ধ করা যাবে', 'You can turn this off anytime')}</p>
        </div>
        <Switch checked={offers} onChange={setOffers} label={tx('অফারের SMS', 'Offer SMS')} />
      </div>
      <Button type="submit" size="lg">{tx('শুরু করুন', 'Get started')}</Button>
    </form>
  );
}
