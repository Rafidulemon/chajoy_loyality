'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { smoothTransition } from './transition';

export type Lang = 'bn' | 'en';
/** A piece of copy in both languages. */
export type Text = { bn: string; en: string };

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

type I18nValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** Pick inline copy: tx('বাংলা', 'English'). */
  tx: (bn: string, en: string) => string;
  /** Pick a Text object from data. */
  l: (text: Text) => string;
  /** Format a number with grouping, in Bangla digits when the language is Bangla. */
  n: (value: number | string) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ initialLang, children }: { initialLang: Lang; children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  const setLang = useCallback((next: Lang) => {
    smoothTransition(() => {
      setLangState(next);
      document.documentElement.lang = next;
    });
    document.cookie = `chajoy-lang=${next}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  const value = useMemo<I18nValue>(() => {
    const bn = lang === 'bn';
    const n = (v: number | string) => {
      const s = typeof v === 'number' ? v.toLocaleString('en-US') : v;
      return bn ? s.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]) : s;
    };
    return { lang, setLang, tx: (b, e) => (bn ? b : e), l: (t) => (bn ? t.bn : t.en), n };
  }, [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}
