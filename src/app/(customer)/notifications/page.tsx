'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { Button, IconChip } from '@/components/ui';
import { errorText } from '@/lib/api/messages';
import { useNotifications } from '@/lib/api/notifications';
import { useI18n, type Text } from '@/lib/i18n';
import { cn } from '@/lib/cn';

export default function NotificationsPage() {
  const { tx, l, n } = useI18n();
  const { items, unread, loading, markAllRead } = useNotifications();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Text | null>(null);

  const readAll = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await markAllRead();
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[clamp(26px,4vw,36px)] font-bold leading-tight">{tx('নোটিফিকেশন', 'Notifications')}</h1>
          <p className="text-[15px] text-muted">{unread ? tx(`${n(unread)}টি নতুন নোটিফিকেশন`, `${unread} new notification${unread === 1 ? '' : 's'}`) : tx('সব পড়া হয়েছে', 'You’re all caught up')}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void readAll()} disabled={!unread || busy}>
          <Check size={18} aria-hidden="true" />
          {tx('সব পড়া হয়েছে', 'Mark all read')}
        </Button>
      </div>
      {problem && <p role="alert" className="text-[13px] font-semibold text-danger">{l(problem)}</p>}
      {loading ? (
        <div role="status" aria-label={tx('লোড হচ্ছে', 'Loading')} className="flex flex-col gap-2.5">
          {[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-[20px] bg-surface2" />)}
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-card border border-dashed border-line2 p-8 text-center text-muted">{tx('এখনো কোনো নোটিফিকেশন নেই।', 'No notifications yet.')}</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {items.map((item) => (
            <li key={item.id} className={cn('relative flex items-start gap-3.5 rounded-[20px] border p-4', item.unread ? 'border-line2 bg-surface' : 'border-line')}>
              <IconChip color={item.color} size={44}>{item.mark}</IconChip>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="font-bold">{l(item.title)}</h2>
                  <span className="whitespace-nowrap text-[13px] text-muted">{l(item.time)}</span>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-muted">{l(item.body)}</p>
              </div>
              {item.unread && <span aria-label={tx('নতুন', 'New')} className="absolute left-3.5 top-3.5 size-2.5 rounded-full border-2 border-surface bg-rose" />}
            </li>
          ))}
        </ul>
      )}
      <Link href="/profile" className="inline-flex min-h-11 items-center self-center font-bold">{tx('নোটিফিকেশন সেটিংস', 'Notification settings')}</Link>
    </>
  );
}
