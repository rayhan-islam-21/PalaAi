# Pala AI

Mobile-first Bangla SaaS for Bangladesh: **Group Pass** (4–5 friends split a monthly Claude API budget, each with a private login, private chats, an equal allowance and a daily time slot) and **Personal Wallet** (prepaid BDT credits). Payments are verified manually against your bKash/Nagad statement.

Chat is our own web app calling the official Anthropic Messages API from the server. It is **not** a Claude Pro subscription and gives no access to claude.ai, Claude Code or Pro features. No accounts, passwords or cookies are shared.

Stack: Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · PostgreSQL + Prisma 6 · Better Auth (email/password) · `@anthropic-ai/sdk`. Works with Neon + Vercel.

## Quick start (local demo)

```bash
cp .env.example .env            # then set PALA_DEMO_MODE="true" and a BETTER_AUTH_SECRET
npm install
npx prisma migrate deploy       # applies prisma/migrations
npm run db:seed:demo            # demo users + a clearly-labelled placeholder bKash method
npm run build && npm start      # or: npm run dev
```

Open http://localhost:3000.

| Account | Password | Notes |
|---|---|---|
| `admin@pala.test` | `demo12345` | Admin panel at `/admin` |
| `demo1@pala.test` … `demo6@pala.test` | `demo12345` | Customers |

Demo mode (`PALA_DEMO_MODE="true"`) does three things only: it uses a **mock AI provider** labelled "ডেমো মক AI (আসল Claude নয়)", it enables a **simulated clock** (Admin → Settings → Demo clock) so you can test slots at any hour, and it relaxes login rate limiting so one machine can play several users. It never approves payments automatically. It is refused when `VERCEL_ENV=production`. A yellow banner shows on every page while it is on.

In the mock, a message containing `[[fail]]` simulates an API failure before output, and `[[fail-mid]]` simulates a failure mid-stream.

### Try a 5-person group

1. Admin → Settings → Demo clock: set today at `09:30` (Dhaka) so the first slot (09:00–11:30) is active.
2. Log in as `demo1` (use separate browser profiles or private windows per user) → **গ্রুপ তৈরি করুন** → choose **৫ জন** (৳480 + ৳25 = ৳505 each) → pick slot 09:00–11:30.
3. Copy the 6-letter code. As `demo2`…`demo5`: **কোড দিয়ে গ্রুপে যোগ দিন** → enter the code → pick a free slot.
4. Each member: group page → **পেমেন্ট করুন** → enter any sender number (`01712345678`) and a unique TrxID (e.g. `DEMO0001`, `DEMO0002`, …).
5. Admin → Payments → **Approve** each. The group activates when the 5th share is approved.
6. As `demo1`: the dashboard shows "এখন আপনার সময় চলছে" → Chat. The composer shows **Group allowance**; after each reply you see the charge and the remaining allowance.
7. As `demo2` (slot 11:30–14:00): chat shows "এখন আপনার গ্রুপের সময় নয়" with a countdown, and the wallet is used only if the user taps **ব্যক্তিগত ওয়ালেট ব্যবহার করুন**.

Personal wallet: as `demo6`, Wallet → ৳100 → submit a TrxID → admin approves → chat with the wallet → Wallet shows the new balance and the history.

## How the money works

All amounts are integer poisha (1 BDT = 100 poisha).

- **Group price** = pool ÷ seats + service fee. Seed: pool ৳2,400 and fee ৳25 give ৳600 + ৳25 = **৳625** (4 people) or ৳480 + ৳25 = **৳505** (5 people). Admin can edit the pool and the fee (the fee is kept within ৳20–30). The quote is **locked per cycle**; changes apply to new groups and renewals.
- Each member's **allowance** is their usage share (৳600 or ৳480). Chats in their slot are charged against it at provider cost (group markup defaults to 0%).
- **Usage charge** = (input tokens × input price + output tokens × output price) × BDT rate × (1 + markup), from the usage Anthropic reports. Model ID, USD prices per million tokens, the exchange rate and the markups are editable in Admin → Settings. Seed: `claude-opus-5-5`, $4 / $20 per MTok, ৳122/USD, wallet markup 20%.
- **Reservation**: before calling the API the server counts the input tokens (Anthropic token-counting endpoint), caps `max_tokens` to what the balance can afford, and holds that amount with a conditional, atomic update. After the response it charges the actual usage and releases the rest. Each request has a client ID, so retries never generate or charge twice. Generation finishes and is settled even if the browser disconnects. Failures before any output are not charged. Reservations stuck by a crashed worker are released after 10 minutes. Database CHECK constraints prevent negative balances.
- **Activation**: the 30-day cycle starts only when every seat is filled and every share is approved. Service fees are recognized as earned at activation.
- **Cancellation**: unpaid members can leave a forming group. If the owner (or admin) cancels after people have paid, each paid share becomes a refund owed. A claim approved after its share was voided also becomes a refund. Admin sends the money back and records the payout TrxID. Each step is written to the audit log.

Admin → Overview reports these separately: collected payments, pending claims, unspent wallet balances, unspent group allowances, money held for forming groups, refunds owed and paid, expired unused allowance, service fees earned, usage charged, and estimated provider cost. The usage pool is never counted as profit.

## Payments (manual verification)

1. Admin → Settings → Payment receiving methods: enter **your** bKash/Nagad number, account type and Bangla instructions, then enable the method. If no method is enabled, customers see "পেমেন্ট এখন বন্ধ আছে".
2. The customer picks a wallet top-up or their own group share, sees the exact amount, pays outside the app, and submits the sender number and TrxID. The claim shows as **যাচাই চলছে**.
3. Admin → Payments: compare against your merchant statement, then Approve or Reject. A rejection requires a note, which the customer sees.
4. Approval happens exactly once (a conditional state change in one transaction, plus idempotent ledger keys). A TrxID can be used only once per provider.

There is no payment-gateway integration. Nothing in the app claims that a gateway is connected.

## Production setup (Neon + Vercel)

1. Create a Neon database. Set `DATABASE_URL` (pooled) and `DIRECT_URL` (direct).
2. Set the env vars from `.env.example` in Vercel: `BETTER_AUTH_SECRET` (`openssl rand -base64 32`), `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` (your https domain), `ANTHROPIC_API_KEY`, and `PALA_DEMO_MODE="false"`.
3. Run migrations: `npx prisma migrate deploy` (for example as a Vercel build step or from CI), then `npm run db:seed` (settings only; no users and no payment numbers).
4. Create your admin: `ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-long-password' npm run admin:create`.
5. In Admin → Settings, configure your payment numbers and check the model ID, token prices and exchange rate.

The chat route streams for up to 300 s (`maxDuration`). That needs a Vercel plan that allows it; otherwise lower `maxOutputTokens`.

## Tests

```bash
# Unit/integration tests against a throwaway database (name must end in _test; its schema is dropped and recreated)
createdb pala_test
TEST_DATABASE_URL="postgresql://postgres@localhost:5432/pala_test" npm test

npm run typecheck
npm run build

# Browser journey (app running in demo mode with demo seed): full 5-person group + wallet flow on a Pixel 7 viewport
BASE_URL=http://localhost:3000 node e2e/journey.mjs
```

The tests cover: the pricing calculator; Dhaka slot math with an injected clock; a full 5-person journey; slot, cycle and expiry enforcement and renewal; two users racing for the last seat (exactly one wins); concurrent final approvals activating once; duplicate approval and duplicate TrxIDs; leaving, cancellation and the refund workflow; the wallet journey; insufficient funds; the affordability cap; concurrent requests never overdrawing; idempotent retries; API failure before and during output; idempotent settlement; stale-reservation release; the mock labelling; cross-user conversation access; and provider selection (mock only in demo, chat disabled without a key).

## Project layout

```
prisma/                schema, migrations, seed (prod-safe) and seed-demo
src/lib/services/      groups.ts, payments.ts, chat.ts — business rules (take `now` for testability)
src/lib/ai/provider.ts Anthropic streaming provider + demo mock
src/lib/pricing.ts     quote + token→BDT math (BigInt fixed-point)
src/lib/slots.ts       Asia/Dhaka slot math
src/app/               customer pages (Bangla), /admin (English), /api/chat (NDJSON stream)
tests/, e2e/           vitest integration tests, Playwright journey
```
