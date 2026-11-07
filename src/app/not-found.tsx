'use client';

import { ButtonLink } from '@/components/ui';
import { useI18n } from '@/lib/i18n';

export default function NotFound() {
  const { tx } = useI18n();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="font-display text-3xl font-bold">{tx('পেজটি পাওয়া যায়নি', 'Page not found')}</h1>
      <p className="text-muted">{tx('লিংকটি ভুল বা পুরোনো হতে পারে।', 'The link may be wrong or out of date.')}</p>
      <ButtonLink href="/">{tx('হোমে যান', 'Go home')}</ButtonLink>
    </main>
  );
}
