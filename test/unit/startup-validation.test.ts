import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { register } from "@/instrumentation";
import { KeyService, KmsConfigurationError } from "@/lib/crypto/key-service";

describe("CRV-SEC-01.1: Next.js Production Server Startup Validation Lifecycle", () => {
  const originalEnv = { ...process.env };
  const validMasterKeyBase64 = "zlWXisXpyUfdlbhE31iIHkuRx6gmTt0I6WIIaFffrE8=";

  beforeEach(() => {
    KeyService.resetMasterKeyForTesting();
    (process.env as any).NEXT_RUNTIME = "nodejs";
  });

  afterEach(() => {
    KeyService.resetMasterKeyForTesting();
    process.env = { ...originalEnv };
  });

  it("should fail closed on production server startup when KMS_MASTER_KEY is missing", async () => {
    (process.env as any).NODE_ENV = "production";
    delete (process.env as any).NEXT_PHASE;
    delete process.env.KMS_MASTER_KEY;

    await expect(register()).rejects.toThrow(KmsConfigurationError);
    await expect(register()).rejects.toThrow(/KMS_MASTER_KEY is not configured/i);
  });

  it("should fail closed on production server startup when KMS_MASTER_KEY is malformed", async () => {
    (process.env as any).NODE_ENV = "production";
    delete (process.env as any).NEXT_PHASE;
    process.env.KMS_MASTER_KEY = "malformed_non_base64_secret_key!";

    await expect(register()).rejects.toThrow(KmsConfigurationError);
    await expect(register()).rejects.toThrow(/malformed/i);
  });

  it("should succeed on production server startup when KMS_MASTER_KEY is valid", async () => {
    (process.env as any).NODE_ENV = "production";
    delete (process.env as any).NEXT_PHASE;
    process.env.KMS_MASTER_KEY = validMasterKeyBase64;

    await expect(register()).resolves.toBeUndefined();
  });

  it("should bypass boot check during static compilation build phase (NEXT_PHASE = phase-production-build)", async () => {
    (process.env as any).NODE_ENV = "production";
    (process.env as any).NEXT_PHASE = "phase-production-build";
    delete process.env.KMS_MASTER_KEY;

    // Build compilation must succeed without throwing or requiring production deployment secret
    await expect(register()).resolves.toBeUndefined();
  });

  it("should bypass boot check in development environment, but retain lazy fail-closed defense-in-depth", async () => {
    (process.env as any).NODE_ENV = "development";
    delete (process.env as any).NEXT_PHASE;
    delete process.env.KMS_MASTER_KEY;

    // Server boot does not throw in dev mode
    await expect(register()).resolves.toBeUndefined();

    // But invoking key encryption/decryption in dev still fails closed without KMS_MASTER_KEY
    const keyPair = KeyService.generateEcdsaKeyPair();
    expect(() => KeyService.encryptPrivateKey(keyPair.privateKeyPem)).toThrow(KmsConfigurationError);
  });
});
