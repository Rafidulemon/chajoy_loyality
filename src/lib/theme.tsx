'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { smoothTransition } from './transition';

export type Theme = 'light' | 'dark';

type ThemeValue = { theme: Theme; setTheme: (theme: Theme) => void; toggle: () => void };

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ initialTheme, children }: { initialTheme: Theme; children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  const setTheme = useCallback((next: Theme) => {
    smoothTransition(() => {
      setThemeState(next);
      document.documentElement.classList.toggle('dark', next === 'dark');
    });
    document.cookie = `chajoy-theme=${next}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  const toggle = useCallback(() => setTheme(theme === 'dark' ? 'light' : 'dark'), [theme, setTheme]);

  return <ThemeContext.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
