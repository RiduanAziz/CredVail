/**
 * CREDVAIL Issuer Key Migration Engine
 *
 * Provides pure, verifiable migration functions to transition encrypted issuer keys
 * from legacy session-derived encryption (SESSION_SECRET / SHA-256) to
 * independent KMS master key encryption (KMS_MASTER_KEY / HKDF-SHA-256).
 */

import crypto from "node:crypto";

export interface DecryptResult {
  success: boolean;
  plaintext?: string;
  error?: string;
}

export type MigrationStatus =
  | "ALREADY_MIGRATED"
  | "READY_TO_UPDATE"
  | "BLOCKED_NO_LEGACY_SECRET"
  | "FAILED_DECRYPTION"
  | "VERIFICATION_FAILED"
  | "INVALID_PAYLOAD";

export interface MigrationRecordResult {
  status: MigrationStatus;
  newCiphertext?: string;
  error?: string;
}

export interface SanitizedDatabaseTarget {
  protocol: string;
  hostname: string;
  port: string;
  database: string;
  schema: string;
}

/**
 * Redacts embedded credentials from PostgreSQL connection strings or error text.
 */
export function sanitizeErrorText(raw: unknown): string {
  if (!raw) return "Unknown error";
  const str = raw instanceof Error ? raw.message : String(raw);
  return str.replace(/((?:postgresql|postgres):\/\/)[^/\s@]+@/gi, "$1***:***@");
}

/**
 * Validates and extracts non-sensitive destination metadata from DATABASE_URL.
 * Rejects missing or non-PostgreSQL connection strings without leaking credentials.
 */
export function parseSafeDatabaseTarget(dbUrl: string | undefined): SanitizedDatabaseTarget {
  if (!dbUrl || typeof dbUrl !== "string" || dbUrl.trim() === "") {
    throw new Error("DATABASE_URL environment variable is missing or empty.");
  }

  let trimmed = dbUrl.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }

  if (!trimmed.startsWith("postgresql://") && !trimmed.startsWith("postgres://")) {
    throw new Error("DATABASE_URL must begin with postgresql:// or postgres://.");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL.");
  }

  if (!parsed.hostname) {
    throw new Error("DATABASE_URL is missing target hostname.");
  }

  const database = parsed.pathname.replace(/^\/+/, "") || "(default)";
  const schema = parsed.searchParams.get("schema") || "public";

  return {
    protocol: parsed.protocol.replace(":", ""),
    hostname: parsed.hostname,
    port: parsed.port || "5432",
    database,
    schema,
  };
}

/**
 * Derives legacy 32-byte AES key using SHA-256 digest of legacy session secret.
 */
export function deriveLegacyKey(legacySecret: string): Buffer {
  if (!legacySecret || typeof legacySecret !== "string" || legacySecret.trim() === "") {
    throw new Error("LEGACY_SESSION_SECRET must be a non-empty string.");
  }
  return crypto.createHash("sha256").update(legacySecret).digest();
}

/**
 * Validates and derives the new 32-byte AES key from canonical 32-byte Base64 KMS_MASTER_KEY.
 */
export function resolveKmsKey(kmsBase64Key: string): Buffer {
  if (!kmsBase64Key || typeof kmsBase64Key !== "string") {
    throw new Error("KMS_MASTER_KEY is required.");
  }
  const trimmed = kmsBase64Key.trim();
  if (!/^[A-Za-z0-9+/]{43}=$/.test(trimmed)) {
    throw new Error("KMS_MASTER_KEY must be a canonical 32-byte Base64 string (44 chars ending in '=').");
  }
  const keyBuffer = Buffer.from(trimmed, "base64");
  if (keyBuffer.length !== 32) {
    throw new Error(`KMS_MASTER_KEY decoded byte length must be exactly 32 bytes, got ${keyBuffer.length}.`);
  }
  if (keyBuffer.toString("base64") !== trimmed) {
    throw new Error("KMS_MASTER_KEY contains non-canonical padding bits.");
  }

  const derived = crypto.hkdfSync(
    "sha256",
    keyBuffer,
    Buffer.alloc(0),
    "credvail_issuer_private_key_encryption_v1",
    32
  );
  return Buffer.from(derived);
}

/**
 * Attempts to decrypt an aes-256-gcm payload with a given 32-byte key.
 */
export function decryptPayloadWithKey(payload: string, aesKey: Buffer): DecryptResult {
  if (!payload || !payload.startsWith("aes-256-gcm:")) {
    return { success: false, error: "Payload does not start with aes-256-gcm:" };
  }
  const parts = payload.split(":");
  if (parts.length !== 4) {
    return { success: false, error: "Malformed payload structure: expected 4 colon-separated parts." };
  }

  const [, ivHex, tagHex, ciphertextHex] = parts;
  if (
    !/^[0-9a-fA-F]{24}$/.test(ivHex) ||
    !/^[0-9a-fA-F]{32}$/.test(tagHex) ||
    !ciphertextHex ||
    ciphertextHex.length % 2 !== 0 ||
    !/^[0-9a-fA-F]+$/.test(ciphertextHex)
  ) {
    return { success: false, error: "Malformed hex encoding or invalid IV/auth-tag/ciphertext length." };
  }

  try {
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const ciphertext = Buffer.from(ciphertextHex, "hex");

    const decipher = crypto.createDecipheriv("aes-256-gcm", aesKey, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return { success: true, plaintext: decrypted.toString("utf8") };
  } catch (err: any) {
    return { success: false, error: sanitizeErrorText(err) };
  }
}

/**
 * Encrypts plaintext using AES-256-GCM with a fresh random 12-byte IV.
 */
export function encryptPayloadWithKey(plaintext: string, aesKey: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `aes-256-gcm:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Safely evaluates a single encrypted key payload for migration.
 *
 * Guarantees:
 * 1. Checks if already decryptable with new KMS key (idempotency).
 * 2. If not, attempts decryption with legacy key.
 * 3. Re-encrypts under new KMS key.
 * 4. Verifies self-decryption of new ciphertext before returning it.
 * 5. Returns structured status without exposing plaintext or secrets.
 */
export function evaluateKeyMigration(
  payload: string,
  legacyKey: Buffer | null,
  newKmsKey: Buffer
): MigrationRecordResult {
  if (!payload || !payload.startsWith("aes-256-gcm:")) {
    return { status: "INVALID_PAYLOAD", error: "Not an encrypted payload." };
  }

  // Validate envelope syntax upfront so malformed hex always fails as INVALID_PAYLOAD
  const parts = payload.split(":");
  if (
    parts.length !== 4 ||
    !/^[0-9a-fA-F]{24}$/.test(parts[1]) ||
    !/^[0-9a-fA-F]{32}$/.test(parts[2]) ||
    !parts[3] ||
    parts[3].length % 2 !== 0 ||
    !/^[0-9a-fA-F]+$/.test(parts[3])
  ) {
    return {
      status: "INVALID_PAYLOAD",
      error: "Malformed encrypted payload syntax or non-hex segment.",
    };
  }

  // 1. Check if already decryptable under new KMS key
  const newKeyCheck = decryptPayloadWithKey(payload, newKmsKey);
  if (newKeyCheck.success) {
    return { status: "ALREADY_MIGRATED" };
  }

  // 2. Check if legacy key is supplied
  if (!legacyKey) {
    return {
      status: "BLOCKED_NO_LEGACY_SECRET",
      error: "Payload cannot be decrypted with new key, and no legacy secret is provided.",
    };
  }

  // 3. Decrypt with legacy key
  const legacyCheck = decryptPayloadWithKey(payload, legacyKey);
  if (!legacyCheck.success || !legacyCheck.plaintext) {
    return {
      status: "FAILED_DECRYPTION",
      error: "Failed decryption with legacy key (auth tag or key mismatch).",
    };
  }

  // 4. Re-encrypt under new KMS key
  const newCiphertext = encryptPayloadWithKey(legacyCheck.plaintext, newKmsKey);

  // 5. Verify self-decryption of new ciphertext
  const verifyCheck = decryptPayloadWithKey(newCiphertext, newKmsKey);
  if (!verifyCheck.success || verifyCheck.plaintext !== legacyCheck.plaintext) {
    return {
      status: "VERIFICATION_FAILED",
      error: "Self-decryption verification failed for re-encrypted ciphertext.",
    };
  }

  return {
    status: "READY_TO_UPDATE",
    newCiphertext,
  };
}
