'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { Button, IconChip } from '@/components/ui';
import { notifications } from '@/lib/data';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/cn';

export default function NotificationsPage() {
  const { tx, l, n } = useI18n();
  const [allRead, setAllRead] = useState(false);
  const unread = allRead ? 0 : notifications.filter((x) => x.unread).length;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[clamp(26px,4vw,36px)] font-bold leading-tight">{tx('নোটিফিকেশন', 'Notifications')}</h1>
          <p className="text-[15px] text-muted">{unread ? tx(`${n(unread)}টি নতুন নোটিফিকেশন`, `${unread} new notifications`) : tx('সব পড়া হয়েছে', 'You’re all caught up')}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setAllRead(true)} disabled={!unread}>
          <Check size={18} aria-hidden="true" />
          {tx('সব পড়া হয়েছে', 'Mark all read')}
        </Button>
      </div>
      <ul className="flex flex-col gap-2.5">
        {notifications.map((item, i) => {
          const isUnread = item.unread && !allRead;
          return (
            <li key={i} className={cn('relative flex items-start gap-3.5 rounded-[20px] border p-4', isUnread ? 'border-line2 bg-surface' : 'border-line')}>
              <IconChip color={item.color} size={44}>{item.mark}</IconChip>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="font-bold">{l(item.title)}</h2>
                  <span className="whitespace-nowrap text-[13px] text-muted">{l(item.time)}</span>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-muted">{l(item.body)}</p>
              </div>
              {isUnread && <span aria-label={tx('নতুন', 'New')} className="absolute left-3.5 top-3.5 size-2.5 rounded-full border-2 border-surface bg-rose" />}
            </li>
          );
        })}
      </ul>
      <Link href="/profile" className="inline-flex min-h-11 items-center self-center font-bold">{tx('নোটিফিকেশন সেটিংস', 'Notification settings')}</Link>
    </>
  );
}
