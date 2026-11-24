import { describe, it, expect, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";
import { KeyService, KmsConfigurationError } from "@/lib/crypto/key-service";

describe("CRV-SEC-01: KMS Master Key Isolation & Fail-Closed Security Contract", () => {
  const originalKmsKey = process.env.KMS_MASTER_KEY;
  const originalSessionSecret = process.env.SESSION_SECRET;
  const originalNodeEnv = process.env.NODE_ENV;

  // Sample valid canonical 32-byte Base64 key (44 chars ending in '=')
  const validMasterKeyBase64 = "zlWXisXpyUfdlbhE31iIHkuRx6gmTt0I6WIIaFffrE8=";
  const alternateMasterKeyBase64 = "YmFzZTY0X2tleV9mb3JfdGVzdGluZ18zMl9ieXRlc18="; // 32 bytes base64

  beforeEach(() => {
    KeyService.resetMasterKeyForTesting();
    if (originalKmsKey !== undefined) {
      process.env.KMS_MASTER_KEY = originalKmsKey;
    } else {
      delete process.env.KMS_MASTER_KEY;
    }
    if (originalSessionSecret !== undefined) {
      process.env.SESSION_SECRET = originalSessionSecret;
    } else {
      delete process.env.SESSION_SECRET;
    }
    (process.env as any).NODE_ENV = originalNodeEnv;
  });

  afterEach(() => {
    KeyService.resetMasterKeyForTesting();
    if (originalKmsKey !== undefined) {
      process.env.KMS_MASTER_KEY = originalKmsKey;
    } else {
      delete process.env.KMS_MASTER_KEY;
    }
    if (originalSessionSecret !== undefined) {
      process.env.SESSION_SECRET = originalSessionSecret;
    } else {
      delete process.env.SESSION_SECRET;
    }
    (process.env as any).NODE_ENV = originalNodeEnv;
  });

  describe("Master Key Configuration Validation", () => {
    it("should reject missing or empty KMS_MASTER_KEY with KmsConfigurationError", () => {
      delete process.env.KMS_MASTER_KEY;
      expect(() => KeyService.resolveMasterKey()).toThrow(KmsConfigurationError);
      expect(() => KeyService.resolveMasterKey()).toThrow(/not configured/i);

      process.env.KMS_MASTER_KEY = "   ";
      expect(() => KeyService.resolveMasterKey()).toThrow(KmsConfigurationError);
    });

    it("should reject non-base64 malformed strings", () => {
      process.env.KMS_MASTER_KEY = "invalid!characters#not$base64%key&value*()";
      expect(() => KeyService.resolveMasterKey()).toThrow(KmsConfigurationError);
      expect(() => KeyService.resolveMasterKey()).toThrow(/malformed/i);
    });

    it("should reject a 32-character string that is not 32 bytes of Base64", () => {
      // 32 chars of ASCII is only 24 bytes when decoded from Base64 (or invalid padding)
      process.env.KMS_MASTER_KEY = "12345678901234567890123456789012";
      expect(() => KeyService.resolveMasterKey()).toThrow(KmsConfigurationError);
    });

    it("should reject a Base64 key that decodes to fewer than 32 bytes (e.g., 16 bytes / AES-128)", () => {
      // 16 bytes Base64 = 24 chars
      const sixteenByteKey = crypto.randomBytes(16).toString("base64");
      process.env.KMS_MASTER_KEY = sixteenByteKey;
      expect(() => KeyService.resolveMasterKey()).toThrow(KmsConfigurationError);
      expect(() => KeyService.resolveMasterKey()).toThrow(/malformed|invalid decoded byte length/i);
    });

    it("should reject a Base64 key that decodes to greater than 32 bytes (e.g., 64 bytes)", () => {
      const sixtyFourByteKey = crypto.randomBytes(64).toString("base64");
      process.env.KMS_MASTER_KEY = sixtyFourByteKey;
      expect(() => KeyService.resolveMasterKey()).toThrow(KmsConfigurationError);
      expect(() => KeyService.resolveMasterKey()).toThrow(/malformed|invalid decoded byte length/i);
    });

    it("should accept a valid 32-byte Base64 key and return a 32-byte derived Buffer", () => {
      process.env.KMS_MASTER_KEY = validMasterKeyBase64;
      const derivedKey = KeyService.resolveMasterKey();
      expect(Buffer.isBuffer(derivedKey)).toBe(true);
      expect(derivedKey.length).toBe(32);
    });

    it("should safely tolerate leading and trailing whitespace on a valid key", () => {
      process.env.KMS_MASTER_KEY = `   ${validMasterKeyBase64}   \n`;
      const derivedKey = KeyService.resolveMasterKey();
      expect(Buffer.isBuffer(derivedKey)).toBe(true);
      expect(derivedKey.length).toBe(32);
    });

    it("should fail validation via KeyService.validateMasterKey() when key is missing or invalid", () => {
      delete process.env.KMS_MASTER_KEY;
      expect(() => KeyService.validateMasterKey()).toThrow(KmsConfigurationError);

      process.env.KMS_MASTER_KEY = "malformed";
      expect(() => KeyService.validateMasterKey()).toThrow(KmsConfigurationError);
    });
  });

  describe("Cryptographic Isolation & Zero Fallback", () => {
    it("should NEVER fall back to SESSION_SECRET or hardcoded defaults when KMS_MASTER_KEY is missing", () => {
      delete process.env.KMS_MASTER_KEY;
      process.env.SESSION_SECRET = "super_secret_session_encryption_key_32bytes_minimum";

      const keyPair = KeyService.generateEcdsaKeyPair();

      // Attempting encryption without KMS_MASTER_KEY must fail closed, NOT use SESSION_SECRET
      expect(() => KeyService.encryptPrivateKey(keyPair.privateKeyPem)).toThrow(KmsConfigurationError);

      // Attempting decryption without KMS_MASTER_KEY must also fail closed
      expect(() => KeyService.decryptPrivateKey("aes-256-gcm:0102030405060708090a0b0c:0102030405060708090a0b0c0d0e0f10:aabbcc")).toThrow(KmsConfigurationError);
    });

    it("should encrypt and decrypt cleanly when valid KMS_MASTER_KEY is configured", () => {
      process.env.KMS_MASTER_KEY = validMasterKeyBase64;

      const keyPair = KeyService.generateEcdsaKeyPair();
      const encrypted = KeyService.encryptPrivateKey(keyPair.privateKeyPem);

      expect(encrypted.startsWith("aes-256-gcm:")).toBe(true);
      const decrypted = KeyService.decryptPrivateKey(encrypted);
      expect(decrypted).toBe(keyPair.privateKeyPem);
    });

    it("should guarantee that changing SESSION_SECRET has ZERO impact on KMS encryption or decryption", () => {
      process.env.KMS_MASTER_KEY = validMasterKeyBase64;
      process.env.SESSION_SECRET = "initial_session_secret_value_11111111111111";

      const keyPair = KeyService.generateEcdsaKeyPair();
      const encrypted = KeyService.encryptPrivateKey(keyPair.privateKeyPem);

      // Mutate SESSION_SECRET completely
      process.env.SESSION_SECRET = "completely_different_session_secret_99999999";

      // Decryption must succeed with 100% fidelity because KeyService is cryptographically isolated
      const decrypted = KeyService.decryptPrivateKey(encrypted);
      expect(decrypted).toBe(keyPair.privateKeyPem);
    });

    it("should fail decryption when ciphertext is decrypted with a different KMS_MASTER_KEY", () => {
      process.env.KMS_MASTER_KEY = validMasterKeyBase64;

      const keyPair = KeyService.generateEcdsaKeyPair();
      const encrypted = KeyService.encryptPrivateKey(keyPair.privateKeyPem);

      // Switch to a different valid master key
      process.env.KMS_MASTER_KEY = alternateMasterKeyBase64;
      KeyService.resetMasterKeyForTesting(); // Clear cache

      // Decryption must fail due to GCM authentication failure
      expect(() => KeyService.decryptPrivateKey(encrypted)).toThrow();
    });

    it("should fail decryption when ciphertext or authentication tag is tampered", () => {
      process.env.KMS_MASTER_KEY = validMasterKeyBase64;

      const keyPair = KeyService.generateEcdsaKeyPair();
      const encrypted = KeyService.encryptPrivateKey(keyPair.privateKeyPem);
      const parts = encrypted.split(":");

      // 1. Tamper auth tag
      const tamperedTag = (parts[2].startsWith("0") ? "1" : "0") + parts[2].slice(1);
      const tamperedTagPayload = `aes-256-gcm:${parts[1]}:${tamperedTag}:${parts[3]}`;
      expect(() => KeyService.decryptPrivateKey(tamperedTagPayload)).toThrow();

      // 2. Tamper ciphertext
      const tamperedCiphertext = parts[3].slice(0, -2) + (parts[3].endsWith("aa") ? "bb" : "aa");
      const tamperedCipherPayload = `aes-256-gcm:${parts[1]}:${parts[2]}:${tamperedCiphertext}`;
      expect(() => KeyService.decryptPrivateKey(tamperedCipherPayload)).toThrow();
    });
  });

  describe("In-Memory Test Double Override", () => {
    it("should allow injecting test master key via setMasterKeyForTesting without mutating process.env", () => {
      delete process.env.KMS_MASTER_KEY;

      KeyService.setMasterKeyForTesting(validMasterKeyBase64);

      const keyPair = KeyService.generateEcdsaKeyPair();
      const encrypted = KeyService.encryptPrivateKey(keyPair.privateKeyPem);
      const decrypted = KeyService.decryptPrivateKey(encrypted);

      expect(decrypted).toBe(keyPair.privateKeyPem);

      // Clearing test override restores fail-closed behavior
      KeyService.resetMasterKeyForTesting();
      expect(() => KeyService.encryptPrivateKey(keyPair.privateKeyPem)).toThrow(KmsConfigurationError);
    });
  });

  describe("Production Runtime Fail-Closed Posture", () => {
    it("should fail closed in production environment when KMS_MASTER_KEY is missing", () => {
      (process.env as any).NODE_ENV = "production";
      delete process.env.KMS_MASTER_KEY;

      expect(() => KeyService.validateMasterKey()).toThrow(KmsConfigurationError);

      const keyPair = KeyService.generateEcdsaKeyPair();
      expect(() => KeyService.encryptPrivateKey(keyPair.privateKeyPem)).toThrow(KmsConfigurationError);
    });

    it("should succeed in production environment when KMS_MASTER_KEY is valid", () => {
      (process.env as any).NODE_ENV = "production";
      process.env.KMS_MASTER_KEY = validMasterKeyBase64;

      expect(() => KeyService.validateMasterKey()).not.toThrow();

      const keyPair = KeyService.generateEcdsaKeyPair();
      const encrypted = KeyService.encryptPrivateKey(keyPair.privateKeyPem);
      expect(KeyService.decryptPrivateKey(encrypted)).toBe(keyPair.privateKeyPem);
    });
  });
});
