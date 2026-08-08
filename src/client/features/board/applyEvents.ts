import type {
  BoardEventDto,
  BoardSnapshot,
  CardDto,
  ColumnWithCards,
} from "../../../shared/api";

export interface ApplyResult {
  snapshot: BoardSnapshot;
  /** True when incremental application wasn't safe — refetch the snapshot. */
  resync: boolean;
}

/**
 * Fold a batch of change-log events into a board snapshot.
 *
 * Pure and defensive: events from this tab (actorId === selfId) are skipped
 * because the optimistic mutation already applied them; events older than the
 * local row (version guard) are skipped so a slow poll can't roll back fresher
 * state; anything referencing rows we don't know about asks for a resync.
 */
export function applyBoardEvents(
  snapshot: BoardSnapshot,
  events: BoardEventDto[],
  selfId: string,
): ApplyResult {
  let s = snapshot;
  for (const e of events) {
    if (e.actorId === selfId) continue;
    switch (e.type) {
      case "board.refresh":
        return { snapshot: s, resync: true };

      case "board.updated":
        if (e.board.id === s.id && e.board.version >= s.version) {
          s = { ...s, ...e.board };
        }
        break;

      case "column.created":
        if (!findColumn(s, e.column.id)) {
          s = { ...s, columns: sortByPosition([...s.columns, { ...e.column, cards: [] }]) };
        }
        break;

      case "column.updated": {
        const existing = findColumn(s, e.column.id);
        if (!existing) return { snapshot: s, resync: true };
        if (existing.version > e.column.version) break;
        s = {
          ...s,
          columns: sortByPosition(
            s.columns.map((c) => (c.id === e.column.id ? { ...c, ...e.column } : c)),
          ),
        };
        break;
      }

      case "column.deleted":
        s = { ...s, columns: s.columns.filter((c) => c.id !== e.columnId) };
        break;

      case "card.created":
      case "card.updated": {
        const local = findCard(s, e.card.id);
        if (local && local.version > e.card.version) break;
        if (!findColumn(s, e.card.columnId)) return { snapshot: s, resync: true };
        s = removeCard(s, e.card.id);
        s = {
          ...s,
          columns: s.columns.map((c) =>
            c.id === e.card.columnId ? { ...c, cards: sortByPosition([...c.cards, e.card]) } : c,
          ),
        };
        break;
      }

      case "card.deleted":
        s = removeCard(s, e.cardId);
        break;
    }
  }
  return { snapshot: s, resync: false };
}

function findColumn(s: BoardSnapshot, id: string): ColumnWithCards | undefined {
  return s.columns.find((c) => c.id === id);
}

function findCard(s: BoardSnapshot, id: string): CardDto | undefined {
  for (const c of s.columns) {
    const hit = c.cards.find((k) => k.id === id);
    if (hit) return hit;
  }
  return undefined;
}

function removeCard(s: BoardSnapshot, id: string): BoardSnapshot {
  if (!findCard(s, id)) return s;
  return { ...s, columns: s.columns.map((c) => ({ ...c, cards: c.cards.filter((k) => k.id !== id) })) };
}

function sortByPosition<T extends { position: number; id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}
