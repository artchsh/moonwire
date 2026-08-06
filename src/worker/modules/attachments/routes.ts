import { Hono } from "hono";
import type { Context } from "hono";
import type { HonoEnv } from "../../types";
import { requireRead, requireWrite } from "../../lib/auth";
import { ApiError } from "../../lib/errors";
import * as service from "./service";
import type { UploadFile } from "./service";
import { getObject } from "./storage";

export const attachmentsRouter = new Hono<HonoEnv>();

attachmentsRouter.get("/cards/:cardId/attachments", requireRead, async (c) => {
  return c.json({ attachments: await service.listAttachments(c.var.db, c.req.param("cardId")) });
});

attachmentsRouter.post("/cards/:cardId/attachments", requireWrite, async (c) => {
  const contentType = c.req.header("Content-Type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    throw new ApiError("UNSUPPORTED_MEDIA_TYPE", "Expected multipart/form-data");
  }
  const form = await c.req.formData();
  const parts = [...form.getAll("files"), ...form.getAll("file")];
  const files: UploadFile[] = [];
  for (const part of parts) {
    if (part instanceof File) {
      files.push({ filename: part.name, bytes: new Uint8Array(await part.arrayBuffer()) });
    }
  }
  if (files.length === 0) throw new ApiError("VALIDATION_ERROR", "No files provided");

  const result = await service.uploadAttachments(
    c.var.db,
    c.env.UPLOADS,
    c.req.param("cardId"),
    files,
    c.var.config,
  );
  // 207-ish semantics: 201 when anything succeeded, 400 when everything failed.
  const status = result.attachments.length > 0 ? 201 : 400;
  return c.json(result, status);
});

attachmentsRouter.delete("/attachments/:id", requireWrite, async (c) => {
  await service.deleteAttachment(c.var.db, c.env.UPLOADS, c.req.param("id"));
  return c.body(null, 204);
});

// Original bytes. Read scope is enough (agents may download images).
attachmentsRouter.get("/attachments/:id/content", requireRead, streamAttachment);
// No server-side resizing on Workers (sharp is unavailable); the thumbnail
// endpoint serves the original and the client scales it down.
attachmentsRouter.get("/attachments/:id/thumbnail", requireRead, streamAttachment);

async function streamAttachment(c: Context<HonoEnv>) {
  const row = await service.getAttachment(c.var.db, c.req.param("id")!);
  const object = await getObject(c.env.UPLOADS, row.r2Key);
  if (!object) throw ApiError.notFound("Image data");

  const asciiName = row.filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'");
  return new Response(object.body, {
    headers: {
      "Content-Type": row.contentType,
      "Content-Length": String(row.size),
      "Content-Disposition": `inline; filename="${asciiName}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=86400",
    },
  });
}
