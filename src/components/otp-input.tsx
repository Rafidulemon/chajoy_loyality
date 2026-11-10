'use client';

import { useEffect, useRef } from 'react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/cn';

/** Six boxes for a one-time code. Typing moves on, backspace moves back, and a pasted or auto-filled code spreads over the boxes. */
export function OtpInput({ value, onChange, error, autoFocus = true }: { value: string[]; onChange: (next: string[]) => void; error?: string; autoFocus?: boolean }) {
  const { tx, n } = useI18n();
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (autoFocus) boxes.current[0]?.focus();
  }, [autoFocus]);

  const set = (i: number, raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (digits.length > 1) {
      const filled = digits.slice(0, 6).split('');
      onChange(Array.from({ length: 6 }, (_, k) => filled[k] ?? ''));
      boxes.current[Math.min(filled.length, 5)]?.focus();
      return;
    }
    const d = digits.slice(-1);
    const copy = [...value];
    copy[i] = d;
    onChange(copy);
    if (d && i < 5) boxes.current[i + 1]?.focus();
  };

  return (
    <fieldset>
      <legend className="sr-only">{tx('OTP কোড', 'One-time code')}</legend>
      <div className="grid grid-cols-6 gap-2">
        {value.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              boxes.current[i] = el;
            }}
            aria-label={tx(`সংখ্যা ${n(i + 1)}`, `Digit ${i + 1}`)}
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            value={d}
            onChange={(e) => set(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Backspace' && !value[i] && i > 0) boxes.current[i - 1]?.focus();
            }}
            className={cn('h-[60px] min-w-0 rounded-[14px] border-2 text-center text-2xl font-bold outline-none focus:border-tangerine', d ? 'border-brand bg-brand-soft' : 'border-line2 bg-surface')}
          />
        ))}
      </div>
      {error && <p role="alert" className="mt-2 text-[13px] font-semibold text-danger">{error}</p>}
    </fieldset>
  );
}
