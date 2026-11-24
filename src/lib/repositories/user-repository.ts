import { db } from "../db.ts";
import type { PlatformRole, TenantRole } from "../../types/index.ts";
import { handleRepositoryError, isInMemoryFallbackPermissible } from "../db/persistence-policy.ts";

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  avatarUrl: string | null;
  platformRole: PlatformRole;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserWithMemberships extends UserRecord {
  memberships: Array<{
    tenantId: string;
    role: TenantRole;
    acceptedAt?: Date | null;
    tenant: {
      id: string;
      slug: string;
      name: string;
      didUri: string;
    };
  }>;
}

/**
 * In-memory fallback store for zero-database test execution and offline dev.
 */
class InMemoryUserStore {
  private users: Map<string, UserRecord> = new Map();
  private memberships: Map<string, Array<{ tenantId: string; role: TenantRole; acceptedAt?: Date | null; tenant: any }>> = new Map();

  async create(data: { email: string; passwordHash: string; fullName: string; platformRole?: PlatformRole }): Promise<UserRecord> {
    const id = `usr_${crypto.randomUUID()}`;
    const record: UserRecord = {
      id,
      email: data.email.toLowerCase(),
      passwordHash: data.passwordHash,
      fullName: data.fullName,
      avatarUrl: null,
      platformRole: data.platformRole || "USER",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.set(id, record);
    return record;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    for (const u of this.users.values()) {
      if (u.email.toLowerCase() === email.toLowerCase()) return u;
    }
    return null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    return this.users.get(id) || null;
  }

  async findWithMemberships(id: string): Promise<UserWithMemberships | null> {
    const user = this.users.get(id);
    if (!user) return null;
    return {
      ...user,
      memberships: this.memberships.get(id) || [],
    };
  }

  addMembership(userId: string, membership: { tenantId: string; role: TenantRole; tenant: any; acceptedAt?: Date | null }) {
    const list = this.memberships.get(userId) || [];
    const existing = list.find((m) => m.tenantId === membership.tenantId);
    const resolvedAcceptedAt = membership.acceptedAt !== undefined ? membership.acceptedAt : new Date();
    if (existing) {
      existing.role = membership.role;
      existing.acceptedAt = resolvedAcceptedAt;
    } else {
      list.push({
        ...membership,
        acceptedAt: resolvedAcceptedAt,
      });
    }
    this.memberships.set(userId, list);
  }

  updateMembershipAccepted(userId: string, tenantId: string, acceptedAt: Date) {
    const list = this.memberships.get(userId) || [];
    const item = list.find((m) => m.tenantId === tenantId);
    if (item) {
      item.acceptedAt = acceptedAt;
    }
  }

  updateMembershipRole(userId: string, tenantId: string, role: TenantRole) {
    const list = this.memberships.get(userId) || [];
    const item = list.find((m) => m.tenantId === tenantId);
    if (item) {
      item.role = role;
    }
  }

  removeMembership(userId: string, tenantId: string) {
    const list = this.memberships.get(userId) || [];
    const filtered = list.filter((m) => m.tenantId !== tenantId);
    this.memberships.set(userId, filtered);
  }

  clear() {
    this.users.clear();
    this.memberships.clear();
  }
}

export const inMemoryUserStore = new InMemoryUserStore();

export class UserRepository {
  private forceMemory: boolean;

  constructor(forceMemory: boolean = false) {
    this.forceMemory = forceMemory;
  }

  private get useMemory(): boolean {
    if (!isInMemoryFallbackPermissible()) return false;
    if (this.forceMemory) return true;
    return !process.env.DATABASE_URL || process.env.DATABASE_URL.includes("localhost:5432");
  }

  async create(data: {
    email: string;
    passwordHash: string;
    fullName: string;
    platformRole?: PlatformRole;
  }): Promise<UserRecord> {
    if (this.useMemory) {
      return inMemoryUserStore.create(data);
    }
    try {
      return (await db.user.create({
        data: {
          email: data.email.toLowerCase(),
          passwordHash: data.passwordHash,
          fullName: data.fullName,
          platformRole: data.platformRole || "USER",
        },
      })) as UserRecord;
    } catch (err) {
      handleRepositoryError("UserRepository.create", err);
      return inMemoryUserStore.create(data);
    }
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    if (this.useMemory) {
      return inMemoryUserStore.findByEmail(email);
    }
    try {
      const user = await db.user.findUnique({
        where: { email: email.toLowerCase() },
      });
      return (user as UserRecord) || null;
    } catch (err) {
      handleRepositoryError("UserRepository.findByEmail", err);
      return inMemoryUserStore.findByEmail(email);
    }
  }

  async findById(id: string): Promise<UserRecord | null> {
    if (this.useMemory) {
      return inMemoryUserStore.findById(id);
    }
    try {
      const user = await db.user.findUnique({ where: { id } });
      return (user as UserRecord) || null;
    } catch (err) {
      handleRepositoryError("UserRepository.findById", err);
      return inMemoryUserStore.findById(id);
    }
  }

  async findWithMemberships(id: string): Promise<UserWithMemberships | null> {
    if (this.useMemory) {
      return inMemoryUserStore.findWithMemberships(id);
    }
    try {
      const user = await db.user.findUnique({
        where: { id },
        include: {
          memberships: {
            include: {
              tenant: {
                select: {
                  id: true,
                  slug: true,
                  name: true,
                  didUri: true,
                },
              },
            },
          },
        },
      });
      return (user as unknown as UserWithMemberships) || null;
    } catch (err) {
      handleRepositoryError("UserRepository.findWithMemberships", err);
      return inMemoryUserStore.findWithMemberships(id);
    }
  }
}
