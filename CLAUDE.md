# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

chaJoy loyality is a digital loyalty stamp card for ChaJoy Ice Cream and Tea in Bangladesh. It is a **single-vendor** product: ChaJoy is the only brand, so there is no multi-shop discovery, shop sign-up, tenant billing or per-shop data. Do not reintroduce shop IDs, categories or SaaS plan/billing screens. ChaJoy's outlets are modelled as `branches`. It is a full-stack app: Next.js 15 App Router (React 19, TypeScript strict, Tailwind 3) with route handlers as the API, PostgreSQL on Neon through Prisma 7. The README has setup, configuration, demo accounts, the API overview and the checklist for going live.

## Commands

```bash
npm install                  # also runs `prisma generate` (client goes to src/generated, git-ignored)
npm run dev                  # http://localhost:3000
npm run build                # production build (also type-checks)
npm run typecheck            # tsc --noEmit
npm test                     # Vitest: unit tests + database tests (a throwaway schema in DATABASE_URL's database)
npm run db:deploy            # apply migrations;  npm run db:migrate  while developing the schema
npm run db:seed              # outlets, default program, and in development the demo staff/customers/offers
npm run db:verify            # check every card against the ledger and vouchers
npm run db:create-owner -- --phone 01712345678 --name "Name"   # first owner on a new database
```

Requires Node 20+ and a Postgres database (`.env.local`, see `.env.example`). Secrets live only in `.env.local`: never print or commit them. The dev server needs the database, and sign-in in development uses `OTP_MODE=fixed` with `DEV_OTP_CODE`. There is no ESLint config checked in.

## Architecture

**Three apps share one codebase and one backend**, separated by route groups under `src/app/`, each with its own shell component in `src/components/`:

- Customer, mobile-first: `(auth)` (login, setup, no tab bar) and `(customer)` (cards, rewards, offers, outlets, history, notifications, profile), using `customer-shell.tsx`. The bottom/top nav is Card, Rewards, Offers, Outlets, Profile; History is reached from links on the card, rewards and profile pages.
- Cashier: `cashier/` (scan, customers, today), using `cashier-shell.tsx`. Staff sign in at `staff/login`.
- Management (ChaJoy staff), web dashboard: `(owner)/owner/*` using `owner-shell.tsx`: Dashboard, Customers, Loyalty card, Offers, Staff, SMS, Settings. Owner and manager only; the shell turns a cashier away and hides pages a role may not open.

**Backend layering** (`src/app/api/**/route.ts` → `src/server/domain` → Prisma). Route handlers are thin: they are built with `publicRoute` / `customerRoute` / `staffRoute` from `src/server/http.ts`, which do the origin check, authentication, the role's permission, Zod validation of params, query and body, and the uniform error JSON. All rules live in `src/server/domain/*` and take a Prisma client or a transaction. Pure rules (card arithmetic, daily room, undo window, permissions, phone, time) are in `src/lib/domain` and are shared with the apps; request/response shapes and error codes are in `src/lib/contracts`. Add an endpoint by adding a contract, a domain function (with a database test in `tests/db`), and a thin route.

**Data rules to keep** (details in the README):
- The stamp ledger (`StampEntry`) is append-only: DB triggers refuse UPDATE and DELETE; an undo is a new row. `Card` counters are a cache and must equal the ledger (`verifyLedger`, used by tests and `npm run db:verify`).
- Every write that changes a card locks it first (`lockCard`), after taking the program row shared (`getProgramLocked`), always in that order. Saving the program locks the program row, then cards in id order.
- Inside `db().$transaction` never run queries concurrently (no `Promise.all` on `tx`): there is one connection and the pg driver deprecates it. `Promise.all` is fine on `db()` outside a transaction.
- Stamp requests carry an idempotency key; vouchers snapshot title and items when issued; voucher redemption is an atomic compare-and-swap; "ready/used/expired" is derived, never stored.
- All "days" are Asia/Dhaka calendar days (`src/lib/domain/time.ts`).
- Never log secrets, codes, PINs, tokens or full phone numbers. Error messages name variables, never values.

**Auth.** Customers: phone + 6-digit code. Staff: phone + 6-digit PIN, and managers and owners add a one-time code. Sessions are opaque tokens (stored hashed) in httpOnly cookies `cj_c` / `cj_s` (`__Host-` prefixed in production). `src/middleware.ts` only checks the cookie exists; every API call checks the session for real, and a 401 sends the app to sign-in (`src/lib/api/client.ts`). Code requests are rate limited (30 s apart, 5 an hour per number), so a script should keep its session. `OTP_MODE=fixed` and `SMS_PROVIDER=console` are development only and refused in production.

**Language and theme are cookie-backed and server-rendered.** `app/layout.tsx` reads the `chajoy-lang` (default `en`) and `chajoy-theme` (default `light`) cookies and sets `<html lang>` and the `dark` class on the server, so there is no flash. `components/providers.tsx` passes those initial values into `ThemeProvider` (`lib/theme.tsx`) and `I18nProvider` (`lib/i18n.tsx`). Their setters write the cookie and update `<html>` client-side. Do not move this to localStorage or a client-only effect.

**Bilingual copy is mandatory.** Every user-facing string must exist in Bangla and English. Get helpers from `useI18n()` (client components only):
- `tx('বাংলা', 'English')` for inline copy.
- `l(text)` for `{ bn, en }` objects (the `Text` type) coming from data.
- `n(value)` for numbers. It groups digits and converts to Bangla digits in `bn` mode, so never render raw numbers.
Dates and times go through `src/lib/format.ts` (always Dhaka time). Server error codes become friendly bilingual text in `src/lib/api/messages.ts`.

**Client data layer** is `src/lib/api`: `client.ts` (fetch wrapper, `ApiError` with the server's code, global 401 handler), `provider.tsx` (SWR config), `session.ts`, and per-app hooks (`cashier.ts`, `admin-customers.ts`, `admin-config.ts`, `program.ts`, `branches.ts`, `history.ts`, `notifications.ts`). `adapters.ts` maps DTOs onto the UI types in `src/lib/data.ts` (`Customer`, `Voucher`, `Offer`, `Branch`, `HistoryItem`…), so screens never see the raw API shapes. Do not scatter `fetch` calls through pages. `src/lib/data.ts` holds only those UI types and ChaJoy's reference data (starting card, ten real outlets, five sample offers), which `prisma/seed.ts` loads; it is not a source of customer data.

**The loyalty program** (stamps per card, reward items, daily limit, minimum purchase, expiry, welcome bonus, card colour) is one row in the database, served at `GET /api/program` and edited by the owner (`/owner/program`, optimistic `version`). Read the live card with `useProgram()` from `lib/api/program.ts` (ChaJoy's base card with the program applied, built by `buildShop` in `lib/program.ts`) and never hard-code 10 stamps. Saving a smaller `total` completes the cards of customers who already have enough stamps (the screen warns first, from `/api/admin/program/impact`). The daily limit is enforced by the server on every stamp; the cashier screen reacts to its answer.

**Real-time:** `lib/wallet.tsx` (`WalletProvider` in the customer layout, `useWallet()`, `useCardView()` for the stamp-press animation, `useMemberQr()`) polls `/api/me/version` every 2 seconds and reloads the wallet when it changes, then derives the animation and the reward toast from the difference. There are no websockets, so it works on serverless.

**Styling:** colour tokens are CSS variables in `app/globals.css` (light and `.dark`), exposed to Tailwind in `tailwind.config.ts` (for example `bg-surface`, `text-muted`, `border-line`, `bg-aqua`). Use the tokens, not raw hex, so dark mode works. Fonts (Baloo Da 2 for `font-display`, Hind Siliguri for body) are loaded in the root layout via `next/font`. Shared primitives (Button, Card, Badge, Switch, Segmented, Stepper, Field) are in `components/ui.tsx`; use `cn()` from `lib/cn.ts` to merge classes.

**Offer bar:** `components/offer-bar.tsx` is the glossy announcement slider under the customer header (mounted in `customer-shell.tsx`). It rotates through the offers the customer can still use, links each one to `/offers#<id>`, is hidden on the Offers page, and can be dismissed until the next reload. Keep its text dark (`#171717`) on the lime gradient.

**Conventions:** import with the `@/*` alias (maps to `src/*`). Pages that use hooks or interactivity are client components (`'use client'`). Server-only modules start with `import 'server-only'`. Layouts must hold up from 360px phones to wide desktops, so check narrow widths when changing UI.

**Testing:** `npm test` needs `DATABASE_URL`; the database tests create and drop their own schema, so they never touch real data, but they do take a minute or two against Neon. Every ledger or voucher change needs a test, and the suites end by asserting the ledger invariants. The browser flows (customer, cashier, management) were exercised end to end with Playwright against the dev server; there is no checked-in browser test suite.
