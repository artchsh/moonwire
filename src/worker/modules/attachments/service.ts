import { eq, asc } from "drizzle-orm";
import type { AppDatabase } from "../../db/client";
import { schema } from "../../db/client";
import { ApiError } from "../../lib/errors";
import { ORDER_GAP } from "../../lib/ordering";
import { parseImage } from "../../lib/image";
import type { AppConfig } from "../../config";
import type { AttachmentDto } from "../../../shared/api";
import { toAttachmentDto } from "./dto";
import { buildKey, newAttachmentId, putOriginal } from "./storage";

const { attachment, card } = schema;

/** Reject absurd pixel dimensions (decompression-bomb defence). */
const MAX_PIXELS = 40_000_000; // 40 MP

export interface UploadFile {
  filename: string;
  bytes: Uint8Array;
}

export interface UploadResult {
  attachments: AttachmentDto[];
  errors: Array<{ filename: string; error: string }>;
}

export async function uploadAttachments(
  db: AppDatabase,
  bucket: R2Bucket,
  cardId: string,
  files: UploadFile[],
  config: AppConfig,
): Promise<UploadResult> {
  const cardRow = await db.select().from(card).where(eq(card.id, cardId)).limit(1);
  if (cardRow.length === 0) throw ApiError.notFound("Card");

  const existing = await db
    .select()
    .from(attachment)
    .where(eq(attachment.cardId, cardId))
    .orderBy(asc(attachment.position));

  if (existing.length + files.length > config.maxAttachmentsPerCard) {
    throw new ApiError(
      "VALIDATION_ERROR",
      `A card may have at most ${config.maxAttachmentsPerCard} attachments`,
    );
  }

  const result: UploadResult = { attachments: [], errors: [] };
  let position = existing.at(-1)?.position ?? 0;

  for (const file of files) {
    try {
      if (file.bytes.byteLength === 0) throw new Error("Empty file");
      if (file.bytes.byteLength > config.maxUploadBytes) {
        throw new Error(`Exceeds ${config.maxUploadBytes} byte limit`);
      }
      const info = parseImage(file.bytes);
      if (!info) throw new Error("Not a supported image (PNG, JPEG, GIF, WebP)");
      if (info.width * info.height > MAX_PIXELS) throw new Error("Image dimensions too large");

      const id = newAttachmentId();
      const key = buildKey(cardId, id);
      // Write bytes durably BEFORE the DB row, so a row never references a missing object.
      await putOriginal(bucket, key, file.bytes, info.contentType);

      position += ORDER_GAP;
      const row = {
        id,
        cardId,
        filename: sanitizeFilename(file.filename),
        contentType: info.contentType,
        size: file.bytes.byteLength,
        width: info.width,
        height: info.height,
        r2Key: key,
        position,
        createdAt: Date.now(),
      };
      try {
        await db.insert(attachment).values(row);
      } catch (dbErr) {
        // Roll back the orphaned object if the row write failed.
        await bucket.delete(key).catch(() => {});
        throw dbErr;
      }
      result.attachments.push(toAttachmentDto(row));
    } catch (err) {
      result.errors.push({
        filename: file.filename,
        error: err instanceof Error ? err.message : "Upload failed",
      });
    }
  }

  return result;
}

export async function getAttachment(db: AppDatabase, id: string) {
  const rows = await db.select().from(attachment).where(eq(attachment.id, id)).limit(1);
  const row = rows[0];
  if (!row) throw ApiError.notFound("Attachment");
  return row;
}

export async function listAttachments(db: AppDatabase, cardId: string): Promise<AttachmentDto[]> {
  const rows = await db
    .select()
    .from(attachment)
    .where(eq(attachment.cardId, cardId))
    .orderBy(asc(attachment.position));
  return rows.map(toAttachmentDto);
}

export async function deleteAttachment(
  db: AppDatabase,
  bucket: R2Bucket,
  id: string,
): Promise<void> {
  const row = await getAttachment(db, id);
  await db.delete(attachment).where(eq(attachment.id, id));
  await bucket.delete(row.r2Key).catch((err) => console.error("R2 delete failed:", err));
}

/** Keep a human-readable filename for alt text / downloads, but strip path parts. */
function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "image";
  const cleaned = base.replace(/[^\w.\-() ]+/g, "_").slice(0, 200).trim();
  return cleaned || "image";
}
