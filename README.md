# chaJoy loyality

Digital loyalty stamp card for **ChaJoy Ice Cream and Tea** (Bangladesh). It is a single-vendor product: ChaJoy is the only brand, with ten outlets (branches). Three apps share one backend: a mobile-first **customer** app, a **cashier** app for the counter, and a **management** web dashboard.

Next.js 15 (App Router, React 19, TypeScript strict, Tailwind 3), with route handlers as the API and PostgreSQL (Neon) through Prisma 7.

## Run it

You need **Node.js 20 or newer** (`node -v`) and a PostgreSQL database. A free [Neon](https://neon.tech) project works: use its pooled connection string for the app and its direct (unpooled) one for migrations.

```bash
cd "D:\My projects\chaJoy_loyality"
npm install                 # also runs `prisma generate`
cp .env.example .env.local  # then fill it in, see Configuration
npm run db:deploy           # applies the migrations
npm run db:seed             # outlets, the default program and, in development, demo staff, customers and offers
npm run dev                 # http://localhost:3000
```

For a production build: `npm run build`, then `npm start`.

### Configuration

Everything secret lives in `.env.local` (git-ignored). The server checks it on first use and refuses to answer on a bad setup, naming the variable but never printing its value.

| Variable | What it is |
|---|---|
| `DATABASE_URL` | Pooled Postgres connection string, used by the app. |
| `DATABASE_URL_UNPOOLED` | Direct connection string, used by migrations (`prisma.config.ts`) and by the database tests. |
| `AUTH_SECRET` | 32+ random characters. Keys the code, PIN, QR and IP hashes. Changing it makes every existing staff PIN stop working (each one needs a reset), so treat it like a password and never change it casually. |
| `APP_ORIGIN` | The public origin, for the cross-site request check. Defaults to the origin of each request. |
| `OTP_MODE` | `sms`: a random code is sent by SMS. `fixed`: everyone uses `DEV_OTP_CODE`. **Development only**, refused in production. |
| `DEV_OTP_CODE` | The 6-digit code accepted in `fixed` mode. |
| `SMS_PROVIDER` | `console` prints messages on the server instead of sending them. The only provider so far, and refused in production (see Before going live). |
| `SEED_STAFF_PIN` | The 6-digit PIN the seed gives every demo staff account. |
| `CRON_SECRET` | Lets the scheduler call `/api/cron/sms`. Without it that route is off. |
| `DB_POOL_MAX` | Connections per server instance (default 5). |
| `NEXT_PUBLIC_APP_NAME` | Shown in the page title. |

`.env.example` lists them with empty values. Generate secrets with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.

### Demo accounts (development)

`npm run db:seed` adds these, built through the same functions the API uses, so every stamp, voucher and counter obeys the real rules. Nothing is ever sent to these numbers.

| Who | Number | Signs in with |
|---|---|---|
| Customer Tanvir (and seven more, `…0102` to `…0108`) | +880 1700-000101 | The number, then `DEV_OTP_CODE` |
| Owner Rafiq (all outlets) | +880 1700-000001 | PIN (`SEED_STAFF_PIN`), then `DEV_OTP_CODE` |
| Manager Sohel (Mohammadpur) | +880 1700-000002 | PIN, then `DEV_OTP_CODE` |
| Cashier Rakib (Mirpur 10) | +880 1700-000003 | PIN only |
| Cashier Mitu (Mirpur 10) | +880 1700-000004 | PIN only |
| Cashier Jui (Rampura, switched off) | +880 1700-000005 | Cannot sign in |

Customers sign in at `/login`, staff at `/staff/login`. The code and PIN are in `.env.local`. Asking for sign-in codes is rate limited like in production (30 seconds apart, 5 an hour per number), so a test script should keep its session instead of signing in again and again.

## The three apps

| App | Start at | Screens |
|---|---|---|
| Customer (mobile-first) | `/login` | Sign-in (phone and code) → Profile setup → My card with a rotating QR → Card details → Rewards (vouchers) → Offers → Outlets → History → Notifications → Profile |
| Cashier | `/cashier/scan` | Scan the member QR (camera, where the browser supports it) or search by number or name, add a new customer, redeem a voucher by code → Add stamps (with undo and the daily limit) or give a reward → Customers → Today |
| Management (web) | `/owner` | Dashboard → Customers (groups, search, export CSV) → Customer detail (adjust stamps, notes) → Loyalty card setup → Offers → SMS campaigns → Staff → Settings (outlets and opening hours) |

**Try the live link.** The apps are three views of one database, so you can watch them agree:

- Sign in as Tanvir on `/cards`, and as Rakib in another window on `/cashier/scan`. Search `000101` and add a stamp: the card presses a stamp in within a few seconds, with no reload. Completing a card unlocks a reward voucher on the customer side, and giving it at the counter (by customer or by typing its code) marks it used.
- `/owner/offers` plus the customer's `/offers`: publish, edit or pause an offer and the customer's offers bar follows.
- `/owner/program`: change the card name or colour, the reward items or the rules and every screen redraws. Lowering the stamps per card completes the cards of customers who already have enough (the screen shows how many first), and the cashier screen enforces the daily limit.
- `/owner/customers/…`: adjusting a customer's stamps by hand (with a reason) changes their card and is recorded in the ledger and the audit log.
- `/owner/settings`: change an outlet's opening hours and the customer's Outlets page shows open or closed to match.

Every screen supports **বাংলা / English** and **light / dark** (top-right switches). Both choices are saved in cookies, so they stay the same on every page and render on the server without flicker. All layouts work from 360px phones to large desktops.

## How the backend is built

```
Browser ──► src/app/api/**/route.ts ──► src/server/domain/*  ──► Prisma ──► Postgres
            (thin handlers)             (the rules, in transactions)
```

- **Route handlers stay thin.** `publicRoute`, `customerRoute` and `staffRoute` (`src/server/http.ts`) do the same things for every endpoint: check the request origin, authenticate, check the role's permission, validate params, query and body with Zod, and turn any failure into the same JSON error (`{ error: { code, message, details }, requestId }`). The handler itself only calls a domain function.
- **Domain functions own the rules** (`src/server/domain`): stamps, vouchers, offers, customers, the program, the dashboard, SMS, staff, audit. They take the Prisma client or a transaction, so a caller can join a transaction.
- **Pure rules are shared.** `src/lib/domain` (card arithmetic, daily room, undo window, permissions, phone and time handling) has no server code, so the apps and the server agree and the rules are unit tested without a database. Request and response shapes are in `src/lib/contracts` (DTOs and Zod schemas, the error codes).
- **The apps use one client layer**, `src/lib/api`: a fetcher that turns every failure into an `ApiError` with the server's code, SWR hooks, and adapters that map DTOs onto the UI's own types. A 401 anywhere sends the person to sign in.

### Data design

- **The stamp ledger is append-only.** `StampEntry` rows are never updated or deleted (database triggers refuse it). An undo is a new row that reverses another. `Card` holds counters as a cache, and the invariant `stamps = lifetimeStamps − Σ stamps used by the card's vouchers` is checked by the tests and by `npm run db:verify`.
- **One lock per customer.** Every write that changes a card first locks that card row (`SELECT … FOR UPDATE`), after taking the program row shared, always in that order. Two cashiers stamping the same customer cannot overspend the daily limit or lose a stamp.
- **Retries are safe.** A stamp request carries an idempotency key, unique per cashier. If the connection drops after the server committed, pressing the button again returns the first result instead of stamping twice.
- **Vouchers snapshot their title and items** when issued, so changing the program never rewrites a reward a customer already holds. A voucher is redeemed by one atomic compare-and-swap update, so it works once even if two cashiers press at the same moment. "Ready", "used" and "expired" are derived, never stored.
- **The program is one row with a version.** Saving needs the version you started from, so two editors cannot overwrite each other, and every change is written to the audit log with before and after.
- **All "days" are Dhaka days** (Asia/Dhaka, UTC+6), whatever the server or phone time zone is: the daily limit, visits, "today" and the dashboard all agree.
- **Constraints live in the database too** (CHECK constraints and triggers in `prisma/migrations/…_invariants`), so a bug in the code cannot write a stamp count below zero or redeem a voucher without saying who did it.

### Security

- **Customers** sign in with a phone number and a 6-digit code (5 minutes, 5 tries, 30 seconds between codes, 5 an hour per number, 20 an hour per IP, stored only as an HMAC). **Staff** sign in with a phone number and a 6-digit PIN (scrypt with a pepper; 5 wrong tries lock the account for 15 minutes). **Managers and owners** also enter a one-time code.
- **Sessions are opaque random tokens**, stored hashed, in `httpOnly` `SameSite=Lax` cookies (`__Host-` prefixed and `Secure` in production). Customer sessions last 90 days. Staff sessions last 12 hours and end after 30 minutes idle. Switching a staff account off, changing its role or outlet, or resetting its PIN ends its sessions at once.
- **The member QR rotates** every 90 seconds (signed), so a screenshot of it is useless.
- **A cashier who hits the daily limit needs a manager's PIN** typed by the manager; a manager or owner can override directly. Both are recorded with who approved.
- **Roles** follow the permission matrix in `src/lib/domain/permissions.ts`, enforced on every request (the apps only use it to hide what a person cannot use). Cashiers see masked phone numbers.
- Logs are one JSON line each, with phone numbers masked and no PINs, codes or tokens. The development console SMS provider prints message text (codes included) on purpose, and is refused in production.

### Real-time

The customer's card refreshes within seconds of a stamp: the app asks `/api/me/version` (a tiny request, a few indexed queries) every two seconds while the screen is visible and reloads the wallet when it changes, then plays the stamp animation from the difference. This works on any host, including serverless, without keeping connections open. It is plenty for a pilot; with many thousands of phones open at once, replace it with a push channel (server-sent events or a managed realtime service) behind the same wallet loader.

### API overview

| Area | Endpoints |
|---|---|
| Public | `GET /api/health`, `/api/program`, `/api/branches` |
| Sign-in | `POST /api/auth/otp/request`, `/api/auth/otp/verify` (customers); `/api/auth/staff/login`, `/api/auth/staff/otp` (staff); `GET /api/auth/session`; `POST /api/auth/logout` |
| Customer | `/api/me`, `/api/me/wallet`, `/api/me/version`, `/api/me/qr`, `/api/me/history`, `/api/me/notifications`, `/api/me/offers/[id]/claim`, `/api/me/delete` |
| Cashier | `/api/cashier/me`, `/scan`, `/customers` (search, add), `/customers/[id]`, `/stamps`, `/stamps/[id]/undo`, `/vouchers/lookup`, `/vouchers/[id]/redeem`, `/today`; `POST /api/staff/pin` (change own PIN) |
| Management | `/api/admin/dashboard`, `/customers` (+ `[id]`, `activity`, `adjust`, `note`, `export`), `/program` (+ `impact`), `/offers` (+ `[id]`, `status`), `/staff` (+ `[id]`, `reset-pin`), `/sms` (+ `campaigns`, `send`), `/branches` (+ `[id]`) |
| Scheduler | `GET/POST /api/cron/sms` (needs `CRON_SECRET`) |

## Project structure

```
prisma/              schema.prisma, migrations (incl. constraints and triggers), seed.ts
scripts/             verify-ledger.ts, create-owner.ts
tests/               unit/ (pure rules, helpers), db/ (the rules against a real database), setup/
src/
  app/
    (auth)/          customer login and profile setup
    (customer)/      cards (+ cards/details), rewards (+ rewards/[id]), offers, outlets, history, notifications, profile
    cashier/         scan, customers (+ customers/[id]), today
    (owner)/owner/   dashboard and all management pages
    staff/login      staff sign-in
    api/             the route handlers listed above
    layout.tsx       fonts, theme + language cookies
  components/        ui.tsx primitives, loyalty-card.tsx, the three shells, offer-bar.tsx, toggles.tsx, brand.tsx, otp-input.tsx
  lib/
    api/             client, SWR provider, session, hooks and DTO adapters for each app
    contracts/       DTO types, Zod schemas, error codes shared by server and apps
    domain/          pure rules: card arithmetic, permissions, phone, time, codes
    data.ts          UI types and ChaJoy's reference data (card, outlets, offers) that the seed loads
    program.ts       reward items, card colours, and the helper that builds the live card
    wallet.tsx       the customer app's live view of their card
    i18n.tsx, theme.tsx, format.ts, hours.ts
  server/            env, db, http (route builders), auth/, crypto, sms, log, domain/
  middleware.ts      sends people with no session cookie to the right sign-in
public/brand/        chaJoy logo (light and dark wordmark) and round icon
```

## Commands

```bash
npm run dev                   # development server
npm run build / npm start     # production build and server
npm run typecheck             # tsc --noEmit
npm test                      # unit tests and database tests (see Tests)
npm run db:deploy             # apply migrations (production and CI)
npm run db:migrate            # create and apply a migration while developing the schema
npm run db:seed               # outlets, default program, and in development the demo data
npm run db:verify             # check every card against the ledger and vouchers
npm run db:create-owner -- --phone 01712345678 --name "Name"   # the first owner on a new database
npm run db:studio             # browse the data
```

### Tests

`npm test` runs Vitest: pure-rule unit tests, and database tests that run the real domain code against Postgres. The database tests create a **throwaway schema** in the database `DATABASE_URL` points to, run the migrations in it, and drop it afterwards, so they never touch your data. They cover the stamp and voucher rules, concurrency (two cashiers at once, retries), offers, auth and rate limits, the program, SMS and the audit trail, and finish by checking the ledger invariants.

## Before going live

1. **Connect an SMS gateway.** Sign-in codes and campaigns go through one interface (`SmsProvider` in `src/server/sms.ts`); write one adapter for the contracted gateway (Alpha SMS, SSL Wireless or BulkSMSBD). Until then production refuses `SMS_PROVIDER=console`, and `OTP_MODE=fixed` and `DEV_OTP_CODE` are refused in production on purpose.
2. **Create the first owner:** `npm run db:create-owner -- --phone … --name …`. The demo seed makes no accounts in production. The PIN is printed once; the owner should change it.
3. **Set the secrets** in the host's environment: `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `AUTH_SECRET`, `APP_ORIGIN` (the HTTPS origin; the production cookies are `Secure`), and `CRON_SECRET`.
4. **Schedule `/api/cron/sms`** every few minutes with `Authorization: Bearer <CRON_SECRET>`, from any scheduler (Vercel Cron on a plan that allows minute-level schedules, GitHub Actions, cron-job.org), so scheduled campaigns go out and half-sent ones finish.
5. **Run `npm run db:deploy`** on the production database, and keep Neon's backups on.
6. **Add edge rate limiting** (for example Vercel Firewall) on `/api/auth/*`. The app limits sign-in codes per number and per IP and locks a staff account after five wrong PINs, but a flood of requests is best stopped before it reaches the app.
7. **Replace placeholder reference data** in Settings: outlet coordinates and opening hours start as placeholders.

Known limits:
- Stamp expiry (BR-06) and the minimum purchase are shown but not enforced: the cashier decides that a purchase qualifies.
- A manager who works at several outlets signs in at the first one, and the owner at the main outlet. There is no outlet switcher yet.
- Camera scanning needs a browser that has the `BarcodeDetector` API (Chrome on Android, for example) and otherwise falls back to searching by number.
- The brand profile, customer-experience switches and QR standee on the Settings screen are drawn but not saved (they are marked "Preview only"). Adding an outlet is not built; opening hours can be edited.
- The management dashboard's customer totals count every customer, even when a manager's figures are limited to their outlets.

## Brand tokens

Colours live in `src/app/globals.css` (light and `.dark`) and are exposed to Tailwind in `tailwind.config.ts`:
Primary lime `#97C334` (brand, black text on it), Dark green `#668C1F` (hover / accents), Bright yellow `#F5D900` (stamps, highlights), White `#FFFFFF` (dark-mode text), Black `#171717` (text, mascot, dark background). Rose (rewards), aqua (success) and sky stay as small functional accents. The default language is English.
Fonts: Baloo Da 2 (headings) and Hind Siliguri (body), loaded with `next/font`.

## Writing copy

Use `tx()` from `useI18n()` for inline text, `l()` for `{ bn, en }` objects, and `n()` for numbers:

```tsx
const { tx, l, n } = useI18n();
tx('Stamp দিন', 'Add stamp');      // picks by language
n(1248);                           // "১,২৪৮" in Bangla, "1,248" in English
```
