import { Hono } from "hono";
import type { HonoEnv } from "../../types";
import { requireRead, requireWrite } from "../../lib/auth";
import * as service from "./service";
import {
  createBoardSchema,
  updateBoardSchema,
  createColumnSchema,
  updateColumnSchema,
  createCardSchema,
  updateCardSchema,
  moveCardSchema,
  moveColumnSchema,
  moveBoardSchema,
  deleteColumnSchema,
} from "./schemas";

export const boardsRouter = new Hono<HonoEnv>();

/** Read a request body as JSON, tolerating an empty body (returns {}). */
async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return {};
  }
}

// ---- Boards ----

boardsRouter.get("/boards", requireRead, async (c) => {
  return c.json({ boards: await service.listBoards(c.var.db) });
});

boardsRouter.post("/boards", requireWrite, async (c) => {
  const body = createBoardSchema.parse(await c.req.json());
  return c.json(await service.createBoard(c.var.db, body.name), 201);
});

boardsRouter.get("/boards/:id/snapshot", requireRead, async (c) => {
  return c.json(await service.getSnapshot(c.var.db, c.req.param("id")));
});

boardsRouter.patch("/boards/:id", requireWrite, async (c) => {
  const body = updateBoardSchema.parse(await c.req.json());
  return c.json(await service.updateBoard(c.var.db, c.req.param("id"), body.version, { name: body.name }));
});

boardsRouter.post("/boards/:id/move", requireWrite, async (c) => {
  const body = moveBoardSchema.parse(await c.req.json());
  return c.json(await service.moveBoard(c.var.db, c.req.param("id"), body.version, body.beforeId, body.afterId));
});

boardsRouter.delete("/boards/:id", requireWrite, async (c) => {
  await service.deleteBoard(c.var.db, c.env.UPLOADS, c.req.param("id"));
  return c.body(null, 204);
});

// ---- Columns ----

boardsRouter.post("/boards/:id/columns", requireWrite, async (c) => {
  const body = createColumnSchema.parse(await c.req.json());
  return c.json(await service.createColumn(c.var.db, c.req.param("id"), body.name), 201);
});

boardsRouter.patch("/columns/:id", requireWrite, async (c) => {
  const body = updateColumnSchema.parse(await c.req.json());
  return c.json(await service.updateColumn(c.var.db, c.req.param("id"), body.version, { name: body.name }));
});

boardsRouter.post("/columns/:id/move", requireWrite, async (c) => {
  const body = moveColumnSchema.parse(await c.req.json());
  return c.json(await service.moveColumn(c.var.db, c.req.param("id"), body.version, body.beforeId, body.afterId));
});

boardsRouter.delete("/columns/:id", requireWrite, async (c) => {
  const body = deleteColumnSchema.parse(await readJson(c));
  await service.deleteColumn(c.var.db, c.req.param("id"), body.relocateToColumnId);
  return c.body(null, 204);
});

// ---- Cards ----

boardsRouter.post("/columns/:id/cards", requireWrite, async (c) => {
  const body = createCardSchema.parse(await c.req.json());
  return c.json(await service.createCard(c.var.db, c.req.param("id"), body), 201);
});

boardsRouter.get("/cards/:id", requireRead, async (c) => {
  return c.json(await service.getCardWithAttachments(c.var.db, c.req.param("id")));
});

boardsRouter.patch("/cards/:id", requireWrite, async (c) => {
  const body = updateCardSchema.parse(await c.req.json());
  return c.json(
    await service.updateCard(c.var.db, c.req.param("id"), body.version, {
      title: body.title,
      description: body.description,
    }),
  );
});

boardsRouter.post("/cards/:id/move", requireWrite, async (c) => {
  const body = moveCardSchema.parse(await c.req.json());
  return c.json(
    await service.moveCard(c.var.db, c.req.param("id"), body.version, body.toColumnId, body.beforeId, body.afterId),
  );
});

boardsRouter.delete("/cards/:id", requireWrite, async (c) => {
  await service.deleteCard(c.var.db, c.env.UPLOADS, c.req.param("id"));
  return c.body(null, 204);
});
