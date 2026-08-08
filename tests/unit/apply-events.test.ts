import { describe, it, expect } from "vitest";
import { applyBoardEvents } from "../../src/client/features/board/applyEvents";
import type {
  BoardEventDto,
  BoardEventPayload,
  BoardSnapshot,
  CardDto,
  ColumnWithCards,
} from "../../src/shared/api";

const SELF = "tab-self";
const OTHER = "tab-other";

function makeCard(id: string, columnId: string, over: Partial<CardDto> = {}): CardDto {
  return {
    id,
    columnId,
    boardId: "board_1",
    title: id,
    description: "",
    completed: false,
    position: 1024,
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    attachments: [],
    ...over,
  };
}

function makeColumn(id: string, cards: CardDto[] = [], over: Partial<ColumnWithCards> = {}): ColumnWithCards {
  return {
    id,
    boardId: "board_1",
    name: id,
    position: 1024,
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    cards,
    ...over,
  };
}

function makeSnapshot(columns: ColumnWithCards[]): BoardSnapshot {
  return {
    id: "board_1",
    name: "Board",
    position: 1024,
    version: 1,
    revision: 10,
    createdAt: 1,
    updatedAt: 1,
    columns,
  };
}

let rev = 100;
function event(payload: BoardEventPayload, actorId: string | null = OTHER): BoardEventDto {
  return { ...payload, revision: ++rev, actorId, at: 1 };
}

describe("applyBoardEvents", () => {
  it("skips events originated by this tab (echo suppression)", () => {
    const card = makeCard("card_a", "col_1");
    const snap = makeSnapshot([makeColumn("col_1", [card])]);
    const { snapshot, resync } = applyBoardEvents(
      snap,
      [event({ type: "card.deleted", cardId: "card_a" }, SELF)],
      SELF,
    );
    expect(resync).toBe(false);
    expect(snapshot.columns[0]!.cards).toHaveLength(1);
  });

  it("applies a foreign card update by replacement", () => {
    const card = makeCard("card_a", "col_1");
    const snap = makeSnapshot([makeColumn("col_1", [card])]);
    const updated = makeCard("card_a", "col_1", { title: "renamed", version: 2 });
    const { snapshot } = applyBoardEvents(snap, [event({ type: "card.updated", card: updated })], SELF);
    expect(snapshot.columns[0]!.cards[0]!.title).toBe("renamed");
    expect(snapshot.columns[0]!.cards[0]!.version).toBe(2);
  });

  it("never rolls back local state that is newer than the event", () => {
    const card = makeCard("card_a", "col_1", { title: "local-newer", version: 5 });
    const snap = makeSnapshot([makeColumn("col_1", [card])]);
    const stale = makeCard("card_a", "col_1", { title: "stale", version: 3 });
    const { snapshot } = applyBoardEvents(snap, [event({ type: "card.updated", card: stale })], SELF);
    expect(snapshot.columns[0]!.cards[0]!.title).toBe("local-newer");
  });

  it("applies equal-version updates (attachment changes do not bump the card version)", () => {
    const card = makeCard("card_a", "col_1", { version: 2 });
    const snap = makeSnapshot([makeColumn("col_1", [card])]);
    const withNewTitle = makeCard("card_a", "col_1", { title: "same-version", version: 2 });
    const { snapshot } = applyBoardEvents(snap, [event({ type: "card.updated", card: withNewTitle })], SELF);
    expect(snapshot.columns[0]!.cards[0]!.title).toBe("same-version");
  });

  it("moves a card across columns and keeps position order", () => {
    const a = makeCard("card_a", "col_1", { position: 1024 });
    const b = makeCard("card_b", "col_2", { position: 1024 });
    const snap = makeSnapshot([makeColumn("col_1", [a]), makeColumn("col_2", [b])]);
    const moved = makeCard("card_a", "col_2", { position: 512, version: 2 });
    const { snapshot } = applyBoardEvents(snap, [event({ type: "card.updated", card: moved })], SELF);
    expect(snapshot.columns[0]!.cards).toHaveLength(0);
    expect(snapshot.columns[1]!.cards.map((c) => c.id)).toEqual(["card_a", "card_b"]);
  });

  it("inserts created cards and columns in position order, idempotently", () => {
    const snap = makeSnapshot([makeColumn("col_1", [], { position: 2048 })]);
    const newColumn = makeColumn("col_0", [], { position: 1024 });
    const newCard = makeCard("card_a", "col_1");
    const events = [
      event({ type: "column.created", column: newColumn }),
      event({ type: "card.created", card: newCard }),
      // Duplicate delivery must not double-insert.
      event({ type: "card.created", card: newCard }),
    ];
    const { snapshot } = applyBoardEvents(snap, events, SELF);
    expect(snapshot.columns.map((c) => c.id)).toEqual(["col_0", "col_1"]);
    expect(snapshot.columns[1]!.cards).toHaveLength(1);
  });

  it("deletes cards and columns", () => {
    const card = makeCard("card_a", "col_1");
    const snap = makeSnapshot([makeColumn("col_1", [card]), makeColumn("col_2")]);
    const events = [
      event({ type: "card.deleted", cardId: "card_a" }),
      event({ type: "column.deleted", columnId: "col_2" }),
    ];
    const { snapshot } = applyBoardEvents(snap, events, SELF);
    expect(snapshot.columns).toHaveLength(1);
    expect(snapshot.columns[0]!.cards).toHaveLength(0);
  });

  it("applies board renames without touching columns", () => {
    const snap = makeSnapshot([makeColumn("col_1")]);
    const { snapshot } = applyBoardEvents(
      snap,
      [event({ type: "board.updated", board: { id: "board_1", name: "New name", position: 1024, version: 2, createdAt: 1, updatedAt: 2 } })],
      SELF,
    );
    expect(snapshot.name).toBe("New name");
    expect(snapshot.columns).toHaveLength(1);
    expect(snapshot.revision).toBe(10);
  });

  it("requests a resync on board.refresh", () => {
    const snap = makeSnapshot([makeColumn("col_1")]);
    const { resync } = applyBoardEvents(snap, [event({ type: "board.refresh" }, null)], SELF);
    expect(resync).toBe(true);
  });

  it("requests a resync when an event references an unknown column", () => {
    const snap = makeSnapshot([makeColumn("col_1")]);
    const orphan = makeCard("card_x", "col_missing");
    const { resync } = applyBoardEvents(snap, [event({ type: "card.created", card: orphan })], SELF);
    expect(resync).toBe(true);
  });
});
