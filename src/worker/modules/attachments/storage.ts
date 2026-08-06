import { createId } from "../../lib/ids";

/** R2 object key for an attachment's original bytes. Never derived from client input. */
export function buildKey(cardId: string, attachmentId: string): string {
  return `uploads/${cardId}/${attachmentId}`;
}

export function newAttachmentId(): string {
  return createId("att");
}

export function putOriginal(
  bucket: R2Bucket,
  key: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<R2Object> {
  return bucket.put(key, bytes, {
    httpMetadata: { contentType, cacheControl: "private, max-age=31536000, immutable" },
  });
}

export function getObject(bucket: R2Bucket, key: string): Promise<R2ObjectBody | null> {
  return bucket.get(key);
}
