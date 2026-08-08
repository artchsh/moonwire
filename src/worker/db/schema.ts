import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";

// All timestamps are integer epoch milliseconds.
// All ids are prefixed ULIDs (see lib/ids.ts), except session ids which are the
// SHA-256 hash of the opaque cookie token.

/** Single administrator account, created exactly once during first-run setup. */
export const admin = sqliteTable("admin", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at").notNull(),
});

/** Server-side browser sessions. `id` is sha256(cookie token). */
export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  adminId: text("admin_id")
    .notNull()
    .references(() => admin.id, { onDelete: "cascade" }),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

/** Separately-revocable bearer tokens for AI agents. */
export const agentToken = sqliteTable("agent_token", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  scope: text("scope", { enum: ["read", "write"] }).notNull(),
  createdAt: integer("created_at").notNull(),
  lastUsedAt: integer("last_used_at"),
});

export const board = sqliteTable(
  "board",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    version: integer("version").notNull().default(1),
    // Monotonic change counter for the board's sync event stream. Bumped once
    // per emitted board_event; clients poll events with their last-seen value.
    revision: integer("revision").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("board_position_idx").on(t.position)],
);

/**
 * Append-only change log per board, consumed by polling clients. `revision` is
 * dense (1, 2, 3...) within a board; a gap on read means the tail was pruned
 * and the client must refetch the snapshot.
 */
export const boardEvent = sqliteTable(
  "board_event",
  {
    id: text("id").primaryKey(),
    boardId: text("board_id")
      .notNull()
      .references(() => board.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    /** X-Client-Id of the originating browser tab; lets that tab skip its own echo. */
    actorId: text("actor_id"),
    type: text("type").notNull(),
    payload: text("payload").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("board_event_board_revision_idx").on(t.boardId, t.revision)],
);

export const boardColumn = sqliteTable(
  "board_column",
  {
    id: text("id").primaryKey(),
    boardId: text("board_id")
      .notNull()
      .references(() => board.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("column_board_position_idx").on(t.boardId, t.position)],
);

export const card = sqliteTable(
  "card",
  {
    id: text("id").primaryKey(),
    columnId: text("column_id")
      .notNull()
      .references(() => boardColumn.id, { onDelete: "cascade" }),
    boardId: text("board_id")
      .notNull()
      .references(() => board.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    completed: integer("completed", { mode: "boolean" }).notNull().default(false),
    position: integer("position").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("card_column_position_idx").on(t.columnId, t.position)],
);

export const attachment = sqliteTable(
  "attachment",
  {
    id: text("id").primaryKey(),
    cardId: text("card_id")
      .notNull()
      .references(() => card.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    r2Key: text("r2_key").notNull(),
    position: integer("position").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("attachment_card_position_idx").on(t.cardId, t.position)],
);

export type AdminRow = typeof admin.$inferSelect;
export type BoardEventRow = typeof boardEvent.$inferSelect;
export type SessionRow = typeof session.$inferSelect;
export type AgentTokenRow = typeof agentToken.$inferSelect;
export type BoardRow = typeof board.$inferSelect;
export type ColumnRow = typeof boardColumn.$inferSelect;
export type CardRow = typeof card.$inferSelect;
export type AttachmentRow = typeof attachment.$inferSelect;
