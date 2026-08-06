import type { AttachmentRow } from "../../db/schema";
import type { AttachmentDto } from "../../../shared/api";

/**
 * Map a stored attachment row to its wire DTO. The image bytes are never
 * embedded in JSON — clients fetch them (with credentials) from these URLs.
 */
export function toAttachmentDto(row: AttachmentRow): AttachmentDto {
  return {
    id: row.id,
    cardId: row.cardId,
    filename: row.filename,
    contentType: row.contentType,
    size: row.size,
    width: row.width,
    height: row.height,
    position: row.position,
    createdAt: row.createdAt,
    contentUrl: `/api/v1/attachments/${row.id}/content`,
    thumbnailUrl: `/api/v1/attachments/${row.id}/thumbnail`,
  };
}
