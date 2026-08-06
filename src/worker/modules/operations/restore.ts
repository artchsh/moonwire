import { z } from "zod";
import type { AppDatabase } from "../../db/client";
import { schema } from "../../db/client";
import { ApiError } from "../../lib/errors";

const { board, boardColumn, card, attachment } = schema;

const ts = z.number().int().nonnegative();
const ver = z.number().int().positive();

export const restoreEnvelopeSchema = z
  .object({
    moonwireExportVersion: z.literal(1),
    exportedAt: ts,
    boards: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        position: z.number().int(),
        version: ver,
        createdAt: ts,
        updatedAt: ts,
      }),
    ),
    columns: z.array(
      z.object({
        id: z.string(),
        boardId: z.string(),
        name: z.string(),
        position: z.number().int(),
        version: ver,
        createdAt: ts,
        updatedAt: ts,
      }),
    ),
    cards: z.array(
      z.object({
        id: z.string(),
        columnId: z.string(),
        boardId: z.string(),
        title: z.string(),
        description: z.string(),
        position: z.number().int(),
        version: ver,
        createdAt: ts,
        updatedAt: ts,
      }),
    ),
    attachments: z.array(
      z.object({
        id: z.string(),
        cardId: z.string(),
        filename: z.string(),
        contentType: z.string(),
        size: z.number().int().nonnegative(),
        width: z.number().int().nonnegative(),
        height: z.number().int().nonnegative(),
        position: z.number().int(),
        createdAt: ts,
        r2Key: z.string(),
      }),
    ),
  })
  .strict();

export type RestoreEnvelope = z.infer<typeof restoreEnvelopeSchema>;

/**
 * Replace ALL logical records with the payload, atomically. Image bytes are not
 * part of the payload — every referenced R2 object must already exist, so we
 * reject the restore if any attachment's bytes are absent. D1 Time Travel is the
 * physical safety net if a restore needs to be undone.
 */
export async function restore(
  db: AppDatabase,
  bucket: R2Bucket,
  payload: unknown,
): Promise<{ boards: number; columns: number; cards: number; attachments: number }> {
  const data = restoreEnvelopeSchema.parse(payload);

  // Referential integrity within the payload.
  const boardIds = new Set(data.boards.map((b) => b.id));
  const columnIds = new Set(data.columns.map((c) => c.id));
  const cardIds = new Set(data.cards.map((c) => c.id));
  for (const c of data.columns) {
    if (!boardIds.has(c.boardId)) throw new ApiError("VALIDATION_ERROR", `Column ${c.id} references missing board`);
  }
  for (const c of data.cards) {
    if (!boardIds.has(c.boardId) || !columnIds.has(c.columnId)) {
      throw new ApiError("VALIDATION_ERROR", `Card ${c.id} references a missing board or column`);
    }
  }
  for (const a of data.attachments) {
    if (!cardIds.has(a.cardId)) throw new ApiError("VALIDATION_ERROR", `Attachment ${a.id} references missing card`);
  }

  // Every attachment's bytes must be present in R2 before we commit.
  const missing: string[] = [];
  await Promise.all(
    data.attachments.map(async (a) => {
      const head = await bucket.head(a.r2Key);
      if (!head) missing.push(a.r2Key);
    }),
  );
  if (missing.length > 0) {
    throw new ApiError("VALIDATION_ERROR", `Missing image bytes for ${missing.length} attachment(s)`, {
      attachments: missing.slice(0, 5).join(", "),
    });
  }

  const statements: unknown[] = [
    // Deleting boards cascades to columns/cards/attachments.
    db.delete(board),
    ...data.boards.map((b) => db.insert(board).values(b)),
    ...data.columns.map((c) => db.insert(boardColumn).values(c)),
    ...data.cards.map((c) => db.insert(card).values(c)),
    ...data.attachments.map((a) => db.insert(attachment).values(a)),
  ];

  await db.batch(statements as never);

  return {
    boards: data.boards.length,
    columns: data.columns.length,
    cards: data.cards.length,
    attachments: data.attachments.length,
  };
}
