import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  DatabasePersistenceError,
  validateDatabaseConfiguration,
  isInMemoryFallbackPermissible,
  sanitizeDatabaseErrorMessage,
  handleRepositoryError,
} from "../../src/lib/db/persistence-policy.ts";
import { KeyService } from "../../src/lib/crypto/key-service.ts";
import { KeyRepository } from "../../src/lib/repositories/key-repository.ts";
import { UserRepository } from "../../src/lib/repositories/user-repository.ts";
import { TenantRepository } from "../../src/lib/repositories/tenant-repository.ts";
import { TemplateRepository } from "../../src/lib/repositories/template-repository.ts";
import { BatchRepository } from "../../src/lib/repositories/batch-repository.ts";
import { CredentialRepository } from "../../src/lib/repositories/credential-repository.ts";
import { StatusSnapshotRepository } from "../../src/lib/repositories/status-snapshot-repository.ts";
import { ClaimInvitationRepository } from "../../src/lib/repositories/claim-invitation-repository.ts";

describe("CRV-SEC-02: Production Database Persistence & Failure Handling", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    (process.env as any).NODE_ENV = "test";
    delete process.env.REQUIRE_POSTGRES_INTEGRATION;
    process.env.DATABASE_URL = "postgresql://testuser:testpass@localhost:5432/credvail_test";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("Startup Database Configuration Validation", () => {
    it("should pass validation when DATABASE_URL is valid postgresql://", () => {
      process.env.DATABASE_URL = "postgresql://app_user:s3cr3t@pg-cluster.internal:5432/credvail";
      expect(() => validateDatabaseConfiguration()).not.toThrow();
    });

    it("should pass validation when DATABASE_URL is valid postgres://", () => {
      process.env.DATABASE_URL = "postgres://app_user:s3cr3t@pg-cluster.internal:5432/credvail";
      expect(() => validateDatabaseConfiguration()).not.toThrow();
    });

    it("should fail closed when DATABASE_URL is missing or empty", () => {
      delete process.env.DATABASE_URL;
      expect(() => validateDatabaseConfiguration()).toThrowError(DatabasePersistenceError);
      expect(() => validateDatabaseConfiguration()).toThrowError(/DATABASE_URL environment variable is required/);

      process.env.DATABASE_URL = "   ";
      expect(() => validateDatabaseConfiguration()).toThrowError(DatabasePersistenceError);
    });

    it("should fail closed when DATABASE_URL is not PostgreSQL (e.g., MySQL, SQLite)", () => {
      process.env.DATABASE_URL = "mysql://root:secret@localhost:3306/credvail";
      expect(() => validateDatabaseConfiguration()).toThrowError(DatabasePersistenceError);
      expect(() => validateDatabaseConfiguration()).toThrowError(/must configure a valid PostgreSQL connection/);

      process.env.DATABASE_URL = "file:./dev.db";
      expect(() => validateDatabaseConfiguration()).toThrowError(DatabasePersistenceError);
    });
  });

  describe("In-Memory Fallback Permission Governance", () => {
    it("should strictly forbid in-memory fallback in production (NODE_ENV=production)", () => {
      (process.env as any).NODE_ENV = "production";
      delete process.env.REQUIRE_POSTGRES_INTEGRATION;

      expect(isInMemoryFallbackPermissible()).toBe(false);
    });

    it("should strictly forbid in-memory fallback when REQUIRE_POSTGRES_INTEGRATION is true", () => {
      (process.env as any).NODE_ENV = "test";
      process.env.REQUIRE_POSTGRES_INTEGRATION = "true";

      expect(isInMemoryFallbackPermissible()).toBe(false);
    });

    it("should permit in-memory fallback only in non-production offline test/dev environments", () => {
      (process.env as any).NODE_ENV = "test";
      delete process.env.REQUIRE_POSTGRES_INTEGRATION;

      expect(isInMemoryFallbackPermissible()).toBe(true);
    });
  });

  describe("Database Error Message Sanitization", () => {
    it("should redact cleartext database credentials from connection errors", () => {
      const rawError = "Failed to connect to postgresql://postgres:SuperSecretPassword123!@db.host.internal:5432/credvail: connection refused";
      const sanitized = sanitizeDatabaseErrorMessage(rawError);

      expect(sanitized).not.toContain("SuperSecretPassword123!");
      expect(sanitized).not.toContain("postgres:SuperSecretPassword123!");
      expect(sanitized).toContain("postgresql://***:***@db.host.internal:5432/credvail: connection refused");
    });

    it("should handle Error instances cleanly", () => {
      const err = new Error("DB crash at postgresql://admin:p@ssw0rd@10.0.0.1:5432/db");
      const sanitized = sanitizeDatabaseErrorMessage(err);

      expect(sanitized).toContain("postgresql://***:***@10.0.0.1:5432/db");
      expect(sanitized).not.toContain("p@ssw0rd");
    });
  });

  describe("Centralized Fail-Closed Repository Error Handler", () => {
    it("should throw DatabasePersistenceError in production", () => {
      (process.env as any).NODE_ENV = "production";

      expect(() => {
        handleRepositoryError("UserRepository.create", new Error("Query timeout"));
      }).toThrowError(DatabasePersistenceError);

      try {
        handleRepositoryError("TenantRepository.createTenant", new Error("Connection reset"));
      } catch (err: any) {
        expect(err.code).toBe("DATABASE_PERSISTENCE_FAILURE");
        expect(err.message).toContain("TenantRepository.createTenant");
        expect(err.message).toContain("Silent in-memory fallback is forbidden in production");
      }
    });

    it("should not throw in non-production development mode", () => {
      (process.env as any).NODE_ENV = "test";
      delete process.env.REQUIRE_POSTGRES_INTEGRATION;

      expect(() => {
        handleRepositoryError("UserRepository.create", new Error("Local dev mock error"));
      }).not.toThrow();
    });
  });

  describe("Repository Fail-Closed Invariant Verification", () => {
    it("KeyRepository: getUseMemory returns false in production even if setUseMemory(true) is attempted", () => {
      (process.env as any).NODE_ENV = "production";
      KeyRepository.setUseMemory(true);

      expect(KeyRepository.getUseMemory()).toBe(false);
      KeyRepository.resetInMemoryStore();
    });

    it("BatchRepository: getUseMemory returns false in production even if setUseMemory(true) is attempted", () => {
      (process.env as any).NODE_ENV = "production";
      BatchRepository.setUseMemory(true);

      expect(BatchRepository.getUseMemory()).toBe(false);
      BatchRepository.resetInMemoryStore();
    });

    it("CredentialRepository: getUseMemory returns false in production even if setUseMemory(true) is attempted", () => {
      (process.env as any).NODE_ENV = "production";
      CredentialRepository.setUseMemory(true);

      expect(CredentialRepository.getUseMemory()).toBe(false);
      CredentialRepository.resetInMemoryStore();
    });

    it("StatusSnapshotRepository: getUseMemory returns false in production", () => {
      (process.env as any).NODE_ENV = "production";
      StatusSnapshotRepository.setUseMemory(true);

      expect(StatusSnapshotRepository.getUseMemory()).toBe(false);
      StatusSnapshotRepository.resetInMemoryStore();
    });

    it("ClaimInvitationRepository: getUseMemory returns false in production", () => {
      (process.env as any).NODE_ENV = "production";
      ClaimInvitationRepository.setUseMemory(true);

      expect(ClaimInvitationRepository.getUseMemory()).toBe(false);
      ClaimInvitationRepository.resetInMemoryStore();
    });

    it("UserRepository: fails closed on DB query error in production mode", async () => {
      (process.env as any).NODE_ENV = "production";
      const repo = new UserRepository(false);

      // UserRepository should not silently catch and store in inMemoryUserStore
      await expect(
        repo.create({
          email: "failclosed@example.com",
          passwordHash: "hash123",
          fullName: "Fail Closed User",
        })
      ).rejects.toThrow(DatabasePersistenceError);
    }, 15000);

    it("TenantRepository: fails closed on DB query error in production mode", async () => {
      (process.env as any).NODE_ENV = "production";
      const repo = new TenantRepository(false);

      await expect(
        repo.createTenant({
          slug: "failclosed-tenant",
          name: "Fail Closed Org",
          legalEntityName: "Fail Closed Org LLC",
          websiteUrl: "https://failclosed.example.com",
          didUri: "did:key:zFailClosed",
          ownerUserId: "usr_fail_closed",
        })
      ).rejects.toThrow(DatabasePersistenceError);
    }, 15000);

    it("TemplateRepository: fails closed on DB query error in production mode", async () => {
      (process.env as any).NODE_ENV = "production";
      const repo = new TemplateRepository(false);

      await expect(
        repo.createTemplate({
          tenantId: "tnt_fail_closed",
          title: "Fail Closed Certificate",
          layoutConfig: { width: 800, height: 600, fields: [] } as any,
        })
      ).rejects.toThrow(DatabasePersistenceError);
    }, 15000);
  });

  describe("Cryptographic Key Hydration from Multibase", () => {
    it("should reconstitute full RFC 7517 JWK with valid x and y coordinates from publicKeyMultibase", () => {
      const generated = KeyService.generateEcdsaKeyPair();

      const details = KeyService.multibaseToPublicKeyDetails(generated.publicKeyMultibase);

      expect(details.publicKeyJwk).toBeDefined();
      expect(details.publicKeyJwk.kty).toBe("EC");
      expect(details.publicKeyJwk.crv).toBe("P-256");
      expect(details.publicKeyJwk.x).toBe(generated.publicKeyJwk.x);
      expect(details.publicKeyJwk.y).toBe(generated.publicKeyJwk.y);
      expect(details.publicKeyJwk.x.length).toBeGreaterThan(0);
      expect(details.publicKeyJwk.y.length).toBeGreaterThan(0);

      // Must NOT be dummy empty coordinates
      expect(details.publicKeyJwk.x).not.toBe("");
      expect(details.publicKeyJwk.y).not.toBe("");
    });

    it("should reconstitute the canonical 64-character SHA-256 fingerprint matching original key", () => {
      const generated = KeyService.generateEcdsaKeyPair();

      const details = KeyService.multibaseToPublicKeyDetails(generated.publicKeyMultibase);

      expect(details.fingerprint).toBe(generated.fingerprint);
      expect(details.fingerprint).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(details.fingerprint)).toBe(true);

      // Must NOT be the truncated multibase prefix
      expect(details.fingerprint).not.toBe(generated.publicKeyMultibase.slice(0, 16));
    });

    it("should verify digital signatures using the reconstituted public key PEM and JWK", () => {
      const generated = KeyService.generateEcdsaKeyPair();
      const testPayload = JSON.stringify({ credentialId: "cred_123", claim: "Valid" });
      const signature = KeyService.signData(generated.privateKeyPem, testPayload);

      const details = KeyService.multibaseToPublicKeyDetails(generated.publicKeyMultibase);

      // Verify with reconstituted PEM
      const pemValid = KeyService.verifySignature(details.publicKeyPem, testPayload, signature);
      expect(pemValid).toBe(true);

      // Verify with reconstituted JWK
      const jwkValid = KeyService.verifySignature(details.publicKeyJwk, testPayload, signature);
      expect(jwkValid).toBe(true);
    });
  });
});
