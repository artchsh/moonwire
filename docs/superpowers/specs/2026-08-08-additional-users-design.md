# Additional users — design

## Goal
Let a logged-in user create additional accounts so a colleague can be given access,
and revoke that access later. Kept intentionally small.

## Key insight
The existing `admin` table already supports multiple rows (`username` is unique,
each row has its own `password_hash`). Sessions reference `admin.id` with
`ON DELETE CASCADE`. The *only* thing preventing more accounts today is
`createAdmin` throwing `SETUP_ALREADY_COMPLETE`. So this feature needs **no schema
migration** — it adds authenticated create/list/delete operations over `admin`.

## Decisions (agreed)
- **Access level:** all users are equal admins (full access, incl. managing users).
  No roles/permissions.
- **Invocation:** in-app UI form in the existing Settings dialog.
- **Scope:** create **and** remove users.
- **Password:** the creator sets an initial password and shares it out-of-band.
  There is no self-service change-password flow in the app (out of scope).

## Backend — `src/worker/modules/auth/`

### `service.ts`
- `createUser(db, username, password): Promise<UserDto>`
  - Rejects a duplicate username with `ApiError("CONFLICT", ...)` (pre-check by
    select; the DB unique constraint is the backstop).
  - Inserts an `admin` row via `createId("adm")` + `hashPassword(password)`.
  - Returns `{ id, username, createdAt }` (never the hash).
- `listUsers(db): Promise<UserDto[]>` — all admin rows as `UserDto`, newest first.
- `deleteUser(db, id, currentAdminId): Promise<void>`
  - Guard: `id === currentAdminId` → `ApiError("FORBIDDEN", "You cannot remove your own account")`.
  - Guard: if only one admin remains → `ApiError("CONFLICT", "Cannot remove the last user")`.
  - Deletes the row; FK cascade removes that user's sessions (logs them out).
  - Missing id → `ApiError.notFound("User")`.

### `schemas.ts`
- `createUserSchema` = `{ username: string 3..64 (trimmed), password: string 8..200 }.strict()`
  (same rules as `setupSchema`).

### `routes.ts` (all behind `requireAdmin`)
- `GET  /users` → `{ users: UserDto[] }`
- `POST /users` → `UserDto` (201)
- `DELETE /users/:id` → 204. Passes `c.var.principal.id` as `currentAdminId`.

### `shared/api.ts`
```ts
export interface UserDto { id: string; username: string; createdAt: number; }
export interface CreateUserRequest { username: string; password: string; }
```

## Frontend

### `api/client.ts`
- `listUsers(): { users: UserDto[] }`
- `createUser(username, password): UserDto`
- `deleteUser(id): void`

### `layout/SettingsDialog.tsx`
- New **"Users"** section, styled like the Agent-tokens section, reusing
  `.mw-token-row` for the list rows.
- Form: username input + password input + Create button.
- List: each user's username + created date + a "Remove" button.
  - The current user's own row shows "(you)" and its Remove button is disabled.
- Errors (duplicate username, weak password) surfaced inline / via toast.
- Needs the current username to mark the "you" row — passed in from the Shell,
  which already holds `SessionInfo`.

## Testing
The project has no D1/service test harness (unit tests cover pure logic only,
e.g. `auth-crypto.test.ts`). Standing one up is out of proportion for this
feature, so:
- **Unit (`tests/unit/`):** `createUserSchema` validation — accepts valid input,
  rejects short username / short password / extra keys, trims username.
- **End-to-end (browser preview):** create a second user, log in as them, confirm
  full access, then remove them and confirm the self / last-user guards.

## Out of scope (YAGNI)
- Roles / granular permissions.
- Self-service password change / reset.
- Email invitations.
```
