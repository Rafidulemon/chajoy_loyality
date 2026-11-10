'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { Button, Field, Notice, inputClass } from './ui';
import { api, isApiError } from '@/lib/api/client';
import { errorText } from '@/lib/api/messages';
import { isWeakPin } from '@/lib/domain/pin';
import { useI18n, type Text } from '@/lib/i18n';

const t = (bn: string, en: string): Text => ({ bn, en });
const six = (v: string) => v.replace(/\D/g, '').slice(0, 6);

const PIN_SIX = t('PIN হলো ৬টি সংখ্যা', 'The PIN is 6 digits');
const pinClass = `${inputClass} h-14 text-center font-mono text-2xl tracking-[0.4em]`;

type Problem = { field: 'current' | 'next' | 'again' | 'form'; text: Text };

/**
 * "Change my PIN" for any staff member: cashier, manager or owner. The owner hands out a first PIN and it should not stay, so this
 * asks for the current PIN and then a new one twice. The server signs the person out on every other device.
 */
export function ChangePinForm({ onDone }: { onDone?: () => void }) {
  const { tx, l } = useI18n();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);
  const [changed, setChanged] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!/^\d{6}$/.test(current)) return setProblem({ field: 'current', text: PIN_SIX });
    if (!/^\d{6}$/.test(next)) return setProblem({ field: 'next', text: PIN_SIX });
    if (isWeakPin(next)) return setProblem({ field: 'next', text: t('এই PIN সহজে অনুমান করা যায়। অন্য একটি বেছে নিন (১২৩৪৫৬ বা ০০০০০০ নয়)।', 'That PIN is easy to guess. Choose another one (not 123456 or 000000).') });
    if (next === current) return setProblem({ field: 'next', text: t('নতুন PIN আগের PIN থেকে আলাদা হতে হবে।', 'The new PIN must be different from the current one.') });
    if (again !== next) return setProblem({ field: 'again', text: t('দুটি PIN মেলেনি।', 'The two PINs do not match.') });

    setBusy(true);
    setProblem(null);
    try {
      await api.post('/api/staff/pin', { currentPin: current, newPin: next });
      setCurrent('');
      setNext('');
      setAgain('');
      setChanged(true);
    } catch (err) {
      // A wrong current PIN is refused with the sign-in message, which talks about the mobile number: say what is meant here.
      if (isApiError(err) && err.code === 'INVALID_CREDENTIALS') setProblem({ field: 'current', text: t('বর্তমান PIN ঠিক নয়।', 'The current PIN is not right.') });
      else setProblem({ field: 'form', text: errorText(err) });
      setCurrent('');
    } finally {
      setBusy(false);
    }
  };

  if (changed) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Notice>{tx('PIN বদলানো হয়েছে। আপনার অন্য ডিভাইসগুলো থেকে লগআউট হয়ে গেছে।', 'Your PIN was changed. You were signed out on your other devices.')}</Notice>
        {onDone && <Button size="sm" variant="secondary" onClick={onDone}>{tx('ঠিক আছে', 'Done')}</Button>}
      </div>
    );
  }

  const err = (field: Problem['field']) => (problem?.field === field ? l(problem.text) : undefined);
  const clear = () => setProblem(null);

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3.5">
      <Field id="pin-current" label={tx('বর্তমান PIN', 'Current PIN')} error={err('current')}>
        <input id="pin-current" type="password" inputMode="numeric" autoComplete="current-password" maxLength={6} placeholder="••••••" value={current} onChange={(e) => { setCurrent(six(e.target.value)); clear(); }} className={pinClass} />
      </Field>
      <Field id="pin-new" label={tx('নতুন ৬ সংখ্যার PIN', 'New 6-digit PIN')} error={err('next')}>
        <input id="pin-new" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} placeholder="••••••" value={next} onChange={(e) => { setNext(six(e.target.value)); clear(); }} className={pinClass} />
      </Field>
      <Field id="pin-again" label={tx('নতুন PIN আবার লিখুন', 'Type the new PIN again')} error={err('again')}>
        <input id="pin-again" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} placeholder="••••••" value={again} onChange={(e) => { setAgain(six(e.target.value)); clear(); }} className={pinClass} />
      </Field>
      {problem?.field === 'form' && <Notice tone="danger">{l(problem.text)}</Notice>}
      <div className="flex flex-wrap gap-2.5">
        <Button type="submit" disabled={busy}>{busy ? tx('সেভ হচ্ছে…', 'Saving…') : tx('PIN বদলান', 'Change PIN')}</Button>
        {onDone && <Button variant="secondary" onClick={onDone} disabled={busy}>{tx('বাতিল', 'Cancel')}</Button>}
      </div>
    </form>
  );
}

/**
 * A button that opens "Change PIN" in a dialog. `icon` is the compact round form for headers; `ghost` is the labelled one for menus.
 * The form is only mounted while the dialog is open, so it starts empty every time.
 */
export function ChangePinButton({ variant = 'ghost' }: { variant?: 'ghost' | 'icon' }) {
  const { tx } = useI18n();
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const label = tx('PIN বদলান', 'Change PIN');
  const show = () => {
    setOpen(true);
    dialog.current?.showModal();
  };

  return (
    <>
      {variant === 'icon' ? (
        <button type="button" onClick={show} aria-label={label} title={label} className="flex size-11 items-center justify-center rounded-xl border border-line bg-surface text-ink hover:bg-surface2">
          <KeyRound size={20} aria-hidden="true" />
        </button>
      ) : (
        <Button variant="ghost" size="sm" onClick={show}>
          <KeyRound size={18} aria-hidden="true" />
          {label}
        </Button>
      )}
      <dialog ref={dialog} onClose={() => setOpen(false)} aria-labelledby={titleId} className="m-auto w-[min(92vw,420px)] rounded-card border border-line bg-surface p-5 text-ink shadow-xl backdrop:bg-black/40">
        {open && (
          <div className="flex flex-col gap-4">
            <h2 id={titleId} className="font-display text-2xl font-bold">{label}</h2>
            <ChangePinForm onDone={() => dialog.current?.close()} />
          </div>
        )}
      </dialog>
    </>
  );
}
