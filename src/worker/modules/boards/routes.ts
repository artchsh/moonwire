import { Hono } from "hono";
import type { Context } from "hono";
import type { HonoEnv } from "../../types";
import { requireRead, requireWrite } from "../../lib/auth";
import { actorFromHeader, emitBoardEvents, listBoardEvents } from "../../lib/events";
import { ApiError } from "../../lib/errors";
import type { BoardEventDto, BoardEventPayload, BoardEventsResponse } from "../../../shared/api";
import * as repo from "./repository";
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

function actorId(c: Context<HonoEnv>): string | null {
  return actorFromHeader(c.req.header("x-client-id"));
}

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

boardsRouter.get("/boards/:id/events", requireRead, async (c) => {
  const since = Number(c.req.query("since") ?? "0");
  if (!Number.isInteger(since) || since < 0) {
    throw new ApiError("VALIDATION_ERROR", "since must be a non-negative integer");
  }
  const boardRow = await repo.getBoard(c.var.db, c.req.param("id"));
  if (!boardRow) throw ApiError.notFound("Board");

  const revision = boardRow.revision;
  if (since === revision) return c.json<BoardEventsResponse>({ revision, events: [] });
  // Ahead of the server (e.g. after a restore reset the counter) — resync.
  if (since > revision) return c.json<BoardEventsResponse>({ revision, events: [], resync: true });

  const rows = await listBoardEvents(c.var.db, boardRow.id, since);
  // Revisions are dense; a shorter run than expected means the tail was pruned.
  if (rows.length !== revision - since) {
    return c.json<BoardEventsResponse>({ revision, events: [], resync: true });
  }
  const events: BoardEventDto[] = rows.map((r) => ({
    ...(JSON.parse(r.payload) as BoardEventPayload),
    revision: r.revision,
    actorId: r.actorId,
    at: r.createdAt,
  }));
  return c.json<BoardEventsResponse>({ revision, events });
});

boardsRouter.patch("/boards/:id", requireWrite, async (c) => {
  const body = updateBoardSchema.parse(await c.req.json());
  const updated = await service.updateBoard(c.var.db, c.req.param("id"), body.version, { name: body.name });
  await emitBoardEvents(c.var.db, updated.id, actorId(c), [{ type: "board.updated", board: updated }]);
  return c.json(updated);
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
  const column = await service.createColumn(c.var.db, c.req.param("id"), body.name);
  await emitBoardEvents(c.var.db, column.boardId, actorId(c), [{ type: "column.created", column }]);
  return c.json(column, 201);
});

boardsRouter.patch("/columns/:id", requireWrite, async (c) => {
  const body = updateColumnSchema.parse(await c.req.json());
  const column = await service.updateColumn(c.var.db, c.req.param("id"), body.version, { name: body.name });
  await emitBoardEvents(c.var.db, column.boardId, actorId(c), [{ type: "column.updated", column }]);
  return c.json(column);
});

boardsRouter.post("/columns/:id/move", requireWrite, async (c) => {
  const body = moveColumnSchema.parse(await c.req.json());
  const column = await service.moveColumn(c.var.db, c.req.param("id"), body.version, body.beforeId, body.afterId);
  await emitBoardEvents(c.var.db, column.boardId, actorId(c), [{ type: "column.updated", column }]);
  return c.json(column);
});

boardsRouter.delete("/columns/:id", requireWrite, async (c) => {
  const body = deleteColumnSchema.parse(await readJson(c));
  const columnId = c.req.param("id");
  const { boardId, relocated } = await service.deleteColumn(c.var.db, columnId, body.relocateToColumnId);
  // Relocation rewrote card rows in the destination column — everyone refetches.
  await emitBoardEvents(c.var.db, boardId, relocated ? null : actorId(c), [
    { type: "column.deleted", columnId },
    ...(relocated ? [{ type: "board.refresh" } as const] : []),
  ]);
  return c.body(null, 204);
});

// ---- Cards ----

boardsRouter.post("/columns/:id/cards", requireWrite, async (c) => {
  const body = createCardSchema.parse(await c.req.json());
  const card = await service.createCard(c.var.db, c.req.param("id"), body);
  await emitBoardEvents(c.var.db, card.boardId, actorId(c), [{ type: "card.created", card }]);
  return c.json(card, 201);
});

boardsRouter.get("/cards/:id", requireRead, async (c) => {
  return c.json(await service.getCardWithAttachments(c.var.db, c.req.param("id")));
});

boardsRouter.patch("/cards/:id", requireWrite, async (c) => {
  const body = updateCardSchema.parse(await c.req.json());
  const card = await service.updateCard(c.var.db, c.req.param("id"), body.version, {
    title: body.title,
    description: body.description,
    completed: body.completed,
  });
  await emitBoardEvents(c.var.db, card.boardId, actorId(c), [{ type: "card.updated", card }]);
  return c.json(card);
});

boardsRouter.post("/cards/:id/move", requireWrite, async (c) => {
  const body = moveCardSchema.parse(await c.req.json());
  const card = await service.moveCard(c.var.db, c.req.param("id"), body.version, body.toColumnId, body.beforeId, body.afterId);
  await emitBoardEvents(c.var.db, card.boardId, actorId(c), [{ type: "card.updated", card }]);
  return c.json(card);
});

boardsRouter.delete("/cards/:id", requireWrite, async (c) => {
  const cardId = c.req.param("id");
  const { boardId } = await service.deleteCard(c.var.db, c.env.UPLOADS, cardId);
  await emitBoardEvents(c.var.db, boardId, actorId(c), [{ type: "card.deleted", cardId }]);
  return c.body(null, 204);
});
