import { z } from "zod";
import { TenantRepository, TenantRecord, TenantMemberRecord } from "@/lib/repositories/tenant-repository";
import { UserRepository } from "@/lib/repositories/user-repository";
import { assertTenantPermission } from "@/lib/auth/rbac";
import { SessionPayload } from "@/lib/auth/session";
import { TenantRole, TenantAnalyticsOverview, AuditLogEntry } from "@/types";

export const createTenantSchema = z.object({
  name: z.string().min(2, "Institution name must be at least 2 characters long"),
  legalEntityName: z.string().min(2, "Legal entity name is required"),
  websiteUrl: z.string().url("Must be a valid website URL"),
  slug: z
    .string()
    .min(3, "Slug must be at least 3 characters long")
    .max(64)
    .regex(/^[a-z0-9-]+$/, "Slug must only contain lowercase alphanumeric characters and hyphens")
    .optional(),
  logoUrl: z.string().url("Must be a valid URL").optional(),
  brandingConfig: z.record(z.unknown()).optional(),
});

export const updateTenantSchema = z.object({
  name: z.string().min(2, "Institution name must be at least 2 characters long").optional(),
  legalEntityName: z.string().min(2, "Legal entity name is required").optional(),
  websiteUrl: z.string().url("Must be a valid website URL").optional(),
  logoUrl: z.string().url("Must be a valid URL").nullable().optional(),
  verificationStatus: z.enum(["UNVERIFIED", "PENDING", "VERIFIED", "SUSPENDED"] as const).optional(),
  brandingConfig: z
    .object({
      primaryColor: z.string().optional(),
      secondaryColor: z.string().optional(),
      accentColor: z.string().optional(),
      fontFamily: z.string().optional(),
      darkLogoUrl: z.string().optional(),
      certificateBorderUrl: z.string().optional(),
      signatureTitle: z.string().optional(),
      tagline: z.string().optional(),
    })
    .passthrough()
    .optional(),
});

export const inviteMemberSchema = z.object({
  email: z.string().email("Invalid email address"),
  fullName: z.string().min(2, "Full name is required"),
  role: z.enum([
    "ORG_OWNER",
    "INSTITUTION_ADMIN",
    "CERTIFICATE_ISSUER",
    "TEMPLATE_DESIGNER",
    "READ_ONLY_STAFF",
  ] as const),
});

export class TenantService {
  private tenantRepo: TenantRepository;
  private userRepo: UserRepository;

  constructor(tenantRepo?: TenantRepository, userRepo?: UserRepository) {
    this.tenantRepo = tenantRepo || new TenantRepository();
    this.userRepo = userRepo || new UserRepository();
  }

  /**
   * Generates a URL-friendly slug from an institution name if not provided.
   */
  public static generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  /**
   * Registers a new institutional tenant and assigns the creator as ORG_OWNER.
   */
  async createOrganization(
    input: z.infer<typeof createTenantSchema>,
    ownerUserId: string
  ): Promise<TenantRecord> {
    const validated = createTenantSchema.parse(input);
    const slug = (validated.slug || TenantService.generateSlug(validated.name)).toLowerCase();

    const existing = await this.tenantRepo.findBySlug(slug);
    if (existing) {
      throw new Error(`An organization with the slug '${slug}' already exists`);
    }

    const didDomain = process.env.NEXT_PUBLIC_DID_DOMAIN || "credvail.io";
    const didUri = `did:web:${didDomain}:tenants:${slug}`;

    return await this.tenantRepo.createTenant({
      slug,
      name: validated.name,
      legalEntityName: validated.legalEntityName,
      websiteUrl: validated.websiteUrl,
      didUri,
      logoUrl: validated.logoUrl,
      brandingConfig: validated.brandingConfig || {},
      ownerUserId,
    });
  }

  /**
   * Retrieves tenant details ensuring caller has active membership or platform admin privileges.
   */
  async getOrganization(slug: string, session: SessionPayload): Promise<TenantRecord> {
    const tenant = await this.tenantRepo.findBySlug(slug);
    if (!tenant) {
      throw new Error(`Tenant '${slug}' not found`);
    }

    const isMember = session.tenants.some((t) => t.slug === slug || t.tenantId === tenant.id);
    const isPlatformAdmin = session.platformRole === "SUPER_ADMIN";

    if (!isMember && !isPlatformAdmin) {
      throw new Error(`Forbidden: You do not possess access to organization '${slug}'`);
    }

    return tenant;
  }

  /**
   * Lists all members of a tenant. Caller must be an authorized member.
   */
  async listMembers(slug: string, session: SessionPayload): Promise<TenantMemberRecord[]> {
    const tenant = await this.getOrganization(slug, session);
    return await this.tenantRepo.listMembers(tenant.id);
  }

  /**
   * Invites or adds a new team member with an assigned TenantRole.
   */
  async inviteMember(
    slug: string,
    input: z.infer<typeof inviteMemberSchema>,
    session: SessionPayload
  ): Promise<TenantMemberRecord> {
    const validated = inviteMemberSchema.parse(input);
    const tenant = await this.tenantRepo.findBySlug(slug);
    if (!tenant) throw new Error(`Tenant '${slug}' not found`);

    const membership = session.tenants.find((t) => t.slug === slug || t.tenantId === tenant.id);
    if (session.platformRole !== "SUPER_ADMIN") {
      assertTenantPermission(membership?.role, "members:invite");
    }

    // Find or create user record for invited staff
    let user = await this.userRepo.findByEmail(validated.email);
    if (!user) {
      user = await this.userRepo.create({
        email: validated.email,
        passwordHash: "INVITED_PENDING_ACTIVATION",
        fullName: validated.fullName,
        platformRole: "USER",
      });
    }

    const member = await this.tenantRepo.addMember({
      tenantId: tenant.id,
      userId: user.id,
      role: validated.role,
      invitedBy: session.sub,
      userEmail: user.email,
      userFullName: user.fullName,
    });

    await this.tenantRepo.recordAuditLog({
      tenantId: tenant.id,
      userId: session.sub,
      userEmail: session.email,
      action: "MEMBER_INVITED",
      resourceType: "TenantMembership",
      resourceId: member.id,
      metadata: { targetUserId: user.id, email: validated.email, role: validated.role },
    });

    return member;
  }

  /**
   * Updates a member's role within the organization.
   */
  async updateMemberRole(
    slug: string,
    targetUserId: string,
    newRole: TenantRole,
    session: SessionPayload
  ): Promise<boolean> {
    const tenant = await this.tenantRepo.findBySlug(slug);
    if (!tenant) throw new Error(`Tenant '${slug}' not found`);

    const callerMembership = session.tenants.find((t) => t.slug === slug || t.tenantId === tenant.id);
    if (session.platformRole !== "SUPER_ADMIN") {
      assertTenantPermission(callerMembership?.role, "members:update_role");
    }

    // If demoting an existing ORG_OWNER, guarantee at least one other ORG_OWNER exists
    const members = await this.tenantRepo.listMembers(tenant.id);
    const targetMember = members.find((m) => m.userId === targetUserId);
    if (!targetMember) {
      throw new Error("Target user is not a member of this organization");
    }

    if (targetMember.role === "ORG_OWNER" && newRole !== "ORG_OWNER") {
      const ownerCount = await this.tenantRepo.countOwners(tenant.id);
      if (ownerCount <= 1) {
        throw new Error("Cannot demote the sole Organization Owner. Transfer ownership first.");
      }
    }

    const success = await this.tenantRepo.updateMemberRole(tenant.id, targetUserId, newRole);

    if (success) {
      await this.tenantRepo.recordAuditLog({
        tenantId: tenant.id,
        userId: session.sub,
        userEmail: session.email,
        action: "MEMBER_ROLE_UPDATED",
        resourceType: "TenantMembership",
        resourceId: targetMember.id,
        metadata: { targetUserId, previousRole: targetMember.role, newRole },
      });
    }

    return success;
  }

  /**
   * Removes a member from the organization.
   */
  async removeMember(
    slug: string,
    targetUserId: string,
    session: SessionPayload
  ): Promise<boolean> {
    const tenant = await this.tenantRepo.findBySlug(slug);
    if (!tenant) throw new Error(`Tenant '${slug}' not found`);

    const callerMembership = session.tenants.find((t) => t.slug === slug || t.tenantId === tenant.id);
    if (session.platformRole !== "SUPER_ADMIN") {
      assertTenantPermission(callerMembership?.role, "members:remove");
    }

    const members = await this.tenantRepo.listMembers(tenant.id);
    const targetMember = members.find((m) => m.userId === targetUserId);
    if (!targetMember) {
      throw new Error("Target user is not a member of this organization");
    }

    if (targetMember.role === "ORG_OWNER") {
      const ownerCount = await this.tenantRepo.countOwners(tenant.id);
      if (ownerCount <= 1) {
        throw new Error("Cannot remove the sole Organization Owner");
      }
    }

    const success = await this.tenantRepo.removeMember(tenant.id, targetUserId);

    if (success) {
      await this.tenantRepo.recordAuditLog({
        tenantId: tenant.id,
        userId: session.sub,
        userEmail: session.email,
        action: "MEMBER_REMOVED",
        resourceType: "TenantMembership",
        resourceId: targetMember.id,
        metadata: { targetUserId, formerRole: targetMember.role },
      });
    }

    return success;
  }

  /**
   * Updates organization metadata and branding configuration.
   */
  async updateOrganization(
    slug: string,
    input: z.infer<typeof updateTenantSchema>,
    session: SessionPayload
  ): Promise<TenantRecord> {
    const validated = updateTenantSchema.parse(input);
    const tenant = await this.tenantRepo.findBySlug(slug);
    if (!tenant) throw new Error(`Tenant '${slug}' not found`);

    const callerMembership = session.tenants.find((t) => t.slug === slug || t.tenantId === tenant.id);
    if (session.platformRole !== "SUPER_ADMIN") {
      assertTenantPermission(callerMembership?.role, "tenant:manage");
    }

    const updated = await this.tenantRepo.updateTenant(tenant.id, {
      name: validated.name,
      legalEntityName: validated.legalEntityName,
      websiteUrl: validated.websiteUrl,
      logoUrl: validated.logoUrl,
      brandingConfig: validated.brandingConfig,
      verificationStatus: validated.verificationStatus,
    });

    await this.tenantRepo.recordAuditLog({
      tenantId: tenant.id,
      userId: session.sub,
      userEmail: session.email,
      action: "TENANT_METADATA_UPDATED",
      resourceType: "Tenant",
      resourceId: tenant.id,
      metadata: { changedFields: Object.keys(validated) },
    });

    return updated;
  }

  /**
   * Retrieves analytics overview for the institution dashboard.
   */
  async getAnalyticsOverview(slug: string, session: SessionPayload): Promise<TenantAnalyticsOverview> {
    const tenant = await this.getOrganization(slug, session);
    return await this.tenantRepo.getAnalytics(tenant.id);
  }

  /**
   * Retrieves audit logs for the organization.
   */
  async getAuditLogs(
    slug: string,
    session: SessionPayload,
    limit: number = 50
  ): Promise<AuditLogEntry[]> {
    const tenant = await this.tenantRepo.findBySlug(slug);
    if (!tenant) throw new Error(`Tenant '${slug}' not found`);

    const callerMembership = session.tenants.find((t) => t.slug === slug || t.tenantId === tenant.id);
    const isPlatformAdmin = session.platformRole === "SUPER_ADMIN";

    if (!callerMembership && !isPlatformAdmin) {
      throw new Error(`Forbidden: You do not possess access to organization '${slug}'`);
    }

    if (!isPlatformAdmin) {
      assertTenantPermission(callerMembership?.role, "audit:read");
    }

    return await this.tenantRepo.listAuditLogs(tenant.id, limit);
  }
}
