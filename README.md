# Artemis (formerly Brain Reset)

Michael’s life dashboard (Home, Ventures, Money, Health) wrapped around the Brain Reset Routine: a daily checklist built around shift types, an arithmetic sprint log, and (in later phases) a memory palace trainer, unprompted.cool sessions with recording, sync between devices and progress charts.

It installs to the iPhone home screen and the computer taskbar from one codebase and works offline.

## Status

| Phase | What | State |
| --- | --- | --- |
| 1 | Installable shell, Today screen, sprint log, JSON export, light and dark look | Done |
| 2 | Memory palace trainer | Done |
| 3 | Unprompted sessions (recording in the app comes later) | Done |
| — | In-app arithmetic sprint (Zetamac rules and settings) | Done |
| 4 | Sync between devices (Supabase) | Done |
| 5a | Artemis: rename, tab bar, Home, Ventures with scoring and today’s 3 | Done |
| 5b | Money: shifts by role and rate, expected vs actual pay, Monzo CSV import, spending | Done |
| 5c | Health: Hevy-style routines and workout logging, PRs, rest timer, Hevy import | Done |
| 5d | Skipped days (comeback day, welcome back with reasons, gaps on the calendar) and the weekly review | Done |
| 6 | AI review of recorded talks | |

## Deploy (one-off, about 5 minutes)

1. Go to [vercel.com](https://vercel.com), sign in with GitHub, and choose **Add New → Project**.
2. Import `brain-reset`. Vercel detects Vite automatically: build command `npm run build`, output folder `dist`.
3. Click **Deploy**. Every push to `main` redeploys automatically after this.

## Install

- **iPhone:** open the site in Safari → Share → **Add to Home Screen**. Always open it from the icon: the home screen app keeps its own storage, separate from Safari.
- **Computer (Chrome or Edge):** click the install icon at the right of the address bar. It gets its own window and taskbar icon.
- **Mac Safari:** File → **Add to Dock**.

## Your data

Each device keeps its own copy in IndexedDB, so the app works offline. Sign in under **Settings → Sync** with your email and password and changes go up to Supabase and come down on your other devices: on launch, when the app comes back to the foreground, when you go back online, a few seconds after each change, and every 5 minutes while open. If two devices edit the same thing, the newer edit wins. Photos in notes (`blobs`) are not synced yet.

### Supabase setup (one-off)

1. **SQL Editor → New query**, paste `supabase/schema.sql`, **Run**.
2. **Authentication → Sign In / Providers → Email**: turn off **Confirm email**, so creating the account needs no email. (Sign-in is by password in the app because an emailed link would open Safari, not the home screen app.)
3. On the first device use **Create account**; everywhere else, **Sign in**. Then **Authentication → Sign In / Providers → turn off "Allow new users to sign up"** so nobody else can make an account.

The URL and publishable key live in `src/config.js` (Vercel env vars `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` override them). Never put the `service_role` key in the app.

## Development

```bash
npm install
npm run dev      # local dev server
npm test         # unit tests (routine logic + database)
npm run build    # production build into dist/
```

### Structure

```
src/
  main.js            router, tab bar, service worker registration
  theme.js           Auto / Light / Dark preference and greeting name
  db.js              Dexie schema, sync-ready save/remove, export/import
  config.js          Supabase URL and publishable key
  sync-core.js       push outbox, pull by server sequence, newer-wins merge (unit tested)
  sync.js            Supabase client, email-code sign-in, when to sync
  logic/dates.js     local-date helpers (Monday-start weeks, DST-safe)
  logic/routine.js   day templates, unprompted-day rule, streaks, TikTok schedule
  logic/palace.js    word picking, lenient recall scoring, weekly test history
  logic/unprompted.js session steps, timestamp-based countdowns, next-day recall
  logic/words.js     bundled list of easy-to-picture words
  logic/scoring.js   (Impact + Urgency) ÷ Effort, anchors, bands, rescore rule
  logic/money.js     roles and rates, shift pay (rounded half up), weekly pay, Monzo CSV parsing and classifying
  logic/payroll.js   weekly Wednesday paydays for Thu–Wed periods a week behind; expected vs received per payday
  logic/insights.js  monthly earned/paid/spent, categories (fixed colours), calendar, weekdays, top shops, earnings by venue/role
  data/money.js      roles, shifts, payments, transactions, Monzo import (deduplicated by transaction ID)
  logic/health.js    Michael's split (gym + home versions), double-progression aims, e1RM, PRs, week plan, Hevy CSV
  data/health.js     exercises, routines, workouts and sets, daily ticks, Hevy import
  logic/review.js    active days, gaps of 2+ days, best streak, missed days with reasons, review week
  data/checkins.js   gap reasons and weekly reviews
  data/ventures.js   ventures, scores, tasks, today’s 3 (seeds Halden Labs, Etsy prints, Amazon FBA)
  logic/arithmetic.js sprint settings (Zetamac defaults), problem generation, round stats
  views/             one file per screen; look.js holds colours, shapes and emoji per habit
tests/               Vitest unit tests
```

Every synced row has a device-generated `id`, `updated_at`, `deleted` and `user_id`, and every write queues an `outbox` entry, so sync pushes to Supabase without changing the data shape. Rows that are naturally one-per-day (day plans, habit ticks, sprint scores) use date-based ids so two devices logging the same day update one row instead of creating duplicates.
