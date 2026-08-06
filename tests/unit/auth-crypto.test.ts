import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  sha256Hex,
  createAgentTokenSecret,
} from "../../src/worker/lib/auth";

describe("auth crypto", () => {
  it("hashes and verifies passwords (PBKDF2)", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("pbkdf2$sha256$")).toBe(true);
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("uses a fresh salt per hash", async () => {
    const a = await hashPassword("same");
    const b = await hashPassword("same");
    expect(a).not.toEqual(b);
  });

  it("mints agent tokens in the mw_ format and hashes them", async () => {
    const { plaintext, hash } = await createAgentTokenSecret();
    expect(plaintext).toMatch(/^mw_[A-Za-z0-9_-]{43}$/);
    expect(hash).toEqual(await sha256Hex(plaintext));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
