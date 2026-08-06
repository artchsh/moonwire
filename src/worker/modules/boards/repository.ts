import { and, eq, asc, inArray } from "drizzle-orm";
import type { AppDatabase } from "../../db/client";
import { schema } from "../../db/client";
import type { BoardRow, ColumnRow, CardRow, AttachmentRow } from "../../db/schema";

const { board, boardColumn, card, attachment } = schema;

// ---- reads ----

export function getBoard(db: AppDatabase, id: string): Promise<BoardRow | undefined> {
  return db.select().from(board).where(eq(board.id, id)).limit(1).then((r) => r[0]);
}

export function listBoards(db: AppDatabase): Promise<BoardRow[]> {
  return db.select().from(board).orderBy(asc(board.position));
}

export function getColumn(db: AppDatabase, id: string): Promise<ColumnRow | undefined> {
  return db.select().from(boardColumn).where(eq(boardColumn.id, id)).limit(1).then((r) => r[0]);
}

export function listColumns(db: AppDatabase, boardId: string): Promise<ColumnRow[]> {
  return db
    .select()
    .from(boardColumn)
    .where(eq(boardColumn.boardId, boardId))
    .orderBy(asc(boardColumn.position));
}

export function getCard(db: AppDatabase, id: string): Promise<CardRow | undefined> {
  return db.select().from(card).where(eq(card.id, id)).limit(1).then((r) => r[0]);
}

export function listCardsInColumn(db: AppDatabase, columnId: string): Promise<CardRow[]> {
  return db
    .select()
    .from(card)
    .where(eq(card.columnId, columnId))
    .orderBy(asc(card.position));
}

export function listCardsInBoard(db: AppDatabase, boardId: string): Promise<CardRow[]> {
  return db
    .select()
    .from(card)
    .where(eq(card.boardId, boardId))
    .orderBy(asc(card.position));
}

export async function countCardsInColumn(db: AppDatabase, columnId: string): Promise<number> {
  const rows = await db.select({ id: card.id }).from(card).where(eq(card.columnId, columnId));
  return rows.length;
}

export async function listAttachmentsForCards(
  db: AppDatabase,
  cardIds: string[],
): Promise<Map<string, AttachmentRow[]>> {
  const map = new Map<string, AttachmentRow[]>();
  if (cardIds.length === 0) return map;
  const rows = await db
    .select()
    .from(attachment)
    .where(inArray(attachment.cardId, cardIds))
    .orderBy(asc(attachment.position));
  for (const row of rows) {
    const list = map.get(row.cardId) ?? [];
    list.push(row);
    map.set(row.cardId, list);
  }
  return map;
}

/** Collect the R2 keys of every attachment under a card / column / board. */
export async function attachmentKeysForCards(
  db: AppDatabase,
  cardIds: string[],
): Promise<string[]> {
  if (cardIds.length === 0) return [];
  const rows = await db
    .select({ r2Key: attachment.r2Key })
    .from(attachment)
    .where(inArray(attachment.cardId, cardIds));
  return rows.map((r) => r.r2Key);
}

// ---- version-guarded updates (optimistic concurrency) ----

/** Returns true if the row existed and matched the version (1 row changed). */
export async function updateBoardGuarded(
  db: AppDatabase,
  id: string,
  version: number,
  patch: Partial<Pick<BoardRow, "name">>,
): Promise<number> {
  const res = await db
    .update(board)
    .set({ ...patch, version: version + 1, updatedAt: Date.now() })
    .where(and(eq(board.id, id), eq(board.version, version)));
  return res.meta.changes;
}

export async function updateColumnGuarded(
  db: AppDatabase,
  id: string,
  version: number,
  patch: Partial<Pick<ColumnRow, "name">>,
): Promise<number> {
  const res = await db
    .update(boardColumn)
    .set({ ...patch, version: version + 1, updatedAt: Date.now() })
    .where(and(eq(boardColumn.id, id), eq(boardColumn.version, version)));
  return res.meta.changes;
}

export async function updateCardGuarded(
  db: AppDatabase,
  id: string,
  version: number,
  patch: Partial<Pick<CardRow, "title" | "description" | "completed">>,
): Promise<number> {
  const res = await db
    .update(card)
    .set({ ...patch, version: version + 1, updatedAt: Date.now() })
    .where(and(eq(card.id, id), eq(card.version, version)));
  return res.meta.changes;
}

export { board, boardColumn, card, attachment };
