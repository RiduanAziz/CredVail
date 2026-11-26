import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 15;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Curated blocklist of commonly breached, dictionary, and sequential passwords.
 */
const COMMON_PASSWORD_BLOCKLIST = new Set<string>([
  "password1234567",
  "123456789012345",
  "1234567890123456",
  "qwertyuiop12345",
  "letmeinplease123",
  "adminpassword123",
  "credvailpassword",
  "welcome12345678",
  "iloveyouforever1",
  "abcdefghijklmnop",
  "passwordpassword",
  "aaaaaaaaaaaaaaaa",
  "000000000000000",
  "trustno1trustno1",
  "passw0rdpassw0rd",
  "correcthorse123",
]);

/**
 * Normalizes passwords via Unicode NFKC without trimming leading/trailing spaces
 * or silently truncating characters (per NIST SP 800-63B-4).
 */
export function normalizePasswordInput(password: string): string {
  return password.normalize("NFKC");
}

export function isCommonOrRepetitivePassword(normalizedPassword: string): boolean {
  const lower = normalizedPassword.toLowerCase().trim();
  if (COMMON_PASSWORD_BLOCKLIST.has(lower)) {
    return true;
  }
  // Reject single repeated or trivially repetitive character passwords (e.g. "aaaaaaaaaaaaaaa")
  if (normalizedPassword.length > 0 && new Set(Array.from(normalizedPassword)).size <= 2) {
    return true;
  }
  return false;
}

/**
 * Zod schema aligned with NIST SP 800-63B-4 single-factor password guidance:
 * - Minimum 15 characters
 * - Maximum 128 characters (accepted at least 64+ chars without silent truncation)
 * - Spaces and Unicode characters permitted
 * - No mandatory composition rules (upper/lower/digit/symbol)
 * - Rejects common or repetitive passwords
 */
export const passwordSchema = z
  .string()
  .transform((val) => normalizePasswordInput(val))
  .refine(
    (val) => Array.from(val).length >= PASSWORD_MIN_LENGTH,
    `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`
  )
  .refine(
    (val) => Array.from(val).length <= PASSWORD_MAX_LENGTH,
    `Password must be at most ${PASSWORD_MAX_LENGTH} characters long`
  )
  .refine(
    (val) => !isCommonOrRepetitivePassword(val),
    "This password is too common or repetitive. Choose a stronger passphrase."
  );

export function evaluatePasswordStrength(raw: string): {
  length: number;
  meetsLength: boolean;
  isBlocked: boolean;
  score: 0 | 1 | 2 | 3 | 4;
  label: "Too Short" | "Weak" | "Fair" | "Strong" | "Very Strong";
} {
  const normalized = normalizePasswordInput(raw || "");
  const length = Array.from(normalized).length;
  const meetsLength = length >= PASSWORD_MIN_LENGTH && length <= PASSWORD_MAX_LENGTH;
  const isBlocked = length >= PASSWORD_MIN_LENGTH && isCommonOrRepetitivePassword(normalized);

  if (length === 0) {
    return { length, meetsLength: false, isBlocked: false, score: 0, label: "Too Short" };
  }
  if (!meetsLength) {
    return { length, meetsLength: false, isBlocked: false, score: 1, label: "Too Short" };
  }
  if (isBlocked) {
    return { length, meetsLength, isBlocked: true, score: 1, label: "Weak" };
  }

  const uniqueChars = new Set(Array.from(normalized)).size;
  if (length >= 22 && uniqueChars >= 10) {
    return { length, meetsLength: true, isBlocked: false, score: 4, label: "Very Strong" };
  }
  if (length >= 18 && uniqueChars >= 8) {
    return { length, meetsLength: true, isBlocked: false, score: 3, label: "Strong" };
  }
  return { length, meetsLength: true, isBlocked: false, score: 2, label: "Fair" };
}

/**
 * Validates that a password does not embed the user's email local part directly.
 */
export function isPasswordTooSimilarToEmail(password: string, email: string): boolean {
  const normalizedPwd = normalizePasswordInput(password).toLowerCase();
  const localPart = email.trim().toLowerCase().split("@")[0] || "";
  if (localPart.length >= 5 && normalizedPwd.includes(localPart)) {
    return true;
  }
  return false;
}
