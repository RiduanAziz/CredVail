import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { KeyService } from "@/lib/crypto/key-service";
import { validateSessionConfiguration } from "@/lib/auth/session";
import { validateDatabaseConfiguration, isInMemoryFallbackPermissible } from "@/lib/db/persistence-policy";
import { BlockchainService } from "@/lib/blockchain/blockchain-service";
import { SelectiveDisclosureEngine } from "@/lib/crypto/selective-disclosure";
import { MetricsRegistry } from "@/lib/observability/logger";

export async function GET() {
  const startedAt = Date.now();

  let kmsOk = true;
  try {
    if (process.env.KMS_MASTER_KEY || process.env.NODE_ENV === "production") {
      KeyService.validateMasterKey();
    }
  } catch {
    kmsOk = false;
  }

  let sessionConfigOk = true;
  try {
    validateSessionConfiguration();
  } catch {
    sessionConfigOk = false;
  }

  let dbConfigOk = true;
  let dbReachable = false;
  const shouldProbeDb =
    !isInMemoryFallbackPermissible() ||
    Boolean(process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("localhost:5432"));
  try {
    validateDatabaseConfiguration();
    if (shouldProbeDb) {
      await db.$queryRaw`SELECT 1`;
      dbReachable = true;
    }
  } catch {
    if (!isInMemoryFallbackPermissible()) {
      dbConfigOk = false;
    }
  }

  const chainStatus = BlockchainService.getNetworkStatus();
  const selectiveDisclosure = SelectiveDisclosureEngine.getComplianceStatus();

  const healthy =
    kmsOk &&
    sessionConfigOk &&
    dbConfigOk &&
    (process.env.NODE_ENV !== "production" || dbReachable);

  MetricsRegistry.recordLatencyMs("health_check", Date.now() - startedAt);
  MetricsRegistry.incrementCounter("health_checks_total");

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      checks: {
        kmsMasterKeyConfigured: kmsOk,
        sessionSecretValid: sessionConfigOk,
        databaseConfigurationValid: dbConfigOk,
        databaseReachable: dbReachable,
        blockchainSimulationMode: chainStatus.isSimulated,
        selectiveDisclosureFailClosed: selectiveDisclosure.failClosedActive,
      },
      metrics: MetricsRegistry.getSnapshot(),
    },
    { status: healthy ? 200 : 503 }
  );
}
