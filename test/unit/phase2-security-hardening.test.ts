import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  DEFAULT_DEV_SESSION_SECRET,
  SessionConfigurationError,
  createSessionToken,
  validateSessionConfiguration,
  verifySessionToken,
} from "@/lib/auth/session";
import {
  ChallengeNonceRepository,
  InMemoryChallengeNonceRepository,
} from "@/lib/repositories/challenge-nonce-repository";
import {
  BlockchainConfigurationError,
  BlockchainService,
} from "@/lib/blockchain/blockchain-service";

describe("Phase 2: Secrets, Challenge Nonce Guard & Blockchain Fail-Closed Controls", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    BlockchainService.resetSimulatedState();
    ChallengeNonceRepository.resetTestDouble();
  });

  afterEach(() => {
    ChallengeNonceRepository.resetTestDouble();
    BlockchainService.resetSimulatedState();
    process.env = { ...originalEnv };
  });

  describe("2.1 Session secret fail-closed enforcement", () => {
    it("fails closed in production when SESSION_SECRET is missing, short, or dev default", () => {
      (process.env as any).NODE_ENV = "production";
      delete (process.env as any).NEXT_PHASE;

      delete process.env.SESSION_SECRET;
      expect(() => validateSessionConfiguration()).toThrow(SessionConfigurationError);

      process.env.SESSION_SECRET = "short_secret";
      expect(() => validateSessionConfiguration()).toThrow(SessionConfigurationError);

      process.env.SESSION_SECRET = DEFAULT_DEV_SESSION_SECRET;
      expect(() => validateSessionConfiguration()).toThrow(SessionConfigurationError);

      expect(() =>
        createSessionToken({
          id: "usr_1",
          email: "admin@test.edu",
          fullName: "Admin",
          platformRole: "USER",
          emailVerified: true,
        })
      ).toThrow(SessionConfigurationError);
    });

    it("creates and verifies tokens cleanly in production with a strong >=32 char secret", () => {
      (process.env as any).NODE_ENV = "production";
      delete (process.env as any).NEXT_PHASE;
      process.env.SESSION_SECRET = "production_grade_session_secret_key_over_32_bytes_1234";

      const token = createSessionToken({
        id: "usr_prod_1",
        email: "issuer@university.edu",
        fullName: "Prod Issuer",
        platformRole: "USER",
        emailVerified: true,
      });

      const verified = verifySessionToken(token);
      expect(verified).not.toBeNull();
      expect(verified?.sub).toBe("usr_prod_1");
    });
  });

  describe("2.3 ChallengeNonceRepository test double guard", () => {
    it("forbids registering in-memory test double in production or strict postgres mode", () => {
      (process.env as any).NODE_ENV = "production";
      expect(() =>
        ChallengeNonceRepository.setTestDouble(new InMemoryChallengeNonceRepository())
      ).toThrow(/forbidden/i);

      process.env = { ...originalEnv };
      process.env.REQUIRE_POSTGRES_INTEGRATION = "true";
      expect(() =>
        ChallengeNonceRepository.setTestDouble(new InMemoryChallengeNonceRepository())
      ).toThrow(/forbidden/i);
    });
  });

  describe("2.5 Blockchain live Sepolia vs explicit simulation guard", () => {
    it("fails closed in production when live Sepolia config is incomplete and simulation is not opted-in", async () => {
      (process.env as any).NODE_ENV = "production";
      delete (process.env as any).NEXT_PHASE;
      delete process.env.ALLOW_BLOCKCHAIN_SIMULATION;
      delete process.env.FORCE_SEPOLIA_LIVE;
      delete process.env.DEPLOYER_PRIVATE_KEY;

      await expect(
        BlockchainService.anchorBatch("demo-uni", "batch-1", "0x" + "ab".repeat(32), 5)
      ).rejects.toThrow(BlockchainConfigurationError);

      process.env.FORCE_SEPOLIA_LIVE = "true";
      process.env.DEPLOYER_PRIVATE_KEY = "0x" + "11".repeat(32);
      process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ADDRESS =
        "0x0000000000000000000000000000000000000000";

      expect(() => BlockchainService.assertLiveBlockchainConfigured()).toThrow(
        BlockchainConfigurationError
      );
    });

    it("permits production simulation only when ALLOW_BLOCKCHAIN_SIMULATION=true and validates Sepolia chain ID", async () => {
      (process.env as any).NODE_ENV = "production";
      delete (process.env as any).NEXT_PHASE;
      process.env.ALLOW_BLOCKCHAIN_SIMULATION = "true";

      const res = await BlockchainService.anchorBatch(
        "demo-uni",
        "batch-sim-1",
        "0x" + "cd".repeat(32),
        10
      );
      expect(res.txHash).toMatch(/^0x[0-9a-f]{64}$/i);
      expect(BlockchainService.validateChainId(BlockchainService.SEPOLIA_CHAIN_ID)).toBe(true);
      expect(() => BlockchainService.validateChainId(1)).toThrow(BlockchainConfigurationError);
    });
  });
});
