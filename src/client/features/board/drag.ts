import type { BoardSnapshot, CardDto } from "../../../shared/api";

export interface CardMove {
  cardId: string;
  version: number;
  toColumnId: string;
  beforeId: string | null;
  afterId: string | null;
  next: BoardSnapshot;
}

export interface ColumnMove {
  columnId: string;
  version: number;
  beforeId: string | null;
  afterId: string | null;
  next: BoardSnapshot;
}

/**
 * Compute a card move from a drag result. `overId` may be another card's id or
 * a column's id (dropping onto an empty column / column body). Returns null when
 * the drop is a no-op or the target can't be resolved.
 */
export function moveCardInSnapshot(
  snapshot: BoardSnapshot,
  activeCardId: string,
  overId: string,
): CardMove | null {
  // Hovering the card's own slot: nothing to move (without this, the -1 from
  // findIndex below would read as "append to end").
  if (activeCardId === overId) return null;

  const columns = snapshot.columns.map((c) => ({ ...c, cards: [...c.cards] }));

  let active: CardDto | undefined;
  let origColumnId = "";
  let origIndex = -1;
  for (const col of columns) {
    const i = col.cards.findIndex((c) => c.id === activeCardId);
    if (i >= 0) {
      active = col.cards[i];
      origColumnId = col.id;
      origIndex = i;
      break;
    }
  }
  if (!active) return null;

  // Resolve destination column + insertion index.
  let destColumnId: string;
  let insertIndex: number;
  const asColumn = columns.find((c) => c.id === overId);
  if (asColumn) {
    destColumnId = asColumn.id;
    insertIndex = asColumn.cards.filter((c) => c.id !== activeCardId).length; // append
  } else {
    const destCol = columns.find((c) => c.cards.some((c2) => c2.id === overId));
    if (!destCol) return null;
    destColumnId = destCol.id;
    const withoutActive = destCol.cards.filter((c) => c.id !== activeCardId);
    insertIndex = withoutActive.findIndex((c) => c.id === overId);
    if (insertIndex < 0) {
      insertIndex = withoutActive.length;
    } else if (destColumnId === origColumnId && origIndex < insertIndex + 1) {
      // Same-column drag downward: land AFTER the hovered card (arrayMove
      // semantics), otherwise dragging down one slot is a no-op.
      insertIndex += 1;
    }
  }

  if (destColumnId === origColumnId && insertIndex === origIndex) return null;

  // Apply to the cloned model.
  const source = columns.find((c) => c.id === origColumnId)!;
  source.cards.splice(origIndex, 1);
  const dest = columns.find((c) => c.id === destColumnId)!;
  const movedCard = { ...active, columnId: destColumnId };
  dest.cards.splice(insertIndex, 0, movedCard);

  const beforeId = dest.cards[insertIndex - 1]?.id ?? null;
  const afterId = dest.cards[insertIndex + 1]?.id ?? null;

  return {
    cardId: activeCardId,
    version: active.version,
    toColumnId: destColumnId,
    beforeId,
    afterId,
    next: { ...snapshot, columns },
  };
}

function findCardPosition(
  snapshot: BoardSnapshot,
  cardId: string,
): { columnId: string; index: number } | null {
  for (const col of snapshot.columns) {
    const index = col.cards.findIndex((c) => c.id === cardId);
    if (index >= 0) return { columnId: col.id, index };
  }
  return null;
}

/**
 * Live preview while dragging: move the card into the column under the pointer
 * so dnd-kit can animate cards making room. Only cross-column moves are
 * previewed — same-column reordering is already rendered by sortable
 * transforms and applied on drop. Returns null when nothing should change.
 */
export function previewCardMove(
  snapshot: BoardSnapshot,
  activeCardId: string,
  overId: string,
): BoardSnapshot | null {
  const from = findCardPosition(snapshot, activeCardId);
  if (!from) return null;

  const overColumnId = snapshot.columns.some((c) => c.id === overId)
    ? overId
    : findCardPosition(snapshot, overId)?.columnId;
  if (!overColumnId || overColumnId === from.columnId) return null;

  return moveCardInSnapshot(snapshot, activeCardId, overId)?.next ?? null;
}

/**
 * Finalize a card drag: apply any last reorder relative to `overId` on the
 * live (possibly cross-column previewed) snapshot, then diff against the
 * drag-origin snapshot to decide whether the move needs persisting.
 */
export function finalizeCardMove(
  origin: BoardSnapshot,
  current: BoardSnapshot,
  cardId: string,
  overId: string,
): { next: BoardSnapshot; move: CardMove | null } {
  const next = moveCardInSnapshot(current, cardId, overId)?.next ?? current;

  const origPos = findCardPosition(origin, cardId);
  const nextPos = findCardPosition(next, cardId);
  if (!origPos || !nextPos) return { next, move: null };
  if (origPos.columnId === nextPos.columnId && origPos.index === nextPos.index) {
    return { next, move: null };
  }

  const destCol = next.columns.find((c) => c.id === nextPos.columnId)!;
  const card = destCol.cards[nextPos.index]!;
  return {
    next,
    move: {
      cardId,
      version: card.version,
      toColumnId: nextPos.columnId,
      beforeId: destCol.cards[nextPos.index - 1]?.id ?? null,
      afterId: destCol.cards[nextPos.index + 1]?.id ?? null,
      next,
    },
  };
}

export function moveColumnInSnapshot(
  snapshot: BoardSnapshot,
  activeColumnId: string,
  overColumnId: string,
): ColumnMove | null {
  const columns = [...snapshot.columns];
  const from = columns.findIndex((c) => c.id === activeColumnId);
  const to = columns.findIndex((c) => c.id === overColumnId);
  if (from < 0 || to < 0 || from === to) return null;

  const active = columns[from]!;
  const [moved] = columns.splice(from, 1);
  columns.splice(to, 0, moved!);

  const idx = columns.findIndex((c) => c.id === activeColumnId);
  const beforeId = columns[idx - 1]?.id ?? null;
  const afterId = columns[idx + 1]?.id ?? null;

  return {
    columnId: activeColumnId,
    version: active.version,
    beforeId,
    afterId,
    next: { ...snapshot, columns },
  };
}
