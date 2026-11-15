import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Environment Configuration Blueprint", () => {
  it("should contain all mandatory variables in .env.example", () => {
    const envPath = path.resolve(__dirname, "../../.env.example");
    expect(fs.existsSync(envPath)).toBe(true);

    const content = fs.readFileSync(envPath, "utf-8");
    const requiredVars = [
      "DATABASE_URL",
      "SESSION_SECRET",
      "KMS_MASTER_KEY",
      "NEXT_PUBLIC_CHAIN_ID",
      "NEXT_PUBLIC_SEPOLIA_RPC_URL",
      "NEXT_PUBLIC_REGISTRY_CONTRACT_ADDRESS",
      "STORAGE_DRIVER",
      "CHALLENGE_TTL_SECONDS"
    ];

    for (const v of requiredVars) {
      expect(content).toContain(v);
    }
  });
});
