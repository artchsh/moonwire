import { describe, it, expect } from "vitest";
import { createUserSchema } from "../../src/worker/modules/auth/schemas";

describe("createUserSchema", () => {
  it("accepts a valid username and password", () => {
    const parsed = createUserSchema.parse({ username: "colleague", password: "hunter2!" });
    expect(parsed).toEqual({ username: "colleague", password: "hunter2!" });
  });

  it("trims the username", () => {
    expect(createUserSchema.parse({ username: "  bob  ", password: "password1" }).username).toBe("bob");
  });

  it("rejects a username shorter than 3 characters", () => {
    expect(() => createUserSchema.parse({ username: "ab", password: "password1" })).toThrow();
  });

  it("rejects a password shorter than 8 characters", () => {
    expect(() => createUserSchema.parse({ username: "colleague", password: "short" })).toThrow();
  });

  it("rejects unknown keys", () => {
    expect(() =>
      createUserSchema.parse({ username: "colleague", password: "password1", role: "admin" }),
    ).toThrow();
  });
});
