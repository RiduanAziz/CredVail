import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, passwordSchema } from "../../src/lib/auth/password";

describe("Argon2id Password Security & Hashing", () => {
  it("should generate a valid Argon2id hash conforming to RFC 9106", async () => {
    const password = "StrongPassword123!";
    const hash = await hashPassword(password);

    expect(hash).toContain("$argon2id$");
    expect(hash).toContain("m=65536");
    expect(hash).toContain("t=3");
    expect(hash).toContain("p=4");
  });

  it("should successfully verify a correct password against its Argon2id hash", async () => {
    const password = "CorrectHorseBatteryStaple99#";
    const hash = await hashPassword(password);

    const isMatch = await verifyPassword(password, hash);
    expect(isMatch).toBe(true);
  });

  it("should reject an incorrect password", async () => {
    const password = "ValidPassword123$";
    const hash = await hashPassword(password);

    const isMatch = await verifyPassword("WrongPassword123$", hash);
    expect(isMatch).toBe(false);
  });

  it("should enforce strong password policy constraints via Zod", () => {
    // Valid password
    expect(passwordSchema.safeParse("ValidPass123!").success).toBe(true);

    // Too short (< 8 chars)
    expect(passwordSchema.safeParse("Short1!").success).toBe(false);

    // Missing uppercase
    expect(passwordSchema.safeParse("lowercase123!").success).toBe(false);

    // Missing lowercase
    expect(passwordSchema.safeParse("UPPERCASE123!").success).toBe(false);

    // Missing digit
    expect(passwordSchema.safeParse("NoDigitsAllowed!").success).toBe(false);

    // Missing special symbol
    expect(passwordSchema.safeParse("NoSpecialChar123").success).toBe(false);
  });
});
