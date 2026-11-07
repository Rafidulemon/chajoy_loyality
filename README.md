# chaJoy loyality

Digital loyalty stamp card for **ChaJoy Ice Cream and Tea**. This is a single-vendor product: ChaJoy is the only brand, with several branches. This is the **frontend** (Next.js) with sample data.

## Run it

You need **Node.js 20 or newer** (check with `node -v`).

```bash
cd "D:\My projects\chaJoy_loyality"
npm install
npm run dev
```

Open http://localhost:3000. The home page links to the three apps.

For a production build: `npm run build` then `npm start`.

## What's inside

| App | Start at | Screens |
|---|---|---|
| Customer (mobile-first) | `/login` | Login (OTP) → Profile setup → My card + QR → Card details → Rewards (vouchers) → Offers → Outlets → History → Notifications → Profile |
| Cashier | `/cashier/scan` | Scan QR / search by phone (or add a new customer) / redeem a voucher by code → Add stamps (with undo) or give a reward → Customers → Today |
| Management (web) | `/owner` | Dashboard → Customers (add, export CSV) → Customer detail (adjust stamps) → Loyalty card setup → Offers (create, pause, SMS) → Staff → SMS campaigns → Settings (outlets and opening hours) |

**Try the live link:** the three apps share one in-memory store and mirror it across browser tabs, so open them side by side.
- `/cards` plus `/cashier/customers/tanvir`: stamps added in the cashier tab press onto the card in the customer tab, completing the card unlocks a reward voucher, and giving that voucher (or typing its code on `/cashier/scan`) marks it redeemed on the customer side.
- `/owner/offers` plus `/cards`: publish, edit or pause an offer in management and it appears in the customer's glossy offers bar. Claims count back up on the Offers screen.
- `/owner/customers/tanvir`: adjusting stamps there changes the customer's card. The dashboard and the cashier's Today screen count everything that happens.
- `/owner/program` plus `/cards`: change the stamps needed, the reward items, the rules, the card name or the card colour and the customer's card redraws. Lowering the stamps needed completes the cards of customers who already have enough, and the cashier screen enforces the daily limit.
- `/owner/settings`: change an outlet's opening hours and the customer's Outlets page shows open or closed to match.
A reload resets everything to the sample data.

Every screen supports **বাংলা / English** and **light / dark** (top-right switches). Both choices are saved in cookies, so they stay the same on every page and render on the server without flicker. All layouts work from 360px phones to large desktops.

## Project structure

```
src/
  app/
    (auth)/          login, setup             (customer sign-in, no tab bar)
    (customer)/      cards (+ cards/details), rewards (+ rewards/[id]), offers, outlets, history, notifications, profile
    cashier/         scan, customers, today
    (owner)/owner/   dashboard and all management pages (with sidebar)
    layout.tsx       fonts, theme + language cookies
    globals.css      colour tokens for light and dark mode
  components/
    ui.tsx           Button, Card, Badge, Switch, Segmented, Stepper, Field…
    loyalty-card.tsx the stamp card used everywhere
    customer-shell.tsx, cashier-shell.tsx, owner-shell.tsx
    offer-bar.tsx    glossy offers slider under the customer header
    toggles.tsx      language + theme switches
    brand.tsx        chaJoy loyality logo / icon
  lib/
    data.ts          sample data (replace with API calls)
    store.tsx        shared in-memory backend: cards, vouchers, offers, outlet hours, activity (all three apps)
    wallet.tsx       the customer app's view of the store
    hours.ts         opening-hours helpers
    program.ts       loyalty program settings, reward items, card colours and the helpers that build the live card
    i18n.tsx         tx('বাংলা', 'English'), n(1248) → ১,২৪৮
    theme.tsx        light / dark
public/brand/        chaJoy logo (light + dark wordmark) and round icon
```

## Brand tokens

Colours live in `src/app/globals.css` (light and `.dark`) and are exposed to Tailwind in `tailwind.config.ts`:
Primary lime `#97C334` (brand, black text on it), Dark green `#668C1F` (hover / accents), Bright yellow `#F5D900` (stamps, highlights), White `#FFFFFF` (dark-mode text), Black `#171717` (text, mascot, dark background). Rose (rewards), aqua (success) and sky stay as small functional accents. The default language is English.
Fonts: Baloo Da 2 (headings) and Hind Siliguri (body), loaded with `next/font`.

## Writing copy

Use `tx()` from `useI18n()` for inline text, `l()` for `{ bn, en }` objects in data, and `n()` for numbers:

```tsx
const { tx, l, n } = useI18n();
tx('Stamp দিন', 'Add stamp');      // picks by language
n(1248);                           // "১,২৪৮" in Bangla, "1,248" in English
```

## Next steps (backend)

Everything currently uses `src/lib/data.ts`. To make it real:

1. **Database:** PostgreSQL with Prisma or Drizzle (tables: branches, customers, stamps, rewards, staff, sms_campaigns; no shop/tenant table, ChaJoy is the only vendor).
2. **Auth:** phone + OTP via a local SMS gateway (SSL Wireless, BulkSMSBD, Alpha SMS); staff PIN login.
3. **QR scanning:** replace the demo tile on `/cashier/scan` with a camera scanner such as `html5-qrcode`.
4. **Server actions or API routes** for adding stamps (with the daily limit and fraud checks), redeeming rewards, and sending SMS.
