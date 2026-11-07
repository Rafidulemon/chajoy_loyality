import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        surface2: 'var(--surface-2)',
        line: 'var(--line)',
        line2: 'var(--line-2)',
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        navy: '#171717',
        brand: {
          DEFAULT: 'var(--brand)',
          on: 'var(--on-brand)',
          soft: 'var(--brand-soft)',
          ink: 'var(--brand-ink)',
          dark: 'var(--brand-dark)',
        },
        tangerine: { DEFAULT: '#F5D900', soft: 'var(--tangerine-soft)' },
        rose: { DEFAULT: '#FF5D73', soft: 'var(--rose-soft)', ink: 'var(--rose-ink)' },
        aqua: { DEFAULT: '#2EC4B6', soft: 'var(--aqua-soft)' },
        sky: { DEFAULT: '#3DB8FF', soft: 'var(--sky-soft)' },
        ok: 'var(--ok)',
        warn: 'var(--warn)',
        info: 'var(--info)',
        danger: { DEFAULT: 'var(--danger)', soft: 'var(--danger-soft)' },
      },
      fontFamily: {
        sans: ['var(--font-hind)', 'Noto Sans Bengali', 'system-ui', 'sans-serif'],
        display: ['var(--font-baloo)', 'var(--font-hind)', 'sans-serif'],
      },
      borderRadius: {
        card: '22px',
        hero: '28px',
      },
      keyframes: {
        'stamp-press': {
          '0%': { opacity: '0', transform: 'scale(2.4) rotate(-28deg)' },
          '55%': { opacity: '1', transform: 'scale(0.9) rotate(var(--tilt, 0deg))' },
          '78%': { transform: 'scale(1.07) rotate(var(--tilt, 0deg))' },
          '100%': { opacity: '1', transform: 'scale(1) rotate(var(--tilt, 0deg))' },
        },
        'stamp-ring': {
          '0%': { opacity: '0.8', transform: 'scale(0.8)' },
          '100%': { opacity: '0', transform: 'scale(2.2)' },
        },
        'confetti-fall': {
          '0%': { opacity: '1', transform: 'translate3d(0, -24px, 0) rotate(0deg)' },
          '100%': { opacity: '0', transform: 'translate3d(var(--dx, 0px), 340px, 0) rotate(560deg)' },
        },
        'pop-in': {
          '0%': { opacity: '0', transform: 'translateY(14px) scale(0.96)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'bar-in-right': {
          '0%': { opacity: '0', transform: 'translateX(28px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'bar-in-left': {
          '0%': { opacity: '0', transform: 'translateX(-28px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        sheen: {
          '0%': { transform: 'translateX(-160%) skewX(-20deg)' },
          '55%, 100%': { transform: 'translateX(460%) skewX(-20deg)' },
        },
      },
      animation: {
        'stamp-press': 'stamp-press 700ms cubic-bezier(0.2, 0.9, 0.25, 1.15) both',
        'stamp-ring': 'stamp-ring 800ms ease-out 350ms both',
        confetti: 'confetti-fall 2200ms ease-in forwards',
        'pop-in': 'pop-in 280ms ease-out both',
        'bar-in-right': 'bar-in-right 450ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'bar-in-left': 'bar-in-left 450ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        sheen: 'sheen 7s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
