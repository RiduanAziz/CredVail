import { hashPassword } from "./password.ts";
import { inMemoryUserStore } from "../repositories/user-repository.ts";

const globalForSeed = globalThis as unknown as {
  __credvailDevSuperAdminSeedPromise?: Promise<void>;
  __credvailDevSuperAdminSeededKey?: string;
};

/**
 * In NODE_ENV === "development" (and strictly never in production or unit tests),
 * seeds the DEV_SUPER_ADMIN_EMAIL / DEV_SUPER_ADMIN_PASSWORD credentials into
 * the local in-memory user store when no live PostgreSQL server is used.
 */
export async function ensureDevSuperAdminSeeded(): Promise<void> {
  if (process.env.NODE_ENV !== "development") {
    return;
  }
  if (
    process.env.DATABASE_URL &&
    !process.env.DATABASE_URL.includes("localhost:5432")
  ) {
    return;
  }

  const email = process.env.DEV_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.DEV_SUPER_ADMIN_PASSWORD;
  const fullName = process.env.DEV_SUPER_ADMIN_NAME?.trim() || "CREDVAIL Super Admin";

  if (!email || !password) {
    return;
  }

  const seedKey = `${email}:${password.length}`;
  if (globalForSeed.__credvailDevSuperAdminSeededKey === seedKey) {
    return;
  }

  if (!globalForSeed.__credvailDevSuperAdminSeedPromise) {
    globalForSeed.__credvailDevSuperAdminSeedPromise = (async () => {
      const existing = await inMemoryUserStore.findByEmail(email);
      const passwordHash = await hashPassword(password);
      if (existing) {
        await inMemoryUserStore.updatePasswordHash(existing.id, passwordHash);
        await inMemoryUserStore.markEmailVerified(existing.id, new Date());
        existing.platformRole = "SUPER_ADMIN";
      } else {
        const created = await inMemoryUserStore.create({
          email,
          passwordHash,
          fullName,
          platformRole: "SUPER_ADMIN",
        });
        await inMemoryUserStore.markEmailVerified(created.id, new Date());
      }
      globalForSeed.__credvailDevSuperAdminSeededKey = seedKey;
    })().finally(() => {
      globalForSeed.__credvailDevSuperAdminSeedPromise = undefined;
    });
  }

  await globalForSeed.__credvailDevSuperAdminSeedPromise;
}
