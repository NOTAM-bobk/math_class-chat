# math_class · chat

Make a group, lock it with a passcode, talk. A **Home chat** always exists so a
fresh deployment is usable straight away.

## Stack

- React 19 + Vite + TypeScript client in `src/`
- One API router in `worker/app.js`, shared by both hosts
- Cloudflare: Worker + static assets + D1 (`wrangler.jsonc`)
- Vercel: static assets + one function + libSQL/Turso (`vercel.json`, `api/chat.js`)

## Local development

```bash
npm ci
npm run worker   # API + local D1 on http://127.0.0.1:8788
npm run dev      # UI on http://localhost:3000, proxies /api to the worker
```

`npm run dev` on its own renders the UI, but the chat needs `npm run worker`
running too. `npm run build` typechecks and writes `dist/`.

## Deploy to Cloudflare

```bash
npx wrangler login
npx wrangler d1 create math-class-chat
# paste the printed database_id into wrangler.jsonc
npm run deploy
```

`npm run deploy` builds and runs `wrangler deploy`. The Worker serves `dist/`
through the `ASSETS` binding and `/api/*` from the `DB` D1 binding. Tables and
the Home chat are created on the first request, so there is no migration step.

## Deploy to Vercel

Vercel has no D1, so the same router runs on an SQLite-compatible libSQL
database — [Turso](https://turso.tech) is the easiest one:

```bash
turso db create math-class-chat
turso db show math-class-chat --url       # libsql://... -> TURSO_DATABASE_URL
turso db tokens create math-class-chat    # -> TURSO_AUTH_TOKEN
```

Import the repository in Vercel (it detects Vite; `vercel.json` supplies the
build, the `/api/*` rewrite to `api/chat.js` and the SPA fallback), then add
these in **Project → Settings → Environment Variables** for all environments:

| Variable | Value |
| --- | --- |
| `TURSO_DATABASE_URL` | the `libsql://…` database URL |
| `TURSO_AUTH_TOKEN` | a database token |

Both are server-side only; nothing about the database reaches the browser.
`LIBSQL_URL` / `LIBSQL_AUTH_TOKEN` are accepted as aliases. As on Cloudflare,
the schema and Home chat are created by the first request.

Locally you can point the Vercel function at the same database with
`vercel dev` and a `.env` file (gitignored).
