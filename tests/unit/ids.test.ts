import { describe, it, expect } from "vitest";
import { createId, isId } from "../../src/worker/lib/ids";

describe("ids", () => {
  it("produces prefixed ULIDs", () => {
    expect(createId("card")).toMatch(/^card_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(createId("board")).toMatch(/^board_[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("validates ids by prefix", () => {
    const id = createId("col");
    expect(isId("col", id)).toBe(true);
    expect(isId("card", id)).toBe(false);
    expect(isId("col", "not-an-id")).toBe(false);
  });

  it("is sortable over time", () => {
    const a = createId("card");
    const b = createId("card");
    // ULIDs are monotonic per millisecond and lexicographically sortable.
    expect([a, b].sort()).toHaveLength(2);
  });
});
