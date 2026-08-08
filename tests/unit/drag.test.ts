import { describe, expect, it } from "vitest";
import { finalizeCardMove, moveCardInSnapshot, previewCardMove } from "../../src/client/features/board/drag";
import type { BoardSnapshot, CardDto, ColumnWithCards } from "../../src/shared/api";

function card(id: string, columnId: string): CardDto {
  return {
    id,
    columnId,
    title: id,
    description: "",
    completed: false,
    position: "",
    version: 1,
    attachments: [],
  } as unknown as CardDto;
}

function column(id: string, cardIds: string[]): ColumnWithCards {
  return {
    id,
    boardId: "b1",
    name: id,
    position: "",
    version: 1,
    cards: cardIds.map((c) => card(c, id)),
  } as unknown as ColumnWithCards;
}

function snapshot(cols: ColumnWithCards[]): BoardSnapshot {
  return { columns: cols } as unknown as BoardSnapshot;
}

function cardIds(s: BoardSnapshot, columnId: string): string[] {
  return s.columns.find((c) => c.id === columnId)!.cards.map((c) => c.id);
}

describe("previewCardMove", () => {
  it("moves a card into another column when hovering a card there", () => {
    const s = snapshot([column("col1", ["a", "b"]), column("col2", ["c"])]);
    const next = previewCardMove(s, "a", "c");
    expect(next).not.toBeNull();
    expect(cardIds(next!, "col1")).toEqual(["b"]);
    expect(cardIds(next!, "col2")).toEqual(["a", "c"]);
  });

  it("moves a card onto an empty column", () => {
    const s = snapshot([column("col1", ["a"]), column("col2", [])]);
    const next = previewCardMove(s, "a", "col2");
    expect(next).not.toBeNull();
    expect(cardIds(next!, "col2")).toEqual(["a"]);
  });

  it("returns null for same-column targets (sortable handles those)", () => {
    const s = snapshot([column("col1", ["a", "b"]), column("col2", ["c"])]);
    expect(previewCardMove(s, "a", "b")).toBeNull();
    expect(previewCardMove(s, "a", "col1")).toBeNull();
  });

  it("returns null for unknown targets", () => {
    const s = snapshot([column("col1", ["a"])]);
    expect(previewCardMove(s, "a", "nope")).toBeNull();
  });
});

describe("finalizeCardMove", () => {
  it("persists a cross-column move that was already previewed", () => {
    const origin = snapshot([column("col1", ["a", "b"]), column("col2", ["c"])]);
    const previewed = previewCardMove(origin, "a", "c")!; // a now before c in col2
    // Dropping on the card's own slot keeps the previewed position.
    const { move } = finalizeCardMove(origin, previewed, "a", "a");
    expect(move).not.toBeNull();
    expect(move!.toColumnId).toBe("col2");
    expect(move!.beforeId).toBeNull();
    expect(move!.afterId).toBe("c");
  });

  it("applies a final same-column adjustment when dropped over a neighbour", () => {
    const origin = snapshot([column("col1", ["a", "b"]), column("col2", ["c"])]);
    const previewed = previewCardMove(origin, "a", "c")!; // col2: [a, c]
    const { move } = finalizeCardMove(origin, previewed, "a", "c"); // still hovering c: land after it
    expect(move).not.toBeNull();
    expect(move!.toColumnId).toBe("col2");
    expect(move!.beforeId).toBe("c");
    expect(move!.afterId).toBeNull();
  });

  it("persists a same-column drag downward (lands after the hovered card)", () => {
    const origin = snapshot([column("col1", ["a", "b", "c"])]);
    const { next, move } = finalizeCardMove(origin, origin, "a", "c");
    expect(cardIds(next, "col1")).toEqual(["b", "c", "a"]);
    expect(move).not.toBeNull();
    expect(move!.toColumnId).toBe("col1");
    expect(move!.beforeId).toBe("c");
    expect(move!.afterId).toBeNull();
  });

  it("moves one slot down within a column (regression: was a no-op)", () => {
    const origin = snapshot([column("col1", ["a", "b"])]);
    const { next, move } = finalizeCardMove(origin, origin, "a", "b");
    expect(cardIds(next, "col1")).toEqual(["b", "a"]);
    expect(move).not.toBeNull();
  });

  it("persists a same-column drag upward (lands before the hovered card)", () => {
    const origin = snapshot([column("col1", ["a", "b", "c"])]);
    const { next, move } = finalizeCardMove(origin, origin, "c", "a");
    expect(cardIds(next, "col1")).toEqual(["c", "a", "b"]);
    expect(move).not.toBeNull();
  });

  it("returns no move when the card ends up back where it started", () => {
    const origin = snapshot([column("col1", ["a", "b"]), column("col2", ["c"])]);
    const previewed = previewCardMove(origin, "a", "c")!;
    const backHome = moveCardInSnapshot(previewed, "a", "b")!.next; // dragged back before b
    expect(cardIds(backHome, "col1")).toEqual(["a", "b"]);
    const { move } = finalizeCardMove(origin, backHome, "a", "a"); // dropped on its own slot
    expect(move).toBeNull();
  });

  it("ignores drops onto the card's own slot", () => {
    const origin = snapshot([column("col1", ["a", "b"])]);
    expect(moveCardInSnapshot(origin, "a", "a")).toBeNull();
  });
});
