/**
 * Fractional-integer ordering. New items are spaced by a fixed gap so that
 * inserts between neighbours usually need only one integer, and a full
 * rebalance (renumber every sibling) is required only when the gap closes.
 */
export const ORDER_GAP = 1024;

/**
 * The integer midpoint between two neighbouring positions.
 * - `positionBetween(null, first)` places before the first item.
 * - `positionBetween(last, null)` places after the last item.
 * - `positionBetween(null, null)` is the first item in an empty list.
 * Returns `null` when no integer exists between adjacent neighbours, signalling
 * that the caller must rebalance.
 */
export function positionBetween(
  before: number | null,
  after: number | null,
): number | null {
  if (before === null && after === null) return ORDER_GAP;
  if (before === null) return (after as number) - ORDER_GAP;
  if (after === null) return before + ORDER_GAP;
  if (after - before <= 1) return null; // no room — rebalance needed
  return before + Math.floor((after - before) / 2);
}

/** Assign evenly-gapped positions to an ordered list of ids. */
export function rebalancePositions(
  ids: string[],
): Array<{ id: string; position: number }> {
  return ids.map((id, index) => ({ id, position: (index + 1) * ORDER_GAP }));
}
