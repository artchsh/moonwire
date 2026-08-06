import { eq, inArray } from "drizzle-orm";
import type { AppDatabase } from "../../db/client";
import { createId } from "../../lib/ids";
import { ApiError } from "../../lib/errors";
import { ORDER_GAP, positionBetween, rebalancePositions } from "../../lib/ordering";
import { toAttachmentDto } from "../attachments/dto";
import type {
  BoardDto,
  ColumnDto,
  CardDto,
  BoardSnapshot,
  ColumnWithCards,
} from "../../../shared/api";
import type { BoardRow, ColumnRow, CardRow } from "../../db/schema";
import * as repo from "./repository";
import { board, boardColumn, card, attachment } from "./repository";

// ---- DTO mappers ----

const toBoardDto = (r: BoardRow): BoardDto => ({
  id: r.id,
  name: r.name,
  position: r.position,
  version: r.version,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

const toColumnDto = (r: ColumnRow): ColumnDto => ({
  id: r.id,
  boardId: r.boardId,
  name: r.name,
  position: r.position,
  version: r.version,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

const toCardDto = (r: CardRow): Omit<CardDto, "attachments"> => ({
  id: r.id,
  columnId: r.columnId,
  boardId: r.boardId,
  title: r.title,
  description: r.description,
  completed: r.completed,
  position: r.position,
  version: r.version,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

// ---- neighbour-based move maths (shared by cards/columns/boards) ----

interface Positioned {
  id: string;
  position: number;
}

function neighbourPositions(
  siblings: Positioned[],
  beforeId: string | null | undefined,
  afterId: string | null | undefined,
): { before: number | null; after: number | null } {
  const idx = (id: string) => siblings.findIndex((s) => s.id === id);
  let before: number | null = null;
  let after: number | null = null;

  if (afterId) {
    const i = idx(afterId);
    if (i >= 0) {
      after = siblings[i]!.position;
      before = i > 0 ? siblings[i - 1]!.position : null;
    }
  }
  if (beforeId) {
    const i = idx(beforeId);
    if (i >= 0) {
      before = siblings[i]!.position;
      if (after === null) after = i < siblings.length - 1 ? siblings[i + 1]!.position : null;
    }
  }
  if (!beforeId && !afterId) {
    before = siblings.length ? siblings[siblings.length - 1]!.position : null;
    after = null;
  }
  return { before, after };
}

function insertionIndex(
  siblings: Positioned[],
  beforeId: string | null | undefined,
  afterId: string | null | undefined,
): number {
  const idx = (id: string) => siblings.findIndex((s) => s.id === id);
  if (afterId) {
    const i = idx(afterId);
    if (i >= 0) return i;
  }
  if (beforeId) {
    const i = idx(beforeId);
    if (i >= 0) return i + 1;
  }
  return siblings.length;
}

function nextPosition(siblings: Positioned[]): number {
  const last = siblings.at(-1);
  return last ? last.position + ORDER_GAP : ORDER_GAP;
}

/** Run a non-empty list of statements atomically (D1 batch = implicit txn). */
function runBatch(db: AppDatabase, statements: unknown[]): Promise<unknown> {
  return db.batch(statements as never);
}

// ============================ Boards ============================

export async function listBoards(db: AppDatabase): Promise<BoardDto[]> {
  return (await repo.listBoards(db)).map(toBoardDto);
}

export async function createBoard(db: AppDatabase, name: string): Promise<BoardDto> {
  const siblings = await repo.listBoards(db);
  const now = Date.now();
  const row = {
    id: createId("board"),
    name,
    position: nextPosition(siblings),
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(board).values(row);
  return toBoardDto(row);
}

export async function updateBoard(
  db: AppDatabase,
  id: string,
  version: number,
  patch: { name?: string },
): Promise<BoardDto> {
  const existing = await repo.getBoard(db, id);
  if (!existing) throw ApiError.notFound("Board");
  const changes = await repo.updateBoardGuarded(db, id, version, patch);
  if (!changes) throw ApiError.conflict("Board was modified by another request");
  return toBoardDto((await repo.getBoard(db, id))!);
}

export async function moveBoard(
  db: AppDatabase,
  id: string,
  version: number,
  beforeId: string | null | undefined,
  afterId: string | null | undefined,
): Promise<BoardDto> {
  const existing = await repo.getBoard(db, id);
  if (!existing) throw ApiError.notFound("Board");
  if (existing.version !== version) throw ApiError.conflict("Board was modified by another request");

  const siblings = (await repo.listBoards(db)).filter((b) => b.id !== id);
  const { before, after } = neighbourPositions(siblings, beforeId, afterId);
  const target = positionBetween(before, after);
  const now = Date.now();

  if (target !== null) {
    await db
      .update(board)
      .set({ position: target, version: version + 1, updatedAt: now })
      .where(eq(board.id, id));
  } else {
    const ordered = [...siblings];
    ordered.splice(insertionIndex(siblings, beforeId, afterId), 0, existing);
    const positions = rebalancePositions(ordered.map((b) => b.id));
    await runBatch(db,
      positions.map((p) =>
        db
          .update(board)
          .set(
            p.id === id
              ? { position: p.position, version: version + 1, updatedAt: now }
              : { position: p.position },
          )
          .where(eq(board.id, p.id)),
      ),
    );
  }
  return toBoardDto((await repo.getBoard(db, id))!);
}

export async function deleteBoard(
  db: AppDatabase,
  bucket: R2Bucket,
  id: string,
): Promise<void> {
  const existing = await repo.getBoard(db, id);
  if (!existing) throw ApiError.notFound("Board");
  const cards = await repo.listCardsInBoard(db, id);
  const cardIds = cards.map((c) => c.id);
  const keys = await repo.attachmentKeysForCards(db, cardIds);

  // Delete descendants explicitly (deterministic regardless of D1 FK enforcement).
  const statements: unknown[] = [];
  if (cardIds.length > 0) statements.push(db.delete(attachment).where(inArray(attachment.cardId, cardIds)));
  statements.push(db.delete(card).where(eq(card.boardId, id)));
  statements.push(db.delete(boardColumn).where(eq(boardColumn.boardId, id)));
  statements.push(db.delete(board).where(eq(board.id, id)));
  await runBatch(db, statements);

  await deleteObjects(bucket, keys);
}

// ============================ Columns ============================

export async function createColumn(
  db: AppDatabase,
  boardId: string,
  name: string,
): Promise<ColumnDto> {
  if (!(await repo.getBoard(db, boardId))) throw ApiError.notFound("Board");
  const siblings = await repo.listColumns(db, boardId);
  const now = Date.now();
  const row = {
    id: createId("col"),
    boardId,
    name,
    position: nextPosition(siblings),
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(boardColumn).values(row);
  return toColumnDto(row);
}

export async function updateColumn(
  db: AppDatabase,
  id: string,
  version: number,
  patch: { name?: string },
): Promise<ColumnDto> {
  const existing = await repo.getColumn(db, id);
  if (!existing) throw ApiError.notFound("Column");
  const changes = await repo.updateColumnGuarded(db, id, version, patch);
  if (!changes) throw ApiError.conflict("Column was modified by another request");
  return toColumnDto((await repo.getColumn(db, id))!);
}

export async function moveColumn(
  db: AppDatabase,
  id: string,
  version: number,
  beforeId: string | null | undefined,
  afterId: string | null | undefined,
): Promise<ColumnDto> {
  const existing = await repo.getColumn(db, id);
  if (!existing) throw ApiError.notFound("Column");
  if (existing.version !== version) throw ApiError.conflict("Column was modified by another request");

  const siblings = (await repo.listColumns(db, existing.boardId)).filter((c) => c.id !== id);
  const { before, after } = neighbourPositions(siblings, beforeId, afterId);
  const target = positionBetween(before, after);
  const now = Date.now();

  if (target !== null) {
    await db
      .update(boardColumn)
      .set({ position: target, version: version + 1, updatedAt: now })
      .where(eq(boardColumn.id, id));
  } else {
    const ordered = [...siblings];
    ordered.splice(insertionIndex(siblings, beforeId, afterId), 0, existing);
    const positions = rebalancePositions(ordered.map((c) => c.id));
    await runBatch(db,
      positions.map((p) =>
        db
          .update(boardColumn)
          .set(
            p.id === id
              ? { position: p.position, version: version + 1, updatedAt: now }
              : { position: p.position },
          )
          .where(eq(boardColumn.id, p.id)),
      ),
    );
  }
  return toColumnDto((await repo.getColumn(db, id))!);
}

export async function deleteColumn(
  db: AppDatabase,
  id: string,
  relocateToColumnId?: string,
): Promise<void> {
  const existing = await repo.getColumn(db, id);
  if (!existing) throw ApiError.notFound("Column");
  const cards = await repo.listCardsInColumn(db, id);

  if (cards.length > 0) {
    if (!relocateToColumnId) {
      throw new ApiError(
        "RELOCATION_REQUIRED",
        `Column has ${cards.length} card(s). Provide relocateToColumnId to move them first.`,
        { relocateToColumnId: "Required for a non-empty column" },
      );
    }
    if (relocateToColumnId === id) {
      throw new ApiError("VALIDATION_ERROR", "Cannot relocate cards into the column being deleted");
    }
    const target = await repo.getColumn(db, relocateToColumnId);
    if (!target || target.boardId !== existing.boardId) {
      throw ApiError.notFound("Destination column");
    }
    const targetCards = await repo.listCardsInColumn(db, relocateToColumnId);
    let base = targetCards.at(-1)?.position ?? 0;
    const now = Date.now();
    await runBatch(db,
      cards.map((cardRow) =>
        db
          .update(card)
          .set({ columnId: relocateToColumnId, position: (base += ORDER_GAP), updatedAt: now })
          .where(eq(card.id, cardRow.id)),
      ),
    );
  }

  await db.delete(boardColumn).where(eq(boardColumn.id, id));
}

// ============================ Cards ============================

export async function createCard(
  db: AppDatabase,
  columnId: string,
  input: { title: string; description?: string },
): Promise<CardDto> {
  const column = await repo.getColumn(db, columnId);
  if (!column) throw ApiError.notFound("Column");
  const siblings = await repo.listCardsInColumn(db, columnId);
  const now = Date.now();
  const row = {
    id: createId("card"),
    columnId,
    boardId: column.boardId,
    title: input.title,
    description: input.description ?? "",
    completed: false,
    position: nextPosition(siblings),
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(card).values(row);
  return { ...toCardDto(row), attachments: [] };
}

export async function updateCard(
  db: AppDatabase,
  id: string,
  version: number,
  patch: { title?: string; description?: string; completed?: boolean },
): Promise<CardDto> {
  const existing = await repo.getCard(db, id);
  if (!existing) throw ApiError.notFound("Card");
  const changes = await repo.updateCardGuarded(db, id, version, patch);
  if (!changes) throw ApiError.conflict("Card was modified by another request");
  return withAttachments(db, (await repo.getCard(db, id))!);
}

export async function moveCard(
  db: AppDatabase,
  id: string,
  version: number,
  toColumnId: string,
  beforeId: string | null | undefined,
  afterId: string | null | undefined,
): Promise<CardDto> {
  const existing = await repo.getCard(db, id);
  if (!existing) throw ApiError.notFound("Card");
  if (existing.version !== version) throw ApiError.conflict("Card was modified by another request");

  const destination = await repo.getColumn(db, toColumnId);
  if (!destination || destination.boardId !== existing.boardId) {
    throw ApiError.notFound("Destination column");
  }

  const siblings = (await repo.listCardsInColumn(db, toColumnId)).filter((c) => c.id !== id);
  const { before, after } = neighbourPositions(siblings, beforeId, afterId);
  const target = positionBetween(before, after);
  const now = Date.now();

  if (target !== null) {
    await db
      .update(card)
      .set({ columnId: toColumnId, position: target, version: version + 1, updatedAt: now })
      .where(eq(card.id, id));
  } else {
    const ordered: Positioned[] = [...siblings];
    ordered.splice(insertionIndex(siblings, beforeId, afterId), 0, { id, position: 0 });
    const positions = rebalancePositions(ordered.map((c) => c.id));
    await runBatch(db,
      positions.map((p) =>
        db
          .update(card)
          .set(
            p.id === id
              ? { columnId: toColumnId, position: p.position, version: version + 1, updatedAt: now }
              : { position: p.position },
          )
          .where(eq(card.id, p.id)),
      ),
    );
  }
  return withAttachments(db, (await repo.getCard(db, id))!);
}

export async function deleteCard(
  db: AppDatabase,
  bucket: R2Bucket,
  id: string,
): Promise<void> {
  const existing = await repo.getCard(db, id);
  if (!existing) throw ApiError.notFound("Card");
  const keys = await repo.attachmentKeysForCards(db, [id]);
  await runBatch(db, [
    db.delete(attachment).where(eq(attachment.cardId, id)),
    db.delete(card).where(eq(card.id, id)),
  ]);
  await deleteObjects(bucket, keys);
}

// ============================ Snapshot / helpers ============================

export async function getCardWithAttachments(db: AppDatabase, id: string): Promise<CardDto> {
  const row = await repo.getCard(db, id);
  if (!row) throw ApiError.notFound("Card");
  return withAttachments(db, row);
}

async function withAttachments(db: AppDatabase, row: CardRow): Promise<CardDto> {
  const map = await repo.listAttachmentsForCards(db, [row.id]);
  return { ...toCardDto(row), attachments: (map.get(row.id) ?? []).map(toAttachmentDto) };
}

export async function getSnapshot(db: AppDatabase, boardId: string): Promise<BoardSnapshot> {
  const boardRow = await repo.getBoard(db, boardId);
  if (!boardRow) throw ApiError.notFound("Board");

  const columns = await repo.listColumns(db, boardId);
  const cards = await repo.listCardsInBoard(db, boardId);
  const attachments = await repo.listAttachmentsForCards(db, cards.map((c) => c.id));

  const cardsByColumn = new Map<string, CardDto[]>();
  for (const cardRow of cards) {
    const dto: CardDto = {
      ...toCardDto(cardRow),
      attachments: (attachments.get(cardRow.id) ?? []).map(toAttachmentDto),
    };
    const list = cardsByColumn.get(cardRow.columnId) ?? [];
    list.push(dto);
    cardsByColumn.set(cardRow.columnId, list);
  }

  const columnDtos: ColumnWithCards[] = columns.map((col) => ({
    ...toColumnDto(col),
    cards: cardsByColumn.get(col.id) ?? [],
  }));

  return { ...toBoardDto(boardRow), columns: columnDtos };
}

async function deleteObjects(bucket: R2Bucket, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    await bucket.delete(keys);
  } catch (err) {
    // Orphaned objects are harmless (storage-only); log and continue.
    console.error("Failed to delete R2 objects:", err);
  }
}
