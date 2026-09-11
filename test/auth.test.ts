import { describe, it, expect, beforeAll } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSessionToken, verifySessionToken } from "@/lib/auth/token";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-value";
});

describe("password hashing", () => {
  it("hashes a password and verifies it back", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(hash).not.toBe("correct-horse-battery-staple");
    expect(await verifyPassword("correct-horse-battery-staple", hash)).toBe(true);
  });

  it("rejects the wrong password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });
});

describe("session token", () => {
  it("round-trips a valid token", () => {
    const token = createSessionToken({ uid: "user_1", role: "ADMIN" });
    const payload = verifySessionToken(token);
    expect(payload?.uid).toBe("user_1");
    expect(payload?.role).toBe("ADMIN");
  });

  it("rejects a tampered token", () => {
    const token = createSessionToken({ uid: "user_1", role: "EDITOR" });
    const [data] = token.split(".");
    const tampered = `${data}.` + "a".repeat(43);
    expect(verifySessionToken(tampered)).toBeNull();
  });

  it("rejects an expired token", () => {
    const originalNow = Date.now;
    const token = createSessionToken({ uid: "user_1", role: "VIEWER" });
    Date.now = () => originalNow() + 31 * 24 * 60 * 60 * 1000;
    try {
      expect(verifySessionToken(token)).toBeNull();
    } finally {
      Date.now = originalNow;
    }
  });

  it("rejects garbage input", () => {
    expect(verifySessionToken(null)).toBeNull();
    expect(verifySessionToken("not-a-token")).toBeNull();
  });
});
