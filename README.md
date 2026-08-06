# Moonwire

A self-hosted, password-protected, multi-board kanban application whose complete
state can be read and edited by **humans** (web UI) or **authenticated AI agents**
(bearer tokens) through the same versioned REST API.

Built for **Cloudflare Workers**: a Hono API + compiled React SPA in one Worker,
with **D1** (SQLite) for data and **R2** for image bytes. Deployed with `wrangler`.
Runs comfortably on Cloudflare's **free plan**.

- One Worker serves `/api/v1`, `/health`, `/openapi.json`, `/docs`, and the SPA.
- Humans authenticate with a secure `HttpOnly` session cookie; agents use
  separately-revocable **read** or **write** bearer tokens.
- Boards → columns → cards, Markdown descriptions, and multiple image attachments.
- Stable prefixed ULIDs, deterministic ordering, optimistic concurrency (`version`),
  and a documented OpenAPI surface.

> **Why not the original Node/Fastify/SQLite/Docker stack?** The Workers runtime has
> no native modules or persistent filesystem, so the equivalents are: Fastify→Hono,
> better-sqlite3→D1, `sharp`→Cloudflare on-the-fly sizing / client scaling,
> `@node-rs/argon2`→PBKDF2 (WebCrypto), local `/data`→R2 + D1. The API contract,
> the Moonwire design, and the accessibility guarantees are unchanged.

## Tech stack

Node 22 · TypeScript · Hono · React 19 · Vite · Drizzle ORM · D1 · R2 · Zod ·
WebCrypto (PBKDF2) · @dnd-kit · Vitest · Testing Library · Wrangler.

## Project layout

```
src/worker/            Cloudflare Worker (Hono API)
  app.ts index.ts      app composition + fetch entry (API vs. static assets)
  config.ts types.ts   env/bindings + typed config
  db/                  Drizzle D1 schema + client
  lib/                 ids, errors, ordering, image sniffing, auth (crypto+middleware)
  modules/             auth · boards · attachments · operations
src/shared/api.ts      wire types shared by server + client
src/client/            React SPA (Moonwire visual system, board UI, drag-and-drop)
migrations/            generated D1 SQL
tests/                 unit (node) + client (jsdom)
```

---

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars          # sets SESSION_SECRET for local dev
npm run db:migrate:local                 # apply migrations to the local D1
```

Run the API + assets on `http://localhost:8787`:

```bash
npm run build        # compile the React client to dist/client
npm run dev:worker   # wrangler dev
```

For a fast client feedback loop with HMR, run Vite on `:5173` (it proxies API
calls to `:8787`):

```bash
npm run dev          # in a second terminal, alongside `npm run dev:worker`
```

### Verify

```bash
npm run check        # typecheck (client + worker) + tests
```

Expected health response:

```json
{ "status": "ok", "database": "ok" }
```

---

## Deploying to Cloudflare

1. **Authenticate** wrangler. Either OAuth:

   ```bash
   npx wrangler login
   ```

   …or, if the browser callback hangs (common on remote shells / behind a
   firewall), use an **API token** instead — no browser needed. Create one at
   <https://dash.cloudflare.com/profile/api-tokens> → *Create Custom Token* with:
   *Workers Scripts · Edit*, *D1 · Edit*, *Workers R2 Storage · Edit*, and
   *Account Settings · Read*. Then, in the same terminal for all following
   commands:

   ```bash
   export CLOUDFLARE_API_TOKEN=your_token_here   # Windows cmd: set CLOUDFLARE_API_TOKEN=...
   ```

   Verify with `npx wrangler whoami`.

2. **Create the D1 database** and put the returned id into `wrangler.jsonc` at
   `d1_databases[0].database_id` (on the `DB` binding — if wrangler offers to add
   it for you it creates a *second* binding named `moonwire`; use the `DB` one the
   app reads and delete the duplicate):

   ```bash
   npx wrangler d1 create moonwire
   ```

3. **Create the R2 bucket** (same note: keep the `UPLOADS` binding):

   ```bash
   npx wrangler r2 bucket create moonwire-uploads
   ```

4. **Set the session secret** (never commit it):

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))" | npx wrangler secret put SESSION_SECRET
   ```

5. **Set the production origin.** In `wrangler.jsonc` `vars`, set `APP_ORIGIN`
   to your public origin. It is the CSRF allow-list for cookie-authenticated
   mutations and accepts a comma-separated list. **Get this right before
   first-run setup** — if it doesn't match the origin in the browser, the setup
   POST is rejected (403).

   Local dev needs no override: `localhost` origins are always allowed, and the
   session cookie is only marked `Secure` when actually served over HTTPS (so it
   works on `http://localhost` in dev and stays Secure in production).

6. **Custom domain (optional).** Add a route so the Worker serves your domain
   (the zone must be on the same Cloudflare account; wrangler provisions the
   hostname + certificate on deploy):

   ```jsonc
   "routes": [{ "pattern": "kanban.example.com", "custom_domain": true }]
   ```

   Set `APP_ORIGIN` to that same `https://…` origin. To turn off the
   `*.workers.dev` URL entirely, also add `"workers_dev": false`.

7. **Apply migrations to the remote D1** and **deploy:**

   ```bash
   npm run db:migrate:remote
   npm run deploy         # builds the client, then `wrangler deploy`
   ```

On first visit you'll be prompted to create the administrator account (this
one-time setup is refused afterwards).

### Free-plan notes

D1 and R2 are included in the Workers Free plan (at the time of writing: D1
5 GB storage with generous daily row limits; R2 10 GB storage + Class A/B request
allowances). A personal Moonwire instance fits comfortably. Check
<https://developers.cloudflare.com/> for current limits.

### Backups

D1 has automatic **Time Travel** (point-in-time restore for the retention window) —
this replaces the SQLite online-backup file copies of a server deployment.

```bash
npx wrangler d1 export moonwire --remote --output backup.sql   # physical backup
```

The app also exposes a **logical** JSON export/restore:

- `GET /api/v1/export` — full dataset as a versioned JSON envelope (metadata; image
  bytes stay in R2).
- `POST /api/v1/restore` — **admin only**; validates the payload and every
  referenced image's bytes must still exist in R2, then replaces all logical
  records atomically. Use D1 Time Travel to undo if needed.

---

## Using the API as an agent

Create a token in **Settings → Agent tokens** (choose read or write). The
plaintext `mw_…` token is shown **once**. Then:

```bash
TOKEN=mw_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
BASE=https://moonwire.<you>.workers.dev

# List boards
curl -H "Authorization: Bearer $TOKEN" $BASE/api/v1/boards

# Read a full board (columns + cards + attachments)
curl -H "Authorization: Bearer $TOKEN" $BASE/api/v1/boards/$BOARD_ID/snapshot

# Create a card
curl -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -X POST $BASE/api/v1/columns/$COLUMN_ID/cards \
  -d '{"title":"Investigate flaky test","description":"# Steps\n- reproduce"}'

# Move a card (positioned between two neighbours; version-checked)
curl -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -X POST $BASE/api/v1/cards/$CARD_ID/move \
  -d '{"toColumnId":"'$COLUMN_ID'","beforeId":null,"afterId":null,"version":1}'

# Download an image
curl -H "Authorization: Bearer $TOKEN" \
  $BASE/api/v1/attachments/$ATTACHMENT_ID/content -o image.png
```

- **Read tokens** can enumerate everything and download images but get `403` on
  any mutation. **Write tokens** can create/edit/move/delete.
- Revoking a token takes effect immediately.
- Every mutable resource carries a `version`; send it back on updates/moves. A
  stale value returns `409 CONFLICT` — refetch the snapshot and retry.
- Interactive docs: **`/docs`** (rendered from **`/openapi.json`**).

### Error shape

All errors share one envelope:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid request", "fields": { "title": "Required" } } }
```

Codes: `VALIDATION_ERROR` (400), `UNAUTHENTICATED` (401), `FORBIDDEN` (403),
`NOT_FOUND` (404), `CONFLICT` / `RELOCATION_REQUIRED` (409),
`UNSUPPORTED_MEDIA_TYPE` (415), `INTERNAL_ERROR` (500).

---

## Security notes

- Passwords hashed with PBKDF2-SHA256 via WebCrypto at 100k iterations (the
  Workers runtime ceiling); the count is stored per-hash so it can be raised if
  the platform limit changes.
- Session cookie is `HttpOnly`, `SameSite=Strict`, `Secure` (configurable), with a
  server-side expiry; cookie-authenticated mutations are origin-checked.
- Agent tokens are stored only as SHA-256 hashes; the plaintext is shown once.
- Uploads are validated by magic bytes (not client MIME/filename), bounded in size
  and pixel count, and stored under server-generated R2 keys. Image responses set
  `Content-Disposition: inline` and `X-Content-Type-Options: nosniff`.

## Migrating to Postgres later

The domain layer is isolated behind repositories and Drizzle. Moving to Postgres
(via Hyperdrive or another host) means swapping the Drizzle driver and the D1
`batch()` calls for Postgres transactions — the routes, schemas, and client are
unaffected.
