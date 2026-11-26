import { hash, verify } from "@node-rs/argon2";
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  normalizePasswordInput,
  isCommonOrRepetitivePassword,
  passwordSchema,
  evaluatePasswordStrength,
  isPasswordTooSimilarToEmail,
} from "./password-policy.ts";

export {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  normalizePasswordInput,
  isCommonOrRepetitivePassword,
  passwordSchema,
  evaluatePasswordStrength,
  isPasswordTooSimilarToEmail,
};

/**
 * OWASP recommended Argon2id configuration options.
 */
export const ARGON2_OPTIONS = {
  memoryCost: 65536, // 64 MB
  timeCost: 3,       // 3 iterations
  parallelism: 4,    // 4 threads
  outputLen: 32,
};

/**
 * Cryptographically hashes a plaintext password using Argon2id after NFKC normalization.
 */
export async function hashPassword(plaintext: string): Promise<string> {
  return hash(normalizePasswordInput(plaintext), ARGON2_OPTIONS);
}

/**
 * Securely verifies a plaintext password against an Argon2id hash after NFKC normalization.
 * Resistant to timing attacks.
 */
export async function verifyPassword(plaintext: string, passwordHash: string): Promise<boolean> {
  try {
    return await verify(passwordHash, normalizePasswordInput(plaintext), ARGON2_OPTIONS);
  } catch {
    return false;
  }
}
