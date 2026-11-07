'use client';

import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/cn';

const base =
  'inline-flex items-center justify-center gap-2 font-bold transition active:translate-y-px disabled:cursor-not-allowed disabled:translate-y-0 disabled:border-transparent disabled:bg-surface2 disabled:text-muted disabled:shadow-none';
const variants = {
  primary: 'bg-brand text-brand-on shadow-[0_3px_0_var(--brand-dark)] hover:brightness-105',
  secondary: 'border-[1.5px] border-line2 bg-surface text-ink hover:bg-surface2',
  ghost: 'text-ink hover:bg-surface2',
  tangerine: 'bg-tangerine text-navy shadow-[0_3px_0_#B39D00] hover:brightness-105',
  rose: 'bg-rose text-navy shadow-[0_3px_0_#C7364F] hover:brightness-105',
  danger: 'border-[1.5px] border-danger bg-surface text-danger hover:bg-danger-soft',
};
const sizes = {
  md: 'min-h-12 rounded-2xl px-5 text-base',
  sm: 'min-h-11 rounded-xl px-4 text-[15px]',
  lg: 'min-h-14 rounded-2xl px-6 text-lg',
};
type Variant = keyof typeof variants;
type Size = keyof typeof sizes;

export function Button({ variant = 'primary', size = 'md', className, ...props }: ComponentProps<'button'> & { variant?: Variant; size?: Size }) {
  return <button type="button" className={cn(base, variants[variant], sizes[size], className)} {...props} />;
}

export function ButtonLink({ variant = 'primary', size = 'md', className, ...props }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={cn(base, variants[variant], sizes[size], className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cn('rounded-card border border-line bg-surface p-5', className)} {...props} />;
}

export function CardTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-3 flex items-baseline justify-between gap-3', className)}>
      <h2 className="text-lg font-bold">{children}</h2>
      {action}
    </div>
  );
}

const tones = {
  brand: 'bg-brand-soft text-brand-ink',
  ok: 'bg-aqua-soft text-ok',
  warn: 'bg-tangerine-soft text-warn',
  rose: 'bg-rose-soft text-rose-ink',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-sky-soft text-info',
  solidAqua: 'bg-aqua text-[#08261E]',
};
export type Tone = keyof typeof tones;

export function Badge({ tone = 'brand', className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return <span className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-extrabold', tones[tone], className)}>{children}</span>;
}

export function IconChip({ color, children, size = 40, className }: { color: string; children: ReactNode; size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('flex shrink-0 items-center justify-center rounded-[14px] font-extrabold text-navy', className)}
      style={{ background: color, width: size, height: size }}
    >
      {children}
    </span>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn('flex h-8 w-[52px] shrink-0 items-center rounded-full p-[3px] transition-colors', checked ? 'justify-end bg-brand' : 'justify-start bg-line2')}
    >
      <span className="size-[26px] rounded-full bg-white shadow" />
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label, className }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (value: T) => void; label: string; className?: string }) {
  return (
    <div role="group" aria-label={label} className={cn('flex rounded-full bg-surface2 p-[3px]', className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cn('h-[38px] min-w-11 rounded-full px-3 text-sm font-bold transition-colors', on ? 'bg-brand text-brand-on' : 'text-muted hover:text-ink')}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Chip({ active, onClick, children, count }: { active: boolean; onClick: () => void; children: ReactNode; count?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border-[1.5px] px-4 text-[15px] font-bold transition-colors',
        active ? 'border-brand bg-brand text-brand-on' : 'border-line2 bg-surface text-ink hover:bg-surface2',
      )}
    >
      {children}
      {count !== undefined && <span className={cn('rounded-full px-2 text-[13px]', active ? 'bg-white/25' : 'bg-surface2')}>{count}</span>}
    </button>
  );
}

export function Stepper({ value, label, onDecrease, onIncrease, decreaseLabel, increaseLabel, valueClassName }: { value: ReactNode; label: string; onDecrease: () => void; onIncrease: () => void; decreaseLabel: string; increaseLabel: string; valueClassName?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[18px] bg-surface2 py-2 pl-4 pr-2">
      <span className="text-[15px] font-bold">{label}</span>
      <span className="flex items-center gap-1.5">
        <button type="button" onClick={onDecrease} aria-label={decreaseLabel} className="flex size-11 items-center justify-center rounded-[14px] bg-surface text-ink hover:bg-bg">
          <Minus size={20} strokeWidth={2.4} aria-hidden="true" />
        </button>
        <span className={cn('min-w-10 text-center text-[22px] font-extrabold', valueClassName)}>{value}</span>
        <button type="button" onClick={onIncrease} aria-label={increaseLabel} className="flex size-11 items-center justify-center rounded-[14px] bg-surface text-ink hover:bg-bg">
          <Plus size={20} strokeWidth={2.4} aria-hidden="true" />
        </button>
      </span>
    </div>
  );
}

export const inputClass =
  'h-[50px] w-full rounded-[14px] border-[1.5px] border-line2 bg-surface px-3.5 text-base text-ink focus:border-brand focus:outline-none';

export function Field({ id, label, hint, error, children }: { id: string; label: ReactNode; hint?: ReactNode; error?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-[13px] font-semibold text-danger">
          {error}
        </p>
      ) : (
        hint && <p className="text-sm text-muted">{hint}</p>
      )}
    </div>
  );
}

export function Notice({ tone = 'ok', children }: { tone?: 'ok' | 'warn' | 'danger'; children: ReactNode }) {
  const cls = { ok: 'bg-aqua-soft text-ok', warn: 'bg-tangerine-soft text-warn', danger: 'bg-danger-soft text-danger' }[tone];
  return (
    <p role="status" className={cn('rounded-2xl px-4 py-3 text-[15px] font-bold', cls)}>
      {children}
    </p>
  );
}

export function PageTitle({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[clamp(26px,3vw,34px)] font-bold leading-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-[15px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}
