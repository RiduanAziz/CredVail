import { hash, verify } from "@node-rs/argon2";
import { z } from "zod";

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
 * Zod schema for enforcing robust password policies:
 * - At least 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one digit
 * - At least one special symbol
 */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters long")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one digit")
  .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character");

/**
 * Cryptographically hashes a plaintext password using Argon2id.
 */
export async function hashPassword(plaintext: string): Promise<string> {
  return hash(plaintext, ARGON2_OPTIONS);
}

/**
 * Securely verifies a plaintext password against an Argon2id hash.
 * Resistant to timing attacks.
 */
export async function verifyPassword(plaintext: string, passwordHash: string): Promise<boolean> {
  try {
    return await verify(passwordHash, plaintext, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}
