/**
 * CREDVAIL Production Database Persistence Policy & Error Governance (CRV-SEC-02)
 *
 * Enforces fail-closed database persistence rules across all repositories.
 * Strictly forbids silent in-memory fallbacks when running in production (NODE_ENV === "production")
 * or when live PostgreSQL integration is required (REQUIRE_POSTGRES_INTEGRATION === "true").
 */

export class DatabasePersistenceError extends Error {
  public readonly code = "DATABASE_PERSISTENCE_FAILURE";

  constructor(
    public readonly operation: string,
    message: string,
    public readonly cause?: unknown
  ) {
    super(`[DatabasePersistenceError] ${operation}: ${message}`);
    this.name = "DatabasePersistenceError";
    Object.setPrototypeOf(this, DatabasePersistenceError.prototype);
  }
}

/**
 * Validates production database configuration at server startup.
 * Throws DatabasePersistenceError if DATABASE_URL is missing, empty, or not PostgreSQL.
 */
export function validateDatabaseConfiguration(): void {
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl || typeof dbUrl !== "string" || dbUrl.trim() === "") {
    throw new DatabasePersistenceError(
      "StartupValidation",
      "DATABASE_URL environment variable is required in production but is missing or empty."
    );
  }

  const trimmed = dbUrl.trim();
  if (!trimmed.startsWith("postgresql://") && !trimmed.startsWith("postgres://")) {
    throw new DatabasePersistenceError(
      "StartupValidation",
      "DATABASE_URL must configure a valid PostgreSQL connection (starting with postgresql:// or postgres://)."
    );
  }
}

/**
 * Determines whether an in-memory repository fallback is permissible in the current environment.
 *
 * Rules:
 * 1. In production (NODE_ENV === "production"): STRICTLY FORBIDDEN. Always returns false.
 * 2. In live integration tests (REQUIRE_POSTGRES_INTEGRATION === "true"): STRICTLY FORBIDDEN. Returns false.
 * 3. In non-production environments (test/development): Permissible for hermetic suites when DB is absent.
 */
export function isInMemoryFallbackPermissible(): boolean {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.REQUIRE_POSTGRES_INTEGRATION === "true"
  ) {
    return false;
  }
  return true;
}

/**
 * Sanitizes an error message by stripping passwords and credentials from database connection strings.
 */
export function sanitizeDatabaseErrorMessage(raw: unknown): string {
  if (!raw) return "Unknown persistence error";
  const str = raw instanceof Error ? raw.message : String(raw);
  return str.replace(/((?:postgresql|postgres):\/\/)[^/\s]+@/gi, "$1***:***@");
}

/**
 * Centralized repository error handler.
 * If in production or live integration mode, aborts immediately by throwing DatabasePersistenceError.
 * In non-production mode, permits controlled fallback to in-memory test doubles.
 */
export function handleRepositoryError(operation: string, error: unknown): void {
  if (!isInMemoryFallbackPermissible()) {
    const sanitized = sanitizeDatabaseErrorMessage(error);
    throw new DatabasePersistenceError(
      operation,
      `Database persistence failed. Silent in-memory fallback is forbidden in production. Details: ${sanitized}`,
      error
    );
  }
}
