'use client';

import { usePathname } from 'next/navigation';
import { errorText, isSignedOut } from '@/lib/api/messages';
import { cn } from '@/lib/cn';
import { useI18n } from '@/lib/i18n';
import { Button } from './ui';

/** A grey pulsing block for where data is still loading. Size it with `className`; it is rounded unless the class names its own radius. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse bg-line', !className?.includes('rounded') && 'rounded-xl', className)} />;
}

/** The look of a small secondary button, for a plain link that has to be an <a> (a file download, a sign-in page in a new tab). */
export const linkButtonClass =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border-[1.5px] border-line2 bg-surface px-4 text-[15px] font-bold text-ink transition hover:bg-surface2 active:translate-y-px';

/**
 * A failed request: what went wrong in both languages (never the server's own text), with a button to try again.
 * When the session has ended, trying again cannot work, so it offers the sign-in page in a new tab instead: whatever was typed
 * here stays on this page, and once signed in over there, the same button can be pressed again.
 */
export function LoadError({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const { tx, l } = useI18n();
  const path = usePathname();
  return (
    <div role="alert" className={cn('flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-danger-soft px-4 py-3 text-danger', className)}>
      <p className="min-w-0 flex-1 text-[15px] font-bold">{l(errorText(error))}</p>
      {isSignedOut(error) ? (
        <a href={`/staff/login?next=${encodeURIComponent(path)}`} target="_blank" rel="noreferrer" className={linkButtonClass}>
          {tx('লগইন করুন', 'Sign in')}
        </a>
      ) : (
        onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            {tx('আবার চেষ্টা করুন', 'Try again')}
          </Button>
        )
      )}
    </div>
  );
}
