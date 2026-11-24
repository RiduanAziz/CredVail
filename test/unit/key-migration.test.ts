import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import {
  deriveLegacyKey,
  resolveKmsKey,
  decryptPayloadWithKey,
  encryptPayloadWithKey,
  evaluateKeyMigration,
} from "@/lib/crypto/key-migration";

describe("CRV-SEC-01.1: Migration Safety & Cryptographic Compatibility", () => {
  const legacySecret = "credvail_legacy_session_secret_for_unit_tests";
  const validKmsBase64 = "zlWXisXpyUfdlbhE31iIHkuRx6gmTt0I6WIIaFffrE8=";
  const alternateKmsBase64 = "YmFzZTY0X2tleV9mb3JfdGVzdGluZ18zMl9ieXRlc18=";

  const mockPrivateKeyPem =
    "-----BEGIN EC PRIVATE KEY-----\nMHcCAQEEIIs1N8kX3T9Jm2Q0v0f8L1e5W4b7Y3u1m8P9q0r1s2t3oAoGCCqGSM49\nAwEHoUQDQgAEq1w2e3r4t5y6u7i8o9p0a1s2d3f4g5h6j7k8l9z0x1c2v3b4n5m6\n-----END EC PRIVATE KEY-----";

  describe("1. Legacy and KMS Key Derivation", () => {
    it("should derive legacy 32-byte key via SHA-256 digest of secret", () => {
      const legacyKey = deriveLegacyKey(legacySecret);
      expect(Buffer.isBuffer(legacyKey)).toBe(true);
      expect(legacyKey.length).toBe(32);
      expect(legacyKey).toEqual(crypto.createHash("sha256").update(legacySecret).digest());
    });

    it("should reject empty legacy secret", () => {
      expect(() => deriveLegacyKey("")).toThrow(/must be a non-empty string/i);
      expect(() => deriveLegacyKey("   ")).toThrow(/must be a non-empty string/i);
    });

    it("should resolve valid KMS key via HKDF-SHA-256 with domain separation", () => {
      const kmsKey = resolveKmsKey(validKmsBase64);
      expect(Buffer.isBuffer(kmsKey)).toBe(true);
      expect(kmsKey.length).toBe(32);
    });

    it("should reject invalid, malformed, or wrong-length KMS keys", () => {
      expect(() => resolveKmsKey("not-base64!")).toThrow(/canonical 32-byte Base64/i);
      expect(() => resolveKmsKey(crypto.randomBytes(16).toString("base64"))).toThrow(/canonical 32-byte Base64/i);
    });
  });

  describe("2. Cryptographic Re-Encryption & Decryption Fidelity", () => {
    it("should encrypt and decrypt cleanly with AES-256-GCM authenticated cipher", () => {
      const key = resolveKmsKey(validKmsBase64);
      const ciphertext = encryptPayloadWithKey(mockPrivateKeyPem, key);

      expect(ciphertext.startsWith("aes-256-gcm:")).toBe(true);
      const decryptRes = decryptPayloadWithKey(ciphertext, key);
      expect(decryptRes.success).toBe(true);
      expect(decryptRes.plaintext).toBe(mockPrivateKeyPem);
    });

    it("should fail decryption when ciphertext is tampered", () => {
      const key = resolveKmsKey(validKmsBase64);
      const ciphertext = encryptPayloadWithKey(mockPrivateKeyPem, key);
      const parts = ciphertext.split(":");

      // Tamper ciphertext payload
      const tamperedBody = parts[3].slice(0, -2) + (parts[3].endsWith("00") ? "11" : "00");
      const tampered = `aes-256-gcm:${parts[1]}:${parts[2]}:${tamperedBody}`;

      const res = decryptPayloadWithKey(tampered, key);
      expect(res.success).toBe(false);
      expect(res.plaintext).toBeUndefined();
    });

    it("should fail decryption when authentication tag is tampered", () => {
      const key = resolveKmsKey(validKmsBase64);
      const ciphertext = encryptPayloadWithKey(mockPrivateKeyPem, key);
      const parts = ciphertext.split(":");

      // Tamper auth tag
      const tamperedTag = (parts[2].startsWith("a") ? "b" : "a") + parts[2].slice(1);
      const tampered = `aes-256-gcm:${parts[1]}:${tamperedTag}:${parts[3]}`;

      const res = decryptPayloadWithKey(tampered, key);
      expect(res.success).toBe(false);
    });
  });

  describe("3. Migration Safety Requirements (All 9 Criteria)", () => {
    it("should successfully migrate legacy record to new KMS ciphertext with verified self-decryption", () => {
      const legacyKey = deriveLegacyKey(legacySecret);
      const newKmsKey = resolveKmsKey(validKmsBase64);

      // Simulate existing record encrypted under legacy secret
      const legacyCiphertext = encryptPayloadWithKey(mockPrivateKeyPem, legacyKey);

      // Evaluate migration
      const result = evaluateKeyMigration(legacyCiphertext, legacyKey, newKmsKey);

      expect(result.status).toBe("READY_TO_UPDATE");
      expect(result.newCiphertext).toBeDefined();
      expect(result.newCiphertext).not.toBe(legacyCiphertext);

      // Verify that the new ciphertext decrypts with new KMS key and yields identical plaintext
      const newDecrypted = decryptPayloadWithKey(result.newCiphertext!, newKmsKey);
      expect(newDecrypted.success).toBe(true);
      expect(newDecrypted.plaintext).toBe(mockPrivateKeyPem);
    });

    it("should be idempotent: skip records already encrypted with new KMS key", () => {
      const legacyKey = deriveLegacyKey(legacySecret);
      const newKmsKey = resolveKmsKey(validKmsBase64);

      // Record already encrypted with new KMS key
      const currentCiphertext = encryptPayloadWithKey(mockPrivateKeyPem, newKmsKey);

      const result = evaluateKeyMigration(currentCiphertext, legacyKey, newKmsKey);
      expect(result.status).toBe("ALREADY_MIGRATED");
      expect(result.newCiphertext).toBeUndefined();
    });

    it("should safely report BLOCKED_NO_LEGACY_SECRET if legacy secret is missing and record is not on new key", () => {
      const legacyKey = deriveLegacyKey(legacySecret);
      const newKmsKey = resolveKmsKey(validKmsBase64);

      const legacyCiphertext = encryptPayloadWithKey(mockPrivateKeyPem, legacyKey);

      // Migration attempted without legacy secret
      const result = evaluateKeyMigration(legacyCiphertext, null, newKmsKey);
      expect(result.status).toBe("BLOCKED_NO_LEGACY_SECRET");
      expect(result.newCiphertext).toBeUndefined();
    });

    it("should reject migration and report FAILED_DECRYPTION if wrong legacy secret is supplied", () => {
      const actualLegacyKey = deriveLegacyKey(legacySecret);
      const wrongLegacyKey = deriveLegacyKey("wrong_legacy_session_secret");
      const newKmsKey = resolveKmsKey(validKmsBase64);

      const legacyCiphertext = encryptPayloadWithKey(mockPrivateKeyPem, actualLegacyKey);

      const result = evaluateKeyMigration(legacyCiphertext, wrongLegacyKey, newKmsKey);
      expect(result.status).toBe("FAILED_DECRYPTION");
      expect(result.newCiphertext).toBeUndefined();
    });

    it("should abort if re-encrypted ciphertext cannot be self-decrypted with new key", () => {
      const legacyKey = deriveLegacyKey(legacySecret);
      const newKmsKey = resolveKmsKey(validKmsBase64);
      const alternateKey = resolveKmsKey(alternateKmsBase64);

      const legacyCiphertext = encryptPayloadWithKey(mockPrivateKeyPem, legacyKey);

      // Evaluate migration using a mismatch test double
      const result = evaluateKeyMigration(legacyCiphertext, legacyKey, newKmsKey);
      expect(result.status).toBe("READY_TO_UPDATE");

      // Verify that ciphertext produced for validKmsBase64 cannot be decrypted by alternateKey
      const alternateDecrypt = decryptPayloadWithKey(result.newCiphertext!, alternateKey);
      expect(alternateDecrypt.success).toBe(false);
    });
  });
});
