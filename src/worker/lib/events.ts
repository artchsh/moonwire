import { and, asc, eq, gt, lte, sql } from "drizzle-orm";
import type { AppDatabase } from "../db/client";
import { schema } from "../db/client";
import { createId } from "./ids";
import type { BoardEventPayload } from "../../shared/api";
import type { BoardEventRow } from "../db/schema";

const { board, boardEvent } = schema;

/** Events older than this many revisions behind the head are pruned; a client
 * further behind than this gets a `resync` instead of an incremental diff. */
export const EVENT_RETENTION = 500;

/** The originating browser tab's self-assigned X-Client-Id, for echo suppression. */
export function actorFromHeader(header: string | undefined): string | null {
  return header?.slice(0, 64) ?? null;
}

/**
 * Append events to a board's change log and bump its revision counter.
 *
 * The revision bump is a single atomic UPDATE...RETURNING, so concurrent
 * writers claim non-overlapping revision ranges. Emission is best-effort: the
 * data mutation has already committed, so a logging failure must not turn a
 * successful request into a 500 — clients fall back to snapshot refetch.
 */
export async function emitBoardEvents(
  db: AppDatabase,
  boardId: string,
  actorId: string | null,
  payloads: BoardEventPayload[],
): Promise<void> {
  if (payloads.length === 0) return;
  try {
    const bumped = await db
      .update(board)
      .set({ revision: sql`${board.revision} + ${payloads.length}` })
      .where(eq(board.id, boardId))
      .returning({ revision: board.revision });
    const head = bumped[0]?.revision;
    if (head === undefined) return; // board deleted concurrently — nothing to log

    const now = Date.now();
    const base = head - payloads.length;
    await db.insert(boardEvent).values(
      payloads.map((p, i) => ({
        id: createId("evt"),
        boardId,
        revision: base + i + 1,
        actorId,
        type: p.type,
        payload: JSON.stringify(p),
        createdAt: now,
      })),
    );
    await db
      .delete(boardEvent)
      .where(and(eq(boardEvent.boardId, boardId), lte(boardEvent.revision, head - EVENT_RETENTION)));
  } catch (err) {
    console.error("Failed to emit board events:", err);
  }
}

/** Events with revision > since, oldest first. */
export function listBoardEvents(
  db: AppDatabase,
  boardId: string,
  since: number,
): Promise<BoardEventRow[]> {
  return db
    .select()
    .from(boardEvent)
    .where(and(eq(boardEvent.boardId, boardId), gt(boardEvent.revision, since)))
    .orderBy(asc(boardEvent.revision));
}
