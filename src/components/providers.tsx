'use client';

import type { ReactNode } from 'react';
import { I18nProvider, type Lang } from '@/lib/i18n';
import { ThemeProvider, type Theme } from '@/lib/theme';
import { StoreProvider } from '@/lib/store';

export function Providers({ lang, theme, children }: { lang: Lang; theme: Theme; children: ReactNode }) {
  return (
    <ThemeProvider initialTheme={theme}>
      <I18nProvider initialLang={lang}>
        <StoreProvider>{children}</StoreProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
