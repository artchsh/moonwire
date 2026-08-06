import { describe, it, expect } from "vitest";
import { positionBetween, rebalancePositions, ORDER_GAP } from "../../src/worker/lib/ordering";

describe("ordering", () => {
  it("finds the midpoint between neighbours", () => {
    expect(positionBetween(1024, 2048)).toBe(1536);
  });

  it("places at the ends", () => {
    expect(positionBetween(null, null)).toBe(ORDER_GAP);
    expect(positionBetween(1024, null)).toBe(2048);
    expect(positionBetween(null, 2048)).toBe(1024);
  });

  it("signals a rebalance when no integer fits", () => {
    expect(positionBetween(1024, 1025)).toBeNull();
    expect(positionBetween(1024, 1024)).toBeNull();
  });

  it("rebalances to even gaps", () => {
    expect(rebalancePositions(["a", "b", "c"])).toEqual([
      { id: "a", position: 1024 },
      { id: "b", position: 2048 },
      { id: "c", position: 3072 },
    ]);
  });
});
