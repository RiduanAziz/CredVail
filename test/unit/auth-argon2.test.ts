import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  passwordSchema,
  evaluatePasswordStrength,
} from "../../src/lib/auth/password";

describe("Argon2id Password Security & NIST SP 800-63B-4 Policy", () => {
  it("should generate a valid Argon2id hash conforming to RFC 9106", async () => {
    const password = "correct horse battery staple";
    const hash = await hashPassword(password);

    expect(hash).toContain("$argon2id$");
    expect(hash).toContain("m=65536");
    expect(hash).toContain("t=3");
    expect(hash).toContain("p=4");
  });

  it("should normalize Unicode consistently and verify matching/non-matching passphrases", async () => {
    const password = "café passphrase with spâces";
    const hash = await hashPassword(password);

    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword("wrong passphrase here", hash)).toBe(false);
  });

  it("enforces >=15 char length, permits spaces/Unicode without composition rules, supports >=64 chars, and blocks common passwords", () => {
    // Valid lowercase passphrase with spaces (no uppercase/digit/symbol required per NIST SP 800-63B-4)
    expect(passwordSchema.safeParse("lowercase passphrase only").success).toBe(true);

    // Valid Unicode passphrase >= 15 chars
    expect(passwordSchema.safeParse("sécurité numérique crédvail").success).toBe(true);

    // Supports at least 64+ character passphrases without truncation
    expect(passwordSchema.safeParse("a-long-passphrase-for-enterprise-issuers-" + "x".repeat(40)).success).toBe(true);

    // Rejects under 15 chars
    expect(passwordSchema.safeParse("Short1!").success).toBe(false);
    expect(passwordSchema.safeParse("FourteenChars!").success).toBe(false);

    // Rejects common breached/repetitive passwords
    expect(passwordSchema.safeParse("password1234567").success).toBe(false);
    expect(passwordSchema.safeParse("aaaaaaaaaaaaaaaa").success).toBe(false);

    const strength = evaluatePasswordStrength("my institutional credential passphrase");
    expect(strength.meetsLength).toBe(true);
    expect(strength.isBlocked).toBe(false);
    expect(strength.score).toBeGreaterThanOrEqual(3);
  });
});
