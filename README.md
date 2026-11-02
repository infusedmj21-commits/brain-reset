# Brain Reset

A personal web app for the Brain Reset Routine: a daily checklist built around shift types, an arithmetic sprint log, and (in later phases) a memory palace trainer, unprompted.cool sessions with recording, sync between devices and progress charts.

It installs to the iPhone home screen and the computer taskbar from one codebase and works offline.

## Status

| Phase | What | State |
| --- | --- | --- |
| 1 | Installable shell, Today screen, sprint log, JSON export, light and dark look | Done |
| 2 | Memory palace trainer | Next |
| 3 | Unprompted sessions with recording | |
| 4 | Sync between devices (Supabase) | |
| 5 | Weekly review and charts | |
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

Phase 1 stores everything on the device (IndexedDB). Until sync arrives, use **Settings → Export backup** now and then. Each device has its own data until phase 4.

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
  logic/dates.js     local-date helpers (Monday-start weeks, DST-safe)
  logic/routine.js   day templates, unprompted-day rule, streaks, TikTok schedule
  views/             one file per screen; look.js holds colours, shapes and emoji per habit
tests/               Vitest unit tests
```

Every synced row has a device-generated `id`, `updated_at`, `deleted` and `user_id`, and every write queues an `outbox` entry, so phase 4 sync can push to Supabase without changing the data shape. Rows that are naturally one-per-day (day plans, habit ticks, sprint scores) use date-based ids so two devices logging the same day update one row instead of creating duplicates.
