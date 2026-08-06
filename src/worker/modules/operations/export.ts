import { asc } from "drizzle-orm";
import type { AppDatabase } from "../../db/client";
import { schema } from "../../db/client";
import type { ExportEnvelope, StorageInfo } from "../../../shared/api";

const { board, boardColumn, card, attachment } = schema;

/** A versioned, logical JSON export (metadata only — image bytes stay in R2). */
export async function buildExport(db: AppDatabase): Promise<ExportEnvelope> {
  const [boards, columns, cards, attachments] = await Promise.all([
    db.select().from(board).orderBy(asc(board.position)),
    db.select().from(boardColumn).orderBy(asc(boardColumn.position)),
    db.select().from(card).orderBy(asc(card.position)),
    db.select().from(attachment).orderBy(asc(attachment.position)),
  ]);

  return {
    moonwireExportVersion: 1,
    exportedAt: Date.now(),
    boards: boards.map((b) => ({
      id: b.id,
      name: b.name,
      position: b.position,
      version: b.version,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    })),
    columns: columns.map((c) => ({
      id: c.id,
      boardId: c.boardId,
      name: c.name,
      position: c.position,
      version: c.version,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
    cards: cards.map((c) => ({
      id: c.id,
      columnId: c.columnId,
      boardId: c.boardId,
      title: c.title,
      description: c.description,
      position: c.position,
      version: c.version,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
    attachments: attachments.map((a) => ({
      id: a.id,
      cardId: a.cardId,
      filename: a.filename,
      contentType: a.contentType,
      size: a.size,
      width: a.width,
      height: a.height,
      position: a.position,
      createdAt: a.createdAt,
    })),
  };
}

export async function storageInfo(db: AppDatabase): Promise<StorageInfo> {
  const [boards, columns, cards, attachments] = await Promise.all([
    db.select({ id: board.id }).from(board),
    db.select({ id: boardColumn.id }).from(boardColumn),
    db.select({ id: card.id }).from(card),
    db.select({ size: attachment.size }).from(attachment),
  ]);
  return {
    boards: boards.length,
    columns: columns.length,
    cards: cards.length,
    attachments: attachments.length,
    attachmentBytes: attachments.reduce((sum, a) => sum + a.size, 0),
  };
}
