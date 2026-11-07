# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

chaJoy loyality is a digital loyalty stamp card for ChaJoy Ice Cream and Tea in Bangladesh. It is a **single-vendor** product: ChaJoy is the only brand, so there is no multi-shop discovery, shop sign-up, tenant billing or per-shop data. Do not reintroduce shop IDs, categories or SaaS plan/billing screens. ChaJoy's outlets are modelled as `branches`. This repo is a **frontend-only prototype** (Next.js 15 App Router, React 19, TypeScript strict, Tailwind 3). There is no backend, database, auth, or test suite: all data is hard-coded sample data. The README lists the planned backend work (Postgres, phone OTP via local SMS gateways, camera QR scanning).

## Commands

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build (also type-checks)
npm start        # serve the production build
npm run lint     # next lint (no ESLint config is checked in)
```

There is no test runner configured. Use `npx tsc --noEmit` for a standalone type check. Requires Node 20+.

## Architecture

**Three apps share one codebase**, separated by route groups under `src/app/`, each with its own shell component in `src/components/`:

- Customer, mobile-first: `(auth)` (login, setup, no tab bar) and `(customer)` (cards, rewards, offers, outlets, history, notifications, profile), using `customer-shell.tsx`. The bottom/top nav is Card, Rewards, Offers, Outlets, Profile; History is reached from links on the card, rewards and profile pages.
- Cashier: `cashier/` (scan, customers, today), using `cashier-shell.tsx`.
- Management (ChaJoy staff), web dashboard: `(owner)/owner/*` using `owner-shell.tsx`: Dashboard, Customers, Loyalty card, Offers, Staff, SMS, Settings.

**Language and theme are cookie-backed and server-rendered.** `app/layout.tsx` reads the `chajoy-lang` (default `en`) and `chajoy-theme` (default `light`) cookies and sets `<html lang>` and the `dark` class on the server, so there is no flash. `components/providers.tsx` passes those initial values into `ThemeProvider` (`lib/theme.tsx`) and `I18nProvider` (`lib/i18n.tsx`). Their setters write the cookie and update `<html>` client-side. Do not move this to localStorage or a client-only effect.

**Bilingual copy is mandatory.** Every user-facing string must exist in Bangla and English. Get helpers from `useI18n()` (client components only):
- `tx('বাংলা', 'English')` for inline copy.
- `l(text)` for `{ bn, en }` objects (the `Text` type) coming from data.
- `n(value)` for numbers. It groups digits and converts to Bangla digits in `bn` mode, so never render raw numbers.

**Sample data lives in `src/lib/data.ts`.** It holds the single `shop` (ChaJoy), `branches`, customers, staff, history, notifications, campaigns and chart series, plus a `getCustomer` lookup. `branches` are ChaJoy's ten real outlets (names and addresses); their coordinates and `OUTLET_HOURS` are placeholders. It also holds the seed `vouchers` and `offers`. Strings are `{ bn, en }` pairs built with the local `t()` helper. The `shop` carries the card colour palette (`color`, `fg`, `stampBg`, `stampFg`, `dash`, `deco1`, `deco2`), which `components/loyalty-card.tsx` renders. When adding a backend, replace this file with API calls rather than scattering fetches through pages.

**Styling:** colour tokens are CSS variables in `app/globals.css` (light and `.dark`), exposed to Tailwind in `tailwind.config.ts` (for example `bg-surface`, `text-muted`, `border-line`, `bg-aqua`). Use the tokens, not raw hex, so dark mode works. Fonts (Baloo Da 2 for `font-display`, Hind Siliguri for body) are loaded in the root layout via `next/font`. Shared primitives (Button, Card, Badge, Switch, Segmented, Stepper, Field) are in `components/ui.tsx`; use `cn()` from `lib/cn.ts` to merge classes.

**Shared store** lives in `src/lib/store.tsx` (`StoreProvider` is mounted in `components/providers.tsx`, read it with `useStore()`). It is the in-memory demo backend that all three apps share: every customer's card (stamps, reward vouchers, claimed offers, activity), the offers management publishes (`OfferRow`, live or paused), outlet opening hours, the activity feed and the day's live counters. Completing a card issues a reward voucher and starts a new card, for any customer. `lib/wallet.tsx` is the customer app's view of it (`useWallet()` for the demo customer `DEMO_CUSTOMER`, Tanvir, plus `useCardView()` for the stamp-press animation). The cashier screens add stamps, undo them, redeem vouchers by customer or by code, and add customers at the counter. Management creates and pauses offers, adjusts a customer's stamps, adds customers and edits outlet hours. A `BroadcastChannel` mirrors every change to the other open tabs, so adding a stamp in a cashier tab animates the card in a customer tab, and an offer published in management shows up in the customer offers bar. Nothing is persisted: a reload resets to the sample data. When adding a backend, replace the store with API calls and a push or websocket subscription. The loyalty program (stamps per reward, reward items, daily limit, minimum purchase, expiry, welcome bonus, card colour) lives in the store as `program`, with its types and helpers in `src/lib/program.ts`. Read the live card with `useProgram()` (the brand's card with the program applied) instead of importing `shop` from `data.ts`, which is only the starting card, and never hard-code 10 stamps. Saving a smaller `total` completes the cards of customers who already have enough stamps, and the daily limit is enforced on the cashier's customer screen.

**Offer bar:** `components/offer-bar.tsx` is the glossy announcement slider under the customer header (mounted in `customer-shell.tsx`). It rotates through the offers the customer can still use, links each one to `/offers#<id>`, is hidden on the Offers page, and can be dismissed until the next reload. Keep its text dark (`#171717`) on the lime gradient.

**Conventions:** import with the `@/*` alias (maps to `src/*`). Pages that use hooks or interactivity are client components (`'use client'`). Layouts must hold up from 360px phones to wide desktops, so check narrow widths when changing UI.
