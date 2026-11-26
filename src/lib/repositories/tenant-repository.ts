import crypto from "node:crypto";
import { db } from "../db.ts";
import type { TenantRole, VerificationStatus, TenantAnalyticsOverview, AuditLogEntry } from "../../types/index.ts";
import { inMemoryUserStore } from "./user-repository.ts";
import { handleRepositoryError, isInMemoryFallbackPermissible } from "../db/persistence-policy.ts";

export function normalizeIpHash(ipOrHash?: string): string {
  if (!ipOrHash || ipOrHash.trim() === "") {
    return "0000000000000000000000000000000000000000000000000000000000000000";
  }
  const trimmed = ipOrHash.trim();
  if (/^[a-f0-9]{64}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return crypto.createHash("sha256").update(trimmed).digest("hex");
}

export interface TenantRecord {
  id: string;
  slug: string;
  name: string;
  legalEntityName: string;
  websiteUrl: string | null;
  organizationType?: string | null;
  organizationTypeOther?: string | null;
  countryCode?: string | null;
  registrationNumber?: string | null;
  registrationAuthority?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  contactPhone?: string | null;
  adminContactPosition?: string | null;
  authorizedToRegisterAt?: Date | null;
  didUri: string;
  logoUrl: string | null;
  brandingConfig: Record<string, unknown>;
  verificationStatus: VerificationStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantMemberRecord {
  id: string;
  tenantId: string;
  userId: string;
  role: TenantRole;
  invitedBy: string | null;
  acceptedAt: Date | null;
  invitationTokenHash?: string | null;
  invitationExpiresAt?: Date | null;
  user: {
    id: string;
    email: string;
    fullName: string;
  };
}

class InMemoryTenantStore {
  private tenants: Map<string, TenantRecord> = new Map();
  private memberships: Map<string, TenantMemberRecord[]> = new Map(); // tenantId => members
  private auditLogs: AuditLogEntry[] = [];
  private mockStats: Map<string, Partial<TenantAnalyticsOverview>> = new Map();

  async create(data: {
    slug: string;
    name: string;
    legalEntityName: string;
    websiteUrl?: string | null;
    organizationType?: string | null;
    organizationTypeOther?: string | null;
    countryCode?: string | null;
    registrationNumber?: string | null;
    registrationAuthority?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    region?: string | null;
    postalCode?: string | null;
    contactPhone?: string | null;
    adminContactPosition?: string | null;
    authorizedToRegisterAt?: Date | null;
    didUri: string;
    logoUrl?: string;
    brandingConfig?: Record<string, unknown>;
    ownerUserId: string;
    ownerEmail?: string;
    ownerFullName?: string;
  }): Promise<TenantRecord> {
    const normalizedSlug = data.slug.toLowerCase();
    for (const existing of this.tenants.values()) {
      if (existing.slug.toLowerCase() === normalizedSlug) {
        throw new Error(`An organization with the slug '${normalizedSlug}' already exists`);
      }
    }
    const id = `tnt_${crypto.randomUUID()}`;
    const record: TenantRecord = {
      id,
      slug: normalizedSlug,
      name: data.name,
      legalEntityName: data.legalEntityName,
      websiteUrl: data.websiteUrl ?? null,
      organizationType: data.organizationType ?? null,
      organizationTypeOther: data.organizationTypeOther ?? null,
      countryCode: data.countryCode ?? null,
      registrationNumber: data.registrationNumber ?? null,
      registrationAuthority: data.registrationAuthority ?? null,
      addressLine1: data.addressLine1 ?? null,
      addressLine2: data.addressLine2 ?? null,
      city: data.city ?? null,
      region: data.region ?? null,
      postalCode: data.postalCode ?? null,
      contactPhone: data.contactPhone ?? null,
      adminContactPosition: data.adminContactPosition ?? null,
      authorizedToRegisterAt: data.authorizedToRegisterAt ?? null,
      didUri: data.didUri,
      logoUrl: data.logoUrl || null,
      brandingConfig: data.brandingConfig || {},
      verificationStatus: "PENDING",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.tenants.set(id, record);

    // Add owner membership
    const ownerMember: TenantMemberRecord = {
      id: `mem_${crypto.randomUUID()}`,
      tenantId: id,
      userId: data.ownerUserId,
      role: "ORG_OWNER",
      invitedBy: null,
      acceptedAt: new Date(),
      user: {
        id: data.ownerUserId,
        email: data.ownerEmail || "owner@example.com",
        fullName: data.ownerFullName || "Organization Owner",
      },
    };
    this.memberships.set(id, [ownerMember]);

    // Also register in user store
    inMemoryUserStore.addMembership(data.ownerUserId, {
      tenantId: id,
      role: "ORG_OWNER",
      acceptedAt: new Date(),
      tenant: { id, slug: record.slug, name: record.name, didUri: record.didUri },
    });

    // Record audit log
    await this.recordAuditLog({
      tenantId: id,
      userId: data.ownerUserId,
      action: "TENANT_CREATED",
      resourceType: "Tenant",
      resourceId: id,
      metadata: { name: record.name, slug: record.slug, didUri: record.didUri },
    });

    return record;
  }

  async updateTenant(
    id: string,
    data: Partial<Omit<TenantRecord, "id" | "slug" | "createdAt">>
  ): Promise<TenantRecord> {
    const tenant = this.tenants.get(id);
    if (!tenant) throw new Error("Tenant not found");
    const updated: TenantRecord = {
      ...tenant,
      ...data,
      brandingConfig: data.brandingConfig ? { ...tenant.brandingConfig, ...data.brandingConfig } : tenant.brandingConfig,
      updatedAt: new Date(),
    };
    this.tenants.set(id, updated);
    return updated;
  }

  async findBySlug(slug: string): Promise<TenantRecord | null> {
    for (const t of this.tenants.values()) {
      if (t.slug.toLowerCase() === slug.toLowerCase()) return t;
    }
    return null;
  }

  listAllTenants(): TenantRecord[] {
    return Array.from(this.tenants.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  async findById(id: string): Promise<TenantRecord | null> {
    return this.tenants.get(id) || null;
  }

  async listMembers(tenantId: string): Promise<TenantMemberRecord[]> {
    return this.memberships.get(tenantId) || [];
  }

  async addMember(data: {
    tenantId: string;
    userId: string;
    role: TenantRole;
    invitedBy?: string;
    acceptedAt?: Date | null;
    invitationTokenHash?: string | null;
    invitationExpiresAt?: Date | null;
    userEmail?: string;
    userFullName?: string;
  }): Promise<TenantMemberRecord> {
    const members = this.memberships.get(data.tenantId) || [];
    const existing = members.find((m) => m.userId === data.userId);
    if (existing) {
      existing.role = data.role;
      if (data.acceptedAt !== undefined) existing.acceptedAt = data.acceptedAt;
      if (data.invitationTokenHash !== undefined) existing.invitationTokenHash = data.invitationTokenHash;
      if (data.invitationExpiresAt !== undefined) existing.invitationExpiresAt = data.invitationExpiresAt;
      return existing;
    }

    const userInStore = await inMemoryUserStore.findById(data.userId);
    const resolvedEmail = data.userEmail || userInStore?.email || "member@example.com";
    const resolvedFullName = data.userFullName || userInStore?.fullName || "Staff Member";

    const acceptedAt = data.acceptedAt !== undefined ? data.acceptedAt : null;

    const newMember: TenantMemberRecord = {
      id: `mem_${crypto.randomUUID()}`,
      tenantId: data.tenantId,
      userId: data.userId,
      role: data.role,
      invitedBy: data.invitedBy || null,
      acceptedAt,
      invitationTokenHash: data.invitationTokenHash || null,
      invitationExpiresAt: data.invitationExpiresAt || null,
      user: {
        id: data.userId,
        email: resolvedEmail,
        fullName: resolvedFullName,
      },
    };

    members.push(newMember);
    this.memberships.set(data.tenantId, members);

    const tenant = this.tenants.get(data.tenantId);
    if (tenant) {
      inMemoryUserStore.addMembership(data.userId, {
        tenantId: data.tenantId,
        role: data.role,
        acceptedAt,
        tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name, didUri: tenant.didUri },
      });
    }

    return newMember;
  }

  async acceptInvitation(
    tokenHash: string,
    acceptingUserId: string,
    slug?: string
  ): Promise<TenantMemberRecord> {
    for (const [tenantId, members] of this.memberships.entries()) {
      const member = members.find((m) => m.invitationTokenHash === tokenHash);
      if (member) {
        if (slug) {
          const tenant = this.tenants.get(tenantId);
          if (tenant && tenant.slug.toLowerCase() !== slug.toLowerCase()) {
            throw new Error(`Invitation does not belong to organization '${slug}'`);
          }
        }
        if (member.userId !== acceptingUserId) {
          throw new Error("Invitation was issued to a different user");
        }
        if (member.acceptedAt !== null) {
          throw new Error("Invitation has already been accepted (single-use token consumed)");
        }
        if (member.invitationExpiresAt && member.invitationExpiresAt.getTime() < Date.now()) {
          throw new Error("Invitation token has expired");
        }

        const acceptedDate = new Date();
        member.acceptedAt = acceptedDate;
        member.invitationTokenHash = null; // single-use token consumed
        member.invitationExpiresAt = null;

        inMemoryUserStore.updateMembershipAccepted(acceptingUserId, tenantId, acceptedDate);

        return member;
      }
    }
    throw new Error("Invalid or expired invitation token");
  }

  async updateMemberRole(tenantId: string, userId: string, newRole: TenantRole): Promise<boolean> {
    const members = this.memberships.get(tenantId);
    if (!members) return false;
    const member = members.find((m) => m.userId === userId);
    if (!member) return false;
    member.role = newRole;
    inMemoryUserStore.updateMembershipRole(userId, tenantId, newRole);
    return true;
  }

  async removeMember(tenantId: string, userId: string): Promise<boolean> {
    const members = this.memberships.get(tenantId);
    if (!members) return false;
    const filtered = members.filter((m) => m.userId !== userId);
    this.memberships.set(tenantId, filtered);
    inMemoryUserStore.removeMembership(userId, tenantId);
    return true;
  }

  async countOwners(tenantId: string): Promise<number> {
    const members = this.memberships.get(tenantId) || [];
    return members.filter((m) => m.role === "ORG_OWNER").length;
  }

  async transferOwnership(tenantId: string, fromUserId: string, toUserId: string): Promise<boolean> {
    const members = this.memberships.get(tenantId) || [];
    const target = members.find((m) => m.userId === toUserId && m.acceptedAt !== null);
    if (!target) return false;

    const current = members.find((m) => m.userId === fromUserId && m.role === "ORG_OWNER");
    target.role = "ORG_OWNER";
    inMemoryUserStore.updateMembershipRole(toUserId, tenantId, "ORG_OWNER");

    if (current && current.userId !== toUserId) {
      current.role = "INSTITUTION_ADMIN";
      inMemoryUserStore.updateMembershipRole(fromUserId, tenantId, "INSTITUTION_ADMIN");
    }
    return true;
  }

  async recordAuditLog(data: {
    tenantId?: string;
    userId?: string;
    userEmail?: string;
    action: string;
    resourceType: string;
    resourceId: string;
    metadata?: Record<string, unknown>;
    ipHash?: string;
    userAgent?: string;
  }): Promise<AuditLogEntry> {
    const entry: AuditLogEntry = {
      id: `aud_${crypto.randomUUID()}`,
      tenantId: data.tenantId || null,
      userId: data.userId || null,
      userEmail: data.userEmail,
      action: data.action,
      resourceType: data.resourceType,
      resourceId: data.resourceId,
      metadata: data.metadata || {},
      ipHash: normalizeIpHash(data.ipHash),
      userAgent: data.userAgent || null,
      createdAt: new Date().toISOString(),
    };
    this.auditLogs.unshift(entry);
    return entry;
  }

  async listAuditLogs(tenantId: string, limit: number = 50): Promise<AuditLogEntry[]> {
    return this.auditLogs.filter((l) => l.tenantId === tenantId).slice(0, limit);
  }

  setMockStats(tenantId: string, stats: Partial<TenantAnalyticsOverview>) {
    this.mockStats.set(tenantId, stats);
  }

  async getAnalytics(tenantId: string): Promise<TenantAnalyticsOverview> {
    const memberCount = (this.memberships.get(tenantId) || []).length;
    const logs = this.auditLogs.filter((l) => l.tenantId === tenantId);
    const overrides = this.mockStats.get(tenantId) || {};

    const defaultStats: TenantAnalyticsOverview = {
      totalCredentials: 0,
      activeCredentials: 0,
      revokedCredentials: 0,
      suspendedCredentials: 0,
      totalBatches: 0,
      anchoredBatches: 0,
      pendingBatches: 0,
      failedBatches: 0,
      totalTemplates: 0,
      totalMembers: memberCount,
      verificationRequests: 0,
      verificationSuccessRate: 100,
      recentActivity: logs.slice(0, 5).map((l) => ({
        id: l.id,
        action: l.action,
        description: `${l.action} on ${l.resourceType} (${l.resourceId})`,
        timestamp: l.createdAt,
        userEmail: l.userEmail,
      })),
      ...overrides,
    };

    return defaultStats;
  }

  clear() {
    this.tenants.clear();
    this.memberships.clear();
    this.auditLogs = [];
    this.mockStats.clear();
  }
}

const globalForTenantStore = globalThis as unknown as {
  __credvailInMemoryTenantStore?: InMemoryTenantStore;
};

export const inMemoryTenantStore =
  globalForTenantStore.__credvailInMemoryTenantStore ||
  (globalForTenantStore.__credvailInMemoryTenantStore = new InMemoryTenantStore());

export class TenantRepository {
  private forceMemory: boolean;

  constructor(forceMemory: boolean = false) {
    this.forceMemory = forceMemory;
  }

  private get useMemory(): boolean {
    if (!isInMemoryFallbackPermissible()) return false;
    if (this.forceMemory) return true;
    return !process.env.DATABASE_URL || process.env.DATABASE_URL.includes("localhost:5432");
  }

  async createTenant(data: {
    slug: string;
    name: string;
    legalEntityName: string;
    websiteUrl?: string | null;
    organizationType?: string | null;
    organizationTypeOther?: string | null;
    countryCode?: string | null;
    registrationNumber?: string | null;
    registrationAuthority?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    region?: string | null;
    postalCode?: string | null;
    contactPhone?: string | null;
    adminContactPosition?: string | null;
    authorizedToRegisterAt?: Date | null;
    didUri: string;
    logoUrl?: string;
    brandingConfig?: Record<string, unknown>;
    ownerUserId: string;
    ownerEmail?: string;
    ownerFullName?: string;
  }): Promise<TenantRecord> {
    if (this.useMemory) {
      return inMemoryTenantStore.create(data);
    }
    try {
      const tenant = await db.tenant.create({
        data: {
          slug: data.slug.toLowerCase(),
          name: data.name,
          legalEntityName: data.legalEntityName,
          websiteUrl: data.websiteUrl ?? null,
          organizationType: (data.organizationType as any) ?? null,
          organizationTypeOther: data.organizationTypeOther ?? null,
          countryCode: data.countryCode ?? null,
          registrationNumber: data.registrationNumber ?? null,
          registrationAuthority: data.registrationAuthority ?? null,
          addressLine1: data.addressLine1 ?? null,
          addressLine2: data.addressLine2 ?? null,
          city: data.city ?? null,
          region: data.region ?? null,
          postalCode: data.postalCode ?? null,
          contactPhone: data.contactPhone ?? null,
          adminContactPosition: data.adminContactPosition ?? null,
          authorizedToRegisterAt: data.authorizedToRegisterAt ?? null,
          didUri: data.didUri,
          logoUrl: data.logoUrl || null,
          brandingConfig: (data.brandingConfig as any) || {},
          memberships: {
            create: {
              userId: data.ownerUserId,
              role: "ORG_OWNER",
              acceptedAt: new Date(),
            },
          },
        },
      });
      return tenant as unknown as TenantRecord;
    } catch (err) {
      handleRepositoryError("TenantRepository.createTenant", err);
      return inMemoryTenantStore.create(data);
    }
  }

  async updateTenant(
    id: string,
    data: Partial<Omit<TenantRecord, "id" | "slug" | "createdAt">>
  ): Promise<TenantRecord> {
    if (this.useMemory) {
      return inMemoryTenantStore.updateTenant(id, data);
    }
    try {
      const updateData: any = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.legalEntityName !== undefined) updateData.legalEntityName = data.legalEntityName;
      if (data.websiteUrl !== undefined) updateData.websiteUrl = data.websiteUrl;
      if (data.organizationType !== undefined) updateData.organizationType = data.organizationType;
      if (data.organizationTypeOther !== undefined) updateData.organizationTypeOther = data.organizationTypeOther;
      if (data.countryCode !== undefined) updateData.countryCode = data.countryCode;
      if (data.registrationNumber !== undefined) updateData.registrationNumber = data.registrationNumber;
      if (data.registrationAuthority !== undefined) updateData.registrationAuthority = data.registrationAuthority;
      if (data.addressLine1 !== undefined) updateData.addressLine1 = data.addressLine1;
      if (data.addressLine2 !== undefined) updateData.addressLine2 = data.addressLine2;
      if (data.city !== undefined) updateData.city = data.city;
      if (data.region !== undefined) updateData.region = data.region;
      if (data.postalCode !== undefined) updateData.postalCode = data.postalCode;
      if (data.contactPhone !== undefined) updateData.contactPhone = data.contactPhone;
      if (data.adminContactPosition !== undefined) updateData.adminContactPosition = data.adminContactPosition;
      if (data.logoUrl !== undefined) updateData.logoUrl = data.logoUrl;
      if (data.brandingConfig !== undefined) updateData.brandingConfig = data.brandingConfig;
      if (data.verificationStatus !== undefined) updateData.verificationStatus = data.verificationStatus;

      const tenant = await db.tenant.update({
        where: { id },
        data: updateData,
      });
      return tenant as unknown as TenantRecord;
    } catch (err) {
      handleRepositoryError("TenantRepository.updateTenant", err);
      return inMemoryTenantStore.updateTenant(id, data);
    }
  }

  async findBySlug(slug: string): Promise<TenantRecord | null> {
    if (this.useMemory) {
      return inMemoryTenantStore.findBySlug(slug);
    }
    try {
      const tenant = await db.tenant.findUnique({
        where: { slug: slug.toLowerCase() },
      });
      return (tenant as unknown as TenantRecord) || null;
    } catch (err) {
      handleRepositoryError("TenantRepository.findBySlug", err);
      return inMemoryTenantStore.findBySlug(slug);
    }
  }

  async findById(id: string): Promise<TenantRecord | null> {
    if (this.useMemory) {
      return inMemoryTenantStore.findById(id);
    }
    try {
      const tenant = await db.tenant.findUnique({ where: { id } });
      return (tenant as unknown as TenantRecord) || null;
    } catch (err) {
      handleRepositoryError("TenantRepository.findById", err);
      return inMemoryTenantStore.findById(id);
    }
  }

  async listMembers(tenantId: string): Promise<TenantMemberRecord[]> {
    if (this.useMemory) {
      return inMemoryTenantStore.listMembers(tenantId);
    }
    try {
      const members = await db.tenantMembership.findMany({
        where: { tenantId },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
        },
      });
      return members as unknown as TenantMemberRecord[];
    } catch (err) {
      handleRepositoryError("TenantRepository.listMembers", err);
      return inMemoryTenantStore.listMembers(tenantId);
    }
  }

  async addMember(data: {
    tenantId: string;
    userId: string;
    role: TenantRole;
    invitedBy?: string;
    acceptedAt?: Date | null;
    invitationTokenHash?: string | null;
    invitationExpiresAt?: Date | null;
    userEmail?: string;
    userFullName?: string;
  }): Promise<TenantMemberRecord> {
    if (this.useMemory) {
      return inMemoryTenantStore.addMember(data);
    }
    try {
      const member = await db.tenantMembership.create({
        data: {
          tenantId: data.tenantId,
          userId: data.userId,
          role: data.role,
          invitedBy: data.invitedBy || null,
          acceptedAt: data.acceptedAt !== undefined ? data.acceptedAt : null,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              fullName: true,
            },
          },
        },
      });
      return member as unknown as TenantMemberRecord;
    } catch (err) {
      handleRepositoryError("TenantRepository.addMember", err);
      return inMemoryTenantStore.addMember(data);
    }
  }

  async acceptInvitation(
    tokenHash: string,
    acceptingUserId: string,
    slug?: string
  ): Promise<TenantMemberRecord> {
    if (this.useMemory) {
      return inMemoryTenantStore.acceptInvitation(tokenHash, acceptingUserId, slug);
    }
    try {
      return await inMemoryTenantStore.acceptInvitation(tokenHash, acceptingUserId, slug);
    } catch (err) {
      handleRepositoryError("TenantRepository.acceptInvitation", err);
      return inMemoryTenantStore.acceptInvitation(tokenHash, acceptingUserId, slug);
    }
  }

  async updateMemberRole(tenantId: string, userId: string, newRole: TenantRole): Promise<boolean> {
    if (this.useMemory) {
      return inMemoryTenantStore.updateMemberRole(tenantId, userId, newRole);
    }
    try {
      await db.tenantMembership.update({
        where: {
          tenantId_userId: { tenantId, userId },
        },
        data: { role: newRole },
      });
      return true;
    } catch (err) {
      handleRepositoryError("TenantRepository.updateMemberRole", err);
      return inMemoryTenantStore.updateMemberRole(tenantId, userId, newRole);
    }
  }

  async removeMember(tenantId: string, userId: string): Promise<boolean> {
    if (this.useMemory) {
      return inMemoryTenantStore.removeMember(tenantId, userId);
    }
    try {
      await db.tenantMembership.delete({
        where: {
          tenantId_userId: { tenantId, userId },
        },
      });
      return true;
    } catch (err) {
      handleRepositoryError("TenantRepository.removeMember", err);
      return inMemoryTenantStore.removeMember(tenantId, userId);
    }
  }

  async countOwners(tenantId: string): Promise<number> {
    if (this.useMemory) {
      return inMemoryTenantStore.countOwners(tenantId);
    }
    try {
      return await db.tenantMembership.count({
        where: { tenantId, role: "ORG_OWNER" },
      });
    } catch (err) {
      handleRepositoryError("TenantRepository.countOwners", err);
      return inMemoryTenantStore.countOwners(tenantId);
    }
  }

  async transferOwnership(tenantId: string, fromUserId: string, toUserId: string): Promise<boolean> {
    if (this.useMemory) {
      return inMemoryTenantStore.transferOwnership(tenantId, fromUserId, toUserId);
    }
    try {
      return await db.$transaction(async (tx) => {
        const target = await tx.tenantMembership.findUnique({
          where: { tenantId_userId: { tenantId, userId: toUserId } },
        });
        if (!target || target.acceptedAt === null) {
          return false;
        }

        await tx.tenantMembership.update({
          where: { tenantId_userId: { tenantId, userId: toUserId } },
          data: { role: "ORG_OWNER" },
        });

        if (fromUserId !== toUserId) {
          const sender = await tx.tenantMembership.findUnique({
            where: { tenantId_userId: { tenantId, userId: fromUserId } },
          });
          if (sender?.role === "ORG_OWNER") {
            await tx.tenantMembership.update({
              where: { tenantId_userId: { tenantId, userId: fromUserId } },
              data: { role: "INSTITUTION_ADMIN" },
            });
          }
        }
        return true;
      });
    } catch (err) {
      handleRepositoryError("TenantRepository.transferOwnership", err);
      return inMemoryTenantStore.transferOwnership(tenantId, fromUserId, toUserId);
    }
  }

  async getAnalytics(tenantId: string): Promise<TenantAnalyticsOverview> {
    if (this.useMemory) {
      return inMemoryTenantStore.getAnalytics(tenantId);
    }
    try {
      const [
        totalCredentials,
        activeCredentials,
        revokedCredentials,
        suspendedCredentials,
        totalBatches,
        anchoredBatches,
        totalTemplates,
        totalMembers,
        recentLogs,
      ] = await Promise.all([
        db.credentialRecord.count({ where: { tenantId } }),
        db.credentialRecord.count({ where: { tenantId, state: "ISSUED" } }),
        db.credentialRecord.count({ where: { tenantId, state: "REVOKED" } }),
        db.credentialRecord.count({ where: { tenantId, state: "SUSPENDED" } }),
        db.issuanceBatch.count({ where: { tenantId } }),
        db.issuanceBatch.count({ where: { tenantId, status: "ANCHORED" } }),
        db.certificateTemplate.count({ where: { tenantId } }),
        db.tenantMembership.count({ where: { tenantId } }),
        db.auditLog.findMany({
          where: { tenantId },
          orderBy: { createdAt: "desc" },
          take: 5,
        }),
      ]);

      return {
        totalCredentials,
        activeCredentials,
        revokedCredentials,
        suspendedCredentials,
        totalBatches,
        anchoredBatches,
        pendingBatches: totalBatches - anchoredBatches,
        failedBatches: 0,
        totalTemplates,
        totalMembers,
        verificationRequests: 0,
        verificationSuccessRate: 100,
        recentActivity: recentLogs.map((l) => ({
          id: l.id,
          action: l.action,
          description: `${l.action} on ${l.resourceType} (${l.resourceId})`,
          timestamp: l.createdAt.toISOString(),
        })),
      };
    } catch (err) {
      handleRepositoryError("TenantRepository.getAnalytics", err);
      return inMemoryTenantStore.getAnalytics(tenantId);
    }
  }

  async recordAuditLog(data: {
    tenantId?: string;
    userId?: string;
    userEmail?: string;
    action: string;
    resourceType: string;
    resourceId: string;
    metadata?: Record<string, unknown>;
    ipHash?: string;
    userAgent?: string;
  }): Promise<AuditLogEntry> {
    if (this.useMemory) {
      return inMemoryTenantStore.recordAuditLog(data);
    }
    try {
      const log = await db.auditLog.create({
        data: {
          tenantId: data.tenantId || null,
          userId: data.userId || null,
          action: data.action,
          resourceType: data.resourceType,
          resourceId: data.resourceId,
          metadata: (data.metadata as any) || {},
          ipHash: normalizeIpHash(data.ipHash),
          userAgent: data.userAgent || null,
        },
      });
      return {
        ...log,
        metadata: log.metadata as Record<string, unknown>,
        createdAt: log.createdAt.toISOString(),
      };
    } catch (err) {
      handleRepositoryError("TenantRepository.recordAuditLog", err);
      return inMemoryTenantStore.recordAuditLog(data);
    }
  }

  async listAuditLogs(tenantId: string, limit: number = 50): Promise<AuditLogEntry[]> {
    if (this.useMemory) {
      return inMemoryTenantStore.listAuditLogs(tenantId, limit);
    }
    try {
      const logs = await db.auditLog.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: {
          user: {
            select: { email: true, fullName: true },
          },
        },
      });
      return logs.map((l) => ({
        id: l.id,
        tenantId: l.tenantId,
        userId: l.userId,
        userEmail: l.user?.email,
        userFullName: l.user?.fullName,
        action: l.action,
        resourceType: l.resourceType,
        resourceId: l.resourceId,
        metadata: l.metadata as Record<string, unknown>,
        ipHash: l.ipHash,
        userAgent: l.userAgent,
        createdAt: l.createdAt.toISOString(),
      }));
    } catch (err) {
      handleRepositoryError("TenantRepository.listAuditLogs", err);
      return inMemoryTenantStore.listAuditLogs(tenantId, limit);
    }
  }
}
