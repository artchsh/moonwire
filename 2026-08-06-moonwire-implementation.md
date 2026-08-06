# Moonwire Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted, password-protected multi-board kanban application whose complete state can be read and edited by humans or authenticated AI agents.

**Architecture:** One Node.js TypeScript process serves a Fastify REST API and a compiled React application. A shared domain layer owns all mutations, Drizzle persists records to WAL-mode SQLite, and image bytes live beneath the same mounted `/data` directory. UI requests and agent requests use the same versioned API.

**Tech Stack:** Node.js 22, TypeScript, Fastify, React 19, Vite, Drizzle ORM, better-sqlite3, Zod, `@fastify/swagger`, `@fastify/static`, `@node-rs/argon2`, `sharp`, `@dnd-kit`, Vitest, Testing Library, Playwright, Docker Compose.

## Global Constraints

- Run exactly one writable application container per SQLite data directory.
- Store the database, original images, thumbnails, and backups below `/data`.
- Use SQLite WAL mode and foreign keys for every connection.
- Version public endpoints beneath `/api/v1`; expose `/health`, `/openapi.json`, and `/docs`.
- Use stable prefixed ULIDs for boards, columns, cards, attachments, and tokens.
- Authenticate humans with a secure HTTP-only session cookie and agents with separately revocable bearer tokens.
- Support read-only and read-write agent tokens.
- Keep the first release limited to boards, columns, cards, Markdown descriptions, and multiple image attachments.
- Preserve keyboard operation, visible focus, reduced motion, touch interaction, and WCAG AA contrast.
- Use a restrained nocturnal Moonwire visual system; avoid generic dashboard chrome, excessive neon glow, and ornamental cyberpunk clutter.

---

## Planned file map

- `src/server/app.ts`: composes Fastify plugins and routes.
- `src/server/index.ts`: validates runtime configuration and starts the server.
- `src/server/config.ts`: typed environment and data-directory configuration.
- `src/server/db/{client,schema,migrate}.ts`: SQLite connection, schema, and migrations.
- `src/server/lib/{ids,errors,ordering,auth}.ts`: stable cross-module primitives.
- `src/server/modules/auth/*`: setup, login, logout, session, and token management.
- `src/server/modules/boards/*`: board, column, and card domain operations and routes.
- `src/server/modules/attachments/*`: safe image upload, metadata, thumbnails, streaming, and deletion.
- `src/server/modules/operations/*`: health, export, restore, backup, and storage information.
- `src/shared/api.ts`: shared request/response types used by server and UI.
- `src/client/*`: React application, API client, visual system, board screen, drag behavior, card panel, settings, and authentication.
- `tests/{unit,integration,e2e}/*`: domain, API, browser, accessibility, and persistence tests.
- `Dockerfile`, `compose.yaml`, `.env.example`, `README.md`: production packaging and operator guide.

---

### Task 1: Runtime foundation, database, and health contract

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`
- Create: `src/server/config.ts`, `src/server/index.ts`, `src/server/app.ts`
- Create: `src/server/db/client.ts`, `src/server/db/schema.ts`, `src/server/db/migrate.ts`
- Create: `src/server/lib/ids.ts`, `src/shared/api.ts`
- Test: `tests/unit/ids.test.ts`, `tests/integration/health.test.ts`

**Interfaces:**
- Produces: `createId(prefix): string`, `openDatabase(path): AppDatabase`, `buildApp(options): Promise<FastifyInstance>`, `GET /health`.

- [ ] **Step 1: Add the TypeScript/Vite/Vitest package foundation**

Define scripts `dev`, `build`, `start`, `typecheck`, `test`, `test:e2e`, `db:generate`, and `check`; require Node `>=22`; install the stack listed in the header and pin a lockfile.

- [ ] **Step 2: Write failing ID and health tests**

```ts
expect(createId("card")).toMatch(/^card_[0-9A-HJKMNP-TV-Z]{26}$/);
const response = await app.inject({ method: "GET", url: "/health" });
expect(response.json()).toMatchObject({ status: "ok", database: "ok" });
```

Run: `npm test -- tests/unit/ids.test.ts tests/integration/health.test.ts`
Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement configuration, IDs, SQLite startup, and schema**

Create tables for `admin`, `agent_token`, `board`, `column`, `card`, `attachment`, and `schema_migration`. Use foreign keys with explicit cascade/restrict behavior, integer timestamps, integer `version` fields on mutable resources, and indexed `(parent_id, position)` ordering. On every connection execute:

```ts
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");
```

Make `GET /health` run `SELECT 1` and return HTTP 503 with `database: "error"` if it fails.

- [ ] **Step 4: Run the focused and static checks**

Run: `npm test -- tests/unit/ids.test.ts tests/integration/health.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit the foundation**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts vitest.config.ts src tests
git commit -m "feat: establish Moonwire runtime and database"
```

### Task 2: Shared error, ordering, and concurrency primitives

**Files:**
- Create: `src/server/lib/errors.ts`, `src/server/lib/ordering.ts`
- Modify: `src/shared/api.ts`, `src/server/app.ts`
- Test: `tests/unit/ordering.test.ts`, `tests/integration/errors.test.ts`

**Interfaces:**
- Produces: `ApiError`, `errorEnvelope(error)`, `positionBetween(before, after)`, `rebalancePositions(items)`, and stable `{ error: { code, message, fields? } }` responses.

- [ ] **Step 1: Write failing ordering and error-envelope tests**

```ts
expect(positionBetween(1024, 2048)).toBe(1536);
expect(rebalancePositions(["a", "b"])).toEqual([{ id: "a", position: 1024 }, { id: "b", position: 2048 }]);
expect(response.json()).toEqual({ error: { code: "VALIDATION_ERROR", message: "Invalid request", fields: { title: "Required" } } });
```

Run: `npm test -- tests/unit/ordering.test.ts tests/integration/errors.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implement canonical ordering and errors**

Use integer gaps of 1024, rebalance transactionally when no integer exists between neighbors, reject unknown request properties through strict Zod schemas, and map validation, authentication, authorization, conflict, missing-resource, and internal failures to stable status codes and error codes.

- [ ] **Step 3: Run focused tests and commit**

Run: `npm test -- tests/unit/ordering.test.ts tests/integration/errors.test.ts && npm run typecheck`
Expected: PASS.

```bash
git add src/server/lib src/server/app.ts src/shared/api.ts tests
git commit -m "feat: add stable ordering and API errors"
```

### Task 3: Administrator setup, sessions, and agent tokens

**Files:**
- Create: `src/server/lib/auth.ts`
- Create: `src/server/modules/auth/service.ts`, `routes.ts`, `schemas.ts`
- Modify: `src/server/app.ts`, `src/server/db/schema.ts`, `src/shared/api.ts`
- Test: `tests/integration/auth.test.ts`, `tests/integration/tokens.test.ts`

**Interfaces:**
- Produces: `requireAdmin(request)`, `requireRead(request)`, `requireWrite(request)`, setup/login/logout/session routes, and token CRUD routes.

- [ ] **Step 1: Write failing authentication tests**

Cover first-run setup allowed exactly once, Argon2id password verification, secure cookie issuance, logout invalidation, unauthenticated rejection, one-time plaintext token display, hashed token storage, read-only mutation rejection, last-used updates, and immediate revocation.

```ts
expect((await login("wrong")).statusCode).toBe(401);
expect(createdToken.json().token).toMatch(/^mw_[A-Za-z0-9_-]{43}$/);
expect((await mutateWith(readOnlyToken)).statusCode).toBe(403);
```

Run: `npm test -- tests/integration/auth.test.ts tests/integration/tokens.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implement setup and browser sessions**

Hash passwords with Argon2id. Sign opaque session IDs with a 32-byte environment secret, store session expiry server-side, set `HttpOnly`, `SameSite=Strict`, `Path=/`, and configurable `Secure`; enforce exact-origin checks on cookie-authenticated mutations.

- [ ] **Step 3: Implement agent tokens and authorization**

Generate 32 random bytes, return `mw_` plus base64url plaintext once, persist only SHA-256 hashes, and allow `read` or `write`. Accept bearer authentication on all board and attachment endpoints while preferring the administrator session when present.

- [ ] **Step 4: Run authentication tests and commit**

Run: `npm test -- tests/integration/auth.test.ts tests/integration/tokens.test.ts && npm run typecheck`
Expected: PASS.

```bash
git add src/server src/shared tests/integration
git commit -m "feat: secure Moonwire authentication"
```

### Task 4: Board, column, and card domain API

**Files:**
- Create: `src/server/modules/boards/repository.ts`, `service.ts`, `schemas.ts`, `routes.ts`
- Modify: `src/server/app.ts`, `src/shared/api.ts`
- Test: `tests/unit/board-service.test.ts`, `tests/integration/boards-api.test.ts`

**Interfaces:**
- Produces: CRUD under `/api/v1/boards`, nested column/card creation, resource update, `POST .../move`, and `GET /api/v1/boards/:id/snapshot`.

- [ ] **Step 1: Write failing domain tests**

Cover multiple ordered boards, columns, card title/Markdown description, inline title update, cross-column movement, within-column reorder, version conflict, empty-column deletion, required card relocation for non-empty deletion, and cascade behavior when deleting a confirmed board.

```ts
expect(snapshot.columns[1].cards[0].id).toBe(card.id);
expect((await deleteNonEmptyColumn()).json().error.code).toBe("RELOCATION_REQUIRED");
expect((await staleUpdate()).statusCode).toBe(409);
```

Run: `npm test -- tests/unit/board-service.test.ts tests/integration/boards-api.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implement the repository and transactional service**

Keep SQL inside the repository. Make every create/move/reorder/delete operation a SQLite transaction. Return canonical resources after rebalance. Use a `version` precondition on card, column, and board updates.

- [ ] **Step 3: Implement strict REST routes and OpenAPI schemas**

Use stable resource JSON, deterministic ordering, explicit destination IDs and neighbor IDs for moves, and embed attachment metadata in card responses. Register every request and response schema with Fastify.

- [ ] **Step 4: Run domain/API tests and commit**

Run: `npm test -- tests/unit/board-service.test.ts tests/integration/boards-api.test.ts && npm run typecheck`
Expected: PASS.

```bash
git add src/server/modules/boards src/server/app.ts src/shared/api.ts tests
git commit -m "feat: add agent-friendly kanban API"
```

### Task 5: Multiple image attachments

**Files:**
- Create: `src/server/modules/attachments/storage.ts`, `service.ts`, `schemas.ts`, `routes.ts`
- Modify: `src/server/app.ts`, `src/shared/api.ts`
- Test: `tests/integration/attachments.test.ts`, fixtures under `tests/fixtures/`

**Interfaces:**
- Produces: multipart upload, attachment metadata, original/thumbnail streaming, and deletion endpoints.

- [ ] **Step 1: Write failing attachment tests**

Cover multiple PNG/JPEG/WebP/GIF uploads, magic-byte validation, configured file/count limits, metadata dimensions, thumbnail creation, authenticated downloads, safe content headers, partial batch errors, and deletion of both files and row.

```ts
expect(card.attachments).toHaveLength(2);
expect(original.headers["content-type"]).toBe("image/png");
expect(original.headers["content-disposition"]).toMatch(/^inline;/);
expect((await anonymousDownload()).statusCode).toBe(401);
```

Run: `npm test -- tests/integration/attachments.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implement safe storage and thumbnails**

Stream uploads to a temporary file, inspect decoded image metadata with Sharp, reject non-images and decompression bombs, re-encode bounded thumbnails, then atomically rename into `/data/uploads/{cardId}`. Never use client filenames as paths. Write the database row only after files are durable; remove files if the transaction fails.

- [ ] **Step 3: Implement routes and card embedding**

Expose authenticated `content_url` and `thumbnail_url` fields, support multiple form parts, return per-file failure details, apply `X-Content-Type-Options: nosniff`, and ensure bearer tokens can fetch image bytes directly.

- [ ] **Step 4: Run attachment tests and commit**

Run: `npm test -- tests/integration/attachments.test.ts && npm run typecheck`
Expected: PASS.

```bash
git add src/server/modules/attachments src/server/app.ts src/shared/api.ts tests
git commit -m "feat: support secure card image attachments"
```

### Task 6: OpenAPI, exports, backups, restore, and storage status

**Files:**
- Create: `src/server/modules/operations/routes.ts`, `export.ts`, `backup.ts`, `restore.ts`
- Modify: `src/server/app.ts`, `src/server/config.ts`
- Test: `tests/integration/operations.test.ts`

**Interfaces:**
- Produces: `/openapi.json`, `/docs`, `/api/v1/export`, `/api/v1/restore`, `/api/v1/storage`, `createBackup()`, and retention cleanup.

- [ ] **Step 1: Write failing operational tests**

Assert that OpenAPI lists every public operation and bearer scheme, export preserves stable IDs/order/metadata, restore validates the complete payload before replacing data, SQLite online backup produces a readable copy, retention keeps the configured count, and storage reports database/upload/backup bytes.

Run: `npm test -- tests/integration/operations.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implement documentation and logical export/restore**

Generate OpenAPI from registered route schemas. Export a versioned JSON envelope. Restore only for the administrator, create a pre-restore backup, reject attachment metadata whose bytes are absent, and replace logical records in one transaction.

- [ ] **Step 3: Implement backup scheduling and retention**

Use SQLite's online backup API to `/data/backups/moonwire-YYYYMMDD-HHmmss.sqlite`, write to a temporary suffix, rename atomically, and prune oldest successful backups above `BACKUP_RETENTION`.

- [ ] **Step 4: Run operations tests and commit**

Run: `npm test -- tests/integration/operations.test.ts && npm run typecheck`
Expected: PASS.

```bash
git add src/server/modules/operations src/server/app.ts src/server/config.ts tests
git commit -m "feat: add Moonwire operations and API docs"
```

### Task 7: Moonwire visual system, setup/login, and application shell

**Files:**
- Create: `index.html`, `src/client/main.tsx`, `src/client/App.tsx`, `src/client/api/client.ts`
- Create: `src/client/styles/{tokens,global,components}.css`
- Create: `src/client/features/auth/{SetupScreen,LoginScreen}.tsx`
- Create: `src/client/layout/{TopBar,BoardSwitcher,SettingsDialog}.tsx`
- Modify: `vite.config.ts`, `src/server/app.ts`
- Test: `tests/client/auth-ui.test.tsx`, `tests/client/shell.test.tsx`

**Interfaces:**
- Consumes: authentication, boards, token, export, and storage APIs.
- Produces: responsive authenticated shell and reusable Moonwire design tokens/components.

- [ ] **Step 1: Write failing UI tests**

Test first-run setup, login errors, session restoration, logout, board switching, settings keyboard focus, named token creation with one-time copy, and empty/loading/error states.

Run: `npm test -- tests/client/auth-ui.test.tsx tests/client/shell.test.tsx`
Expected: FAIL.

- [ ] **Step 2: Establish the visual system before feature markup**

Define semantic CSS variables for a deep blue-black canvas, elevated graphite surfaces, moon-white text, muted steel text, one electric cyan action color, one violet focus color, and destructive red. Use a crisp UI sans font stack, 4/8px spacing rhythm, restrained 10-14px radii, AA contrast, visible `:focus-visible`, and a reduced-motion media query. Create reusable Button, IconButton, Field, Dialog, Menu, Toast, and Skeleton styles without a component-library theme.

- [ ] **Step 3: Implement setup/login and shell**

Use concrete Moonwire copy, a small moon/cable wordmark rendered with CSS and typography, and no stock dashboard sidebar. Keep the board itself dominant. Ensure dialogs trap and restore focus, menus use correct ARIA semantics, and every icon-only control has an accessible name.

- [ ] **Step 4: Run component tests and visual build**

Run: `npm test -- tests/client/auth-ui.test.tsx tests/client/shell.test.tsx && npm run build`
Expected: PASS with compiled client assets served by Fastify.

- [ ] **Step 5: Commit the authenticated shell**

```bash
git add index.html src/client src/server/app.ts vite.config.ts tests/client
git commit -m "feat: create Moonwire interface foundation"
```

### Task 8: Boards, columns, cards, and accessible drag-and-drop UI

**Files:**
- Create: `src/client/features/board/{BoardScreen,ColumnLane,CardTile,AddCard,AddColumn}.tsx`
- Create: `src/client/features/board/{useBoard,useBoardMutations,drag}.ts`
- Create: `src/client/features/card/CardPanel.tsx`
- Modify: `src/client/App.tsx`, `src/client/styles/components.css`
- Test: `tests/client/board-ui.test.tsx`, `tests/client/card-panel.test.tsx`

**Interfaces:**
- Consumes: board snapshot, CRUD, and move endpoints.
- Produces: inline title editing, column/card creation and ordering, safe deletion, Markdown card panel, and optimistic rollback.

- [ ] **Step 1: Write failing board interaction tests**

Cover Add column, rename, reorder, safe non-empty deletion with destination selection, Add card in a chosen column, inline title edit with Enter/Escape/blur behavior, card panel description edit, pointer movement, keyboard movement, optimistic success, and visible rollback on 409/network failure.

Run: `npm test -- tests/client/board-ui.test.tsx tests/client/card-panel.test.tsx`
Expected: FAIL.

- [ ] **Step 2: Implement board rendering and inline editing**

Render horizontally scrollable column lanes. Keep card titles as buttons until edit begins, select text on edit, submit trimmed non-empty titles, and preserve input when requests fail. Use a side panel on wide screens and a full-height dialog on narrow screens.

- [ ] **Step 3: Implement drag-and-drop as API mutations**

Use `@dnd-kit` pointer, touch, and keyboard sensors. Convert every completed drag into destination parent plus before/after neighbor IDs; never persist client-only indexes. Announce keyboard moves through an ARIA live region and disable transforms under reduced motion.

- [ ] **Step 4: Implement safe destructive flows and errors**

Require explicit confirmation for cards and boards. When deleting a populated column, require a destination column and display the card count. On stale-version conflict, refetch the snapshot and explain that newer board state was loaded.

- [ ] **Step 5: Run UI tests and commit**

Run: `npm test -- tests/client/board-ui.test.tsx tests/client/card-panel.test.tsx && npm run typecheck`
Expected: PASS.

```bash
git add src/client tests/client
git commit -m "feat: add accessible kanban interactions"
```

### Task 9: Card image gallery and agent-visible attachment experience

**Files:**
- Create: `src/client/features/attachments/{AttachmentGallery,ImageUploader,ImageViewer}.tsx`
- Modify: `src/client/features/board/CardTile.tsx`, `src/client/features/card/CardPanel.tsx`, `src/client/api/client.ts`
- Test: `tests/client/attachments-ui.test.tsx`

**Interfaces:**
- Consumes: multipart upload, attachment content/thumbnail, and delete endpoints.
- Produces: card thumbnails, multi-file upload progress, full-size viewer, and individual removal.

- [ ] **Step 1: Write failing attachment UI tests**

Cover multi-select, previews, per-file progress/error, successful card refresh, thumbnail count overflow indicator, authenticated full-size loading, keyboard viewer controls, alt text based on filename, and individual deletion confirmation.

Run: `npm test -- tests/client/attachments-ui.test.tsx`
Expected: FAIL.

- [ ] **Step 2: Implement attachment UI**

Show at most three compact thumbnails on a closed card plus `+N`; keep originals in the panel gallery. Revoke object URLs after previews, preserve successful uploads if another file fails, allow retry of only failed files, and avoid embedding image bytes in board JSON.

- [ ] **Step 3: Run attachment UI tests and commit**

Run: `npm test -- tests/client/attachments-ui.test.tsx && npm run typecheck`
Expected: PASS.

```bash
git add src/client tests/client
git commit -m "feat: add Moonwire image gallery"
```

### Task 10: Docker packaging, end-to-end verification, accessibility, and documentation

**Files:**
- Create: `Dockerfile`, `compose.yaml`, `.dockerignore`, `.env.example`, `README.md`, `playwright.config.ts`
- Create: `tests/e2e/moonwire.spec.ts`, `tests/e2e/persistence.spec.ts`, `tests/e2e/accessibility.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: complete application.
- Produces: reproducible image, persistent Compose deployment, operator documentation, and verified human/agent workflows.

- [ ] **Step 1: Write end-to-end tests**

Automate setup/login; create two boards; add/reorder columns; create, rename, describe, drag, and reopen a card; upload two images; download one through a bearer token; restart the application against the same temporary data directory; and confirm all state persists. Add keyboard-only drag and automated accessibility scans for setup, board, card panel, and settings.

Run: `npm run test:e2e`
Expected: FAIL before packaging and selectors exist.

- [ ] **Step 2: Create the production image and Compose definition**

Use a multi-stage Node 22 slim build, run as an unprivileged user, expose one port, mount `/data`, include a `/health` healthcheck, stop gracefully, and document that Compose must remain at one replica. Keep native Sharp, SQLite, and Argon2 runtime libraries only in the final stage.

- [ ] **Step 3: Write the operator and API quick-start documentation**

Document first launch, reverse-proxy HTTPS, environment values, data directory ownership, token creation, `curl` examples for reading a board/creating/moving a card/downloading an image, backup/restore, upgrading migrations, and PostgreSQL migration boundaries. Include exact Compose commands and expected health response.

- [ ] **Step 4: Perform browser visual QA and fix defects**

Inspect desktop, tablet, and mobile widths. Verify the Moonwire palette, card density, horizontal scrolling, side-panel/mobile-dialog behavior, drag affordances, focus order, touch targets, reduced motion, empty states, long titles, many columns, and cards with multiple images. Record each defect as a focused test before fixing it.

- [ ] **Step 5: Run the complete verification matrix**

Run: `npm run check && npm run build && npm run test:e2e && docker compose build && docker compose up -d && curl --fail http://localhost:3000/health && docker compose restart && curl --fail http://localhost:3000/health`
Expected: all tests and builds pass; both health responses contain `{"status":"ok","database":"ok"}`.

- [ ] **Step 6: Commit the production release**

```bash
git add Dockerfile compose.yaml .dockerignore .env.example README.md playwright.config.ts package.json tests/e2e
git commit -m "feat: package and verify Moonwire"
```

---

## Final acceptance checklist

- [ ] A human can create an administrator account, log in, manage multiple boards, and log out.
- [ ] A human can create/reorder/rename/delete columns with relocation protection.
- [ ] A human can create/reorder/move/delete cards and edit titles inline.
- [ ] Cards support Markdown descriptions and multiple image attachments.
- [ ] A read-only agent can enumerate boards/cards and download images but cannot mutate state.
- [ ] A read-write agent can create, edit, move, and delete resources through documented JSON endpoints.
- [ ] Revoked tokens stop working immediately.
- [ ] API responses, IDs, ordering, errors, and OpenAPI schemas are deterministic.
- [ ] Database, uploads, thumbnails, and backups survive container restart beneath `/data`.
- [ ] Desktop, mobile, keyboard, touch, focus, contrast, and reduced-motion behavior pass verification.
- [ ] The final interface is recognizably Moonwire and does not look like an off-the-shelf admin template.
