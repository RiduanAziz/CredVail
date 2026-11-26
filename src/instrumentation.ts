/**
 * CREDVAIL Server Runtime Instrumentation
 *
 * Executes once during Next.js server runtime boot.
 * Enforces production fail-closed validation for KMS_MASTER_KEY.
 * Bypasses secret enforcement during Next.js static build phase (phase-production-build).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // In production server runtime, ensure KMS_MASTER_KEY is valid before accepting traffic
    if (
      process.env.NODE_ENV === "production" &&
      process.env.NEXT_PHASE !== "phase-production-build"
    ) {
      const { KeyService } = await import("@/lib/crypto/key-service");
      KeyService.validateMasterKey();

      const { validateDatabaseConfiguration } = await import("@/lib/db/persistence-policy");
      validateDatabaseConfiguration();

      const { validateSessionConfiguration } = await import("@/lib/auth/session");
      validateSessionConfiguration();
    }
  }
}
