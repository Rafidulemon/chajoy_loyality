'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button, Field, Notice } from '@/components/ui';
import { api } from '@/lib/api/client';
import { errorText, retryAfter } from '@/lib/api/messages';
import { safeNext, useSession } from '@/lib/api/session';
import { normalizePhone } from '@/lib/domain/phone';
import { useI18n, type Text } from '@/lib/i18n';
import { cn } from '@/lib/cn';

function HeroArt() {
  return (
    <div aria-hidden="true" className="relative min-h-[230px] flex-1 basis-[320px] overflow-hidden rounded-hero bg-[#97C334]">
      <span className="absolute -bottom-10 -left-8 size-40 rounded-full bg-sky" />
      <span className="absolute -right-5 -top-8 size-[120px] rounded-full bg-tangerine" />
      <MiniCard className="left-[10%] top-[18%] w-[58%] -rotate-[8deg] bg-rose" ink="#171717" filled={3} />
      <MiniCard className="bottom-[14%] right-[8%] w-[52%] rotate-[7deg] bg-aqua" ink="#08261E" filled={2} />
    </div>
  );
}
function MiniCard({ className, ink, filled }: { className: string; ink: string; filled: number }) {
  return (
    <div className={cn('absolute flex max-w-[260px] aspect-[1.6] flex-col justify-between rounded-[20px] p-3.5 shadow-[0_12px_28px_rgba(11,26,31,0.3)]', className)}>
      <span className="h-2.5 w-[46%] rounded-full" style={{ background: ink }} />
      <div className="grid grid-cols-4 gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="aspect-square rounded-full" style={i < filled ? { background: ink } : { border: `2px dashed ${ink}`, opacity: 0.5 }} />
        ))}
      </div>
    </div>
  );
}

type Challenge = { challengeId: string; resendAt: number; mode: 'sms' | 'fixed' };

function LoginForm() {
  const { tx, l, n } = useI18n();
  const router = useRouter();
  const next = useSearchParams().get('next');
  const { customer, loading } = useSession();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState<Text | null>(null);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpError, setOtpError] = useState<Text | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  // Already signed in on this phone: go straight to the card.
  useEffect(() => {
    if (!loading && customer) router.replace(safeNext(next, customer.profileComplete ? '/cards' : '/setup'));
  }, [loading, customer, next, router]);

  // The "resend" countdown.
  useEffect(() => {
    if (step !== 'otp') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [step]);

  const normalized = normalizePhone(phone);
  const waitSeconds = challenge ? Math.max(0, Math.ceil((challenge.resendAt - now) / 1000)) : 0;

  const requestCode = async () => {
    if (!normalized) {
      setPhoneError({ bn: 'সঠিক মোবাইল নম্বর দিন, যেমন 1712-345678', en: 'Enter a valid mobile number, like 1712-345678' });
      return;
    }
    setBusy(true);
    setPhoneError(null);
    try {
      const r = await api.post<{ challengeId: string; resendAfterSec: number; mode: 'sms' | 'fixed' }>('/api/auth/otp/request', { phone: normalized });
      setChallenge({ challengeId: r.challengeId, resendAt: Date.now() + r.resendAfterSec * 1000, mode: r.mode });
      setNow(Date.now());
      setOtp(['', '', '', '', '', '']);
      setOtpError(null);
      setStep('otp');
      setTimeout(() => boxes.current[0]?.focus(), 50);
    } catch (e) {
      setPhoneError(errorText(e));
      const wait = retryAfter(e);
      if (wait) setPhoneError({ bn: `${errorText(e).bn} (${n(wait)} সেকেন্ড)`, en: `${errorText(e).en} (${wait}s)` });
    } finally {
      setBusy(false);
    }
  };

  const setDigit = (i: number, v: string) => {
    const digits = v.replace(/\D/g, '');
    if (digits.length > 1) {
      // A pasted or auto-filled code: spread it over the boxes.
      const next6 = digits.slice(0, 6).split('');
      setOtp(Array.from({ length: 6 }, (_, k) => next6[k] ?? ''));
      boxes.current[Math.min(next6.length, 5)]?.focus();
      setOtpError(null);
      return;
    }
    const d = digits.slice(-1);
    const copy = [...otp];
    copy[i] = d;
    setOtp(copy);
    setOtpError(null);
    if (d && i < 5) boxes.current[i + 1]?.focus();
  };

  const verify = async () => {
    if (!challenge) return;
    if (otp.some((d) => !d)) {
      setOtpError({ bn: '৬ সংখ্যার কোডটি পুরো লিখুন', en: 'Enter all 6 digits of the code' });
      return;
    }
    setBusy(true);
    setOtpError(null);
    try {
      const r = await api.post<{ isNew: boolean; profileComplete: boolean }>('/api/auth/otp/verify', { challengeId: challenge.challengeId, code: otp.join(''), language: document.documentElement.lang === 'bn' ? 'bn' : 'en' });
      router.push(r.profileComplete ? safeNext(next, '/cards') : '/setup');
    } catch (e) {
      setOtpError(errorText(e));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-1 flex-wrap items-stretch gap-[clamp(20px,4vw,48px)] pt-1">
      <HeroArt />
      <div className="flex flex-1 basis-[340px] flex-col justify-center gap-6">
        {step === 'phone' ? (
          <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); void requestCode(); }}>
            <div>
              <h1 className="font-display text-[clamp(28px,4vw,40px)] font-bold leading-tight">{tx('আপনার চা জয় কার্ড, সবসময় সাথে', 'Your ChaJoy card, always with you')}</h1>
              <p className="mt-2 text-base text-muted">{tx('কাগজের কার্ড হারানোর ঝামেলা নেই। Stamp জমান, Reward নিন।', 'No more lost paper cards. Collect stamps, get rewards.')}</p>
            </div>
            <Field id="phone" label={tx('মোবাইল নম্বর', 'Mobile number')} hint={tx('এই নম্বরে একটি ৬ সংখ্যার OTP কোড পাঠানো হবে', 'We’ll send a 6-digit code to this number')} error={phoneError ? l(phoneError) : undefined}>
              <div className="flex h-14 overflow-hidden rounded-2xl border-[1.5px] border-line2 bg-surface focus-within:border-brand">
                <span className="flex items-center border-r border-line bg-surface2 px-3.5 text-[17px] font-bold">+880</span>
                <input
                  id="phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder="1712-345678"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); setPhoneError(null); }}
                  className="min-w-0 flex-1 bg-transparent px-3.5 text-lg outline-none"
                />
              </div>
            </Field>
            <Button type="submit" size="lg" disabled={busy}>{busy ? tx('পাঠানো হচ্ছে…', 'Sending…') : tx('OTP পাঠান', 'Send code')}</Button>
            <p className="text-center text-[13px] text-muted">
              {tx('চালিয়ে গেলে আপনি আমাদের ', 'By continuing you agree to our ')}
              <Link href="#">{tx('শর্তাবলী', 'Terms')}</Link>
              {tx(' ও ', ' and ')}
              <Link href="#">{tx('প্রাইভেসি পলিসি', 'Privacy policy')}</Link>
              {tx('-তে সম্মত হচ্ছেন', '.')}
            </p>
          </form>
        ) : (
          <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); void verify(); }}>
            <button type="button" onClick={() => setStep('phone')} aria-label={tx('পেছনে যান', 'Go back')} className="flex size-11 items-center justify-center rounded-full border border-line bg-surface">
              <ArrowLeft size={20} aria-hidden="true" />
            </button>
            <div>
              <h1 className="font-display text-[clamp(28px,4vw,40px)] font-bold leading-tight">{tx('কোডটি লিখুন', 'Enter the code')}</h1>
              <p className="mt-2 text-muted">{tx(`+880 ${n(phone)} নম্বরে পাঠানো ৬ সংখ্যার কোড`, `Sent to +880 ${phone}`)}</p>
            </div>
            {challenge?.mode === 'fixed' && (
              <Notice tone="warn">{tx('ডেভেলপমেন্ট মোড: কোনো SMS যায়নি। .env.local ফাইলের DEV_OTP_CODE কোডটি লিখুন।', 'Development mode: no SMS was sent. Enter the DEV_OTP_CODE from your .env.local file.')}</Notice>
            )}
            <fieldset>
              <legend className="sr-only">{tx('OTP কোড', 'One-time code')}</legend>
              <div className="grid grid-cols-6 gap-2">
                {otp.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => { boxes.current[i] = el; }}
                    aria-label={tx(`সংখ্যা ${n(i + 1)}`, `Digit ${i + 1}`)}
                    inputMode="numeric"
                    autoComplete={i === 0 ? 'one-time-code' : 'off'}
                    value={d}
                    onChange={(e) => setDigit(i, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Backspace' && !otp[i] && i > 0) boxes.current[i - 1]?.focus(); }}
                    className={cn('h-[60px] min-w-0 rounded-[14px] border-2 text-center text-2xl font-bold outline-none focus:border-tangerine', d ? 'border-brand bg-brand-soft' : 'border-line2 bg-surface')}
                  />
                ))}
              </div>
              {otpError && <p role="alert" className="mt-2 text-[13px] font-semibold text-danger">{l(otpError)}</p>}
            </fieldset>
            <p className="text-[15px] text-muted">
              {waitSeconds > 0 ? (
                tx(`কোড পাননি? ০:${n(String(waitSeconds).padStart(2, '0'))} পরে আবার পাঠাতে পারবেন`, `Didn’t get it? Resend in 0:${String(waitSeconds).padStart(2, '0')}`)
              ) : (
                <button type="button" onClick={() => void requestCode()} disabled={busy} className="font-bold text-ink underline underline-offset-4">{tx('আবার কোড পাঠান', 'Send the code again')}</button>
              )}
            </p>
            <Button type="submit" size="lg" disabled={busy}>{busy ? tx('যাচাই হচ্ছে…', 'Checking…') : tx('যাচাই করুন', 'Verify')}</Button>
            <p className="text-center text-[13px] text-muted">{tx('একবার লগইন করলে আর বারবার OTP লাগবে না', 'You’ll stay logged in on this phone')}</p>
          </form>
        )}
      </div>
    </div>
  );
}

// useSearchParams needs a Suspense boundary so the page can still be built.
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
