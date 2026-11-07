'use client';

import { Moon, Sun } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { Segmented } from './ui';

export function LanguageSwitch() {
  const { lang, setLang, tx } = useI18n();
  return (
    <Segmented
      label={tx('ভাষা', 'Language')}
      value={lang}
      onChange={setLang}
      options={[
        { value: 'bn', label: 'বাং' },
        { value: 'en', label: 'EN' },
      ]}
    />
  );
}

export function ThemeButton() {
  const { theme, toggle } = useTheme();
  const { tx } = useI18n();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? tx('লাইট মোড', 'Light mode') : tx('ডার্ক মোড', 'Dark mode')}
      className="flex size-11 items-center justify-center rounded-full border border-line bg-surface text-ink hover:bg-surface2"
    >
      {dark ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
    </button>
  );
}

export function Toggles() {
  return (
    <div className="flex items-center gap-2">
      <LanguageSwitch />
      <ThemeButton />
    </div>
  );
}
