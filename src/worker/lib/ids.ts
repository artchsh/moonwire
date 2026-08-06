import { ulid } from "ulid";

/**
 * Stable, sortable, prefixed identifiers, e.g. `card_01J...`.
 * The prefix names the resource type; the body is a Crockford base32 ULID.
 */
export type IdPrefix =
  | "adm"
  | "tok"
  | "board"
  | "col"
  | "card"
  | "att";

export function createId(prefix: IdPrefix): string {
  return `${prefix}_${ulid()}`;
}

const ID_PATTERN = /^[a-z]+_[0-9A-HJKMNP-TV-Z]{26}$/;

export function isId(prefix: IdPrefix, value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith(`${prefix}_`) &&
    ID_PATTERN.test(value)
  );
}
