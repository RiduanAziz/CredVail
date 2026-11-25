import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  decryptPayloadWithKey,
  evaluateKeyMigration,
  parseSafeDatabaseTarget,
  sanitizeErrorText,
  deriveLegacyKey,
  resolveKmsKey,
  encryptPayloadWithKey,
} from "@/lib/crypto/key-migration";

describe("CRV-SEC-01.2: Migration Script Preflight & Cryptographic Guardrails", () => {
  const validKms = crypto.randomBytes(32).toString("base64");
  const validLegacy = "test_only_legacy_secret_preflight_suite";
  const dummyDbUrl = "postgresql://credvail_mig:supersecretpassword@127.0.0.1:59999/credvail_nonexistent?schema=public";

  function runCli(args: string[], envOverrides: Record<string, string | undefined>) {
    const env: Record<string, string | undefined> = { ...process.env };
    delete env.KMS_MASTER_KEY;
    delete env.LEGACY_SESSION_SECRET;
    delete env.SESSION_SECRET;
    delete env.DATABASE_URL;
    for (const [k, v] of Object.entries(envOverrides)) {
      if (v === undefined) delete env[k];
      else env[k] = v;
    }

    try {
      const stdout = execFileSync("node", ["scripts/migrate-issuer-keys.mjs", ...args], {
        env: env as NodeJS.ProcessEnv,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return { exitCode: 0, stdout, stderr: "" };
    } catch (e: any) {
      return {
        exitCode: e.status ?? -1,
        stdout: String(e.stdout || ""),
        stderr: String(e.stderr || ""),
      };
    }
  }

  describe("Preflight Fail-Closed Contract (Independent of .env)", () => {
    it("MIG-08: rejects missing KMS_MASTER_KEY even when local .env exists", () => {
      const res = runCli([], { DATABASE_URL: dummyDbUrl, LEGACY_SESSION_SECRET: validLegacy });
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toMatch(/KMS_MASTER_KEY environment variable is missing/i);
    });

    it("MIG-09: rejects malformed, non-canonical, or wrong-length KMS_MASTER_KEY", () => {
      const resBadEncoding = runCli([], {
        DATABASE_URL: dummyDbUrl,
        KMS_MASTER_KEY: "not-valid-base64!",
        LEGACY_SESSION_SECRET: validLegacy,
      });
      expect(resBadEncoding.exitCode).toBe(1);
      expect(resBadEncoding.stderr).toMatch(/Invalid KMS_MASTER_KEY/i);

      const resShort = runCli([], {
        DATABASE_URL: dummyDbUrl,
        KMS_MASTER_KEY: crypto.randomBytes(16).toString("base64"),
        LEGACY_SESSION_SECRET: validLegacy,
      });
      expect(resShort.exitCode).toBe(1);
      expect(resShort.stderr).toMatch(/Invalid KMS_MASTER_KEY/i);
    });

    it("MIG-07: rejects missing or empty LEGACY_SESSION_SECRET at preflight (dry-run & --apply)", () => {
      const resDryMissing = runCli([], { DATABASE_URL: dummyDbUrl, KMS_MASTER_KEY: validKms });
      expect(resDryMissing.exitCode).toBe(1);
      expect(resDryMissing.stderr).toMatch(/LEGACY_SESSION_SECRET environment variable is missing/i);

      const resApplyMissing = runCli(["--apply"], { DATABASE_URL: dummyDbUrl, KMS_MASTER_KEY: validKms });
      expect(resApplyMissing.exitCode).toBe(1);
      expect(resApplyMissing.stderr).toMatch(/LEGACY_SESSION_SECRET environment variable is missing/i);

      const resEmpty = runCli([], {
        DATABASE_URL: dummyDbUrl,
        KMS_MASTER_KEY: validKms,
        LEGACY_SESSION_SECRET: "   ",
      });
      expect(resEmpty.exitCode).toBe(1);
      expect(resEmpty.stderr).toMatch(/Invalid LEGACY_SESSION_SECRET/i);
    });

    it("rejects missing or non-PostgreSQL DATABASE_URL without leaking credentials", () => {
      const resMissingDb = runCli([], { KMS_MASTER_KEY: validKms, LEGACY_SESSION_SECRET: validLegacy });
      expect(resMissingDb.exitCode).toBe(1);
      expect(resMissingDb.stderr).toMatch(/DATABASE_URL environment variable is missing/i);

      const resBadDb = runCli([], {
        DATABASE_URL: "mysql://user:secretpw123@db.internal:3306/app",
        KMS_MASTER_KEY: validKms,
        LEGACY_SESSION_SECRET: validLegacy,
      });
      expect(resBadDb.exitCode).toBe(1);
      expect(resBadDb.stderr).toMatch(/Invalid DATABASE_URL/i);
      expect(resBadDb.stderr).not.toContain("secretpw123");
    });

    it("rejects conflicting CLI flag combinations (--apply with --dry-run or --audit-kms-only)", () => {
      const r1 = runCli(["--apply", "--dry-run"], {
        DATABASE_URL: dummyDbUrl,
        KMS_MASTER_KEY: validKms,
        LEGACY_SESSION_SECRET: validLegacy,
      });
      expect(r1.exitCode).toBe(1);
      expect(r1.stderr).toMatch(/Cannot combine --apply and --dry-run/i);

      const r2 = runCli(["--apply", "--audit-kms-only"], {
        DATABASE_URL: dummyDbUrl,
        KMS_MASTER_KEY: validKms,
      });
      expect(r2.exitCode).toBe(1);
      expect(r2.stderr).toMatch(/Cannot combine --apply and --audit-kms-only/i);
    });
  });

  describe("Sanitization & Strict Hex Format Validation", () => {
    it("redacts PostgreSQL credentials from URLs and errors", () => {
      const target = parseSafeDatabaseTarget(dummyDbUrl);
      expect(target.hostname).toBe("127.0.0.1");
      expect(target.port).toBe("59999");
      expect(target.database).toBe("credvail_nonexistent");
      expect(JSON.stringify(target)).not.toContain("supersecretpassword");
      expect(JSON.stringify(target)).not.toContain("credvail_mig");

      const sanitized = sanitizeErrorText(new Error(`connect failed to ${dummyDbUrl}`));
      expect(sanitized).toContain("postgresql://***:***@127.0.0.1:59999");
      expect(sanitized).not.toContain("supersecretpassword");
    });

    it("rejects non-hex characters inside encrypted payload segments instead of silent truncation", () => {
      const kmsKey = resolveKmsKey(validKms);
      const legacyKey = deriveLegacyKey(validLegacy);
      const validEnc = encryptPayloadWithKey("PEM-DATA", legacyKey);
      const [, ivHex, tagHex, ctHex] = validEnc.split(":");

      // Corrupt tail with non-hex characters keeping length even
      const nonHexCt = `aes-256-gcm:${ivHex}:${tagHex}:${ctHex.slice(0, -2)}zz`;
      const decRes = decryptPayloadWithKey(nonHexCt, legacyKey);
      expect(decRes.success).toBe(false);
      expect(decRes.error).toMatch(/Malformed hex encoding/i);

      const evalRes = evaluateKeyMigration(nonHexCt, legacyKey, kmsKey);
      expect(evalRes.status).toBe("INVALID_PAYLOAD");
    });
  });
});
