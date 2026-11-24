/**
 * CREDVAIL Recipient Governance & Management Service
 * 
 * Orchestrates:
 * 1. Recipient registration and profile management
 * 2. Multi-tenant email deduplication
 * 3. External identifier mapping (e.g. Student ID / Employee ID)
 * 4. Bulk recipient import and synchronization
 * 5. RBAC permission assertion and tenant audit logging
 */

import { z } from "zod";
import { RecipientRepository, type RecipientRecord, type ListRecipientsOptions } from "../repositories/recipient-repository.ts";
import { TenantRepository } from "../repositories/tenant-repository.ts";
import { assertTenantPermission } from "../auth/rbac.ts";
import type { SessionPayload } from "../auth/session.ts";

export const createRecipientSchema = z.object({
  fullName: z.string().trim().min(2, "Full name must be at least 2 characters").max(120),
  email: z.string().trim().email("Must be a valid email address").max(255),
  externalIdentifier: z.string().trim().max(100).optional(),
  metadata: z.record(z.any()).optional(),
});

export const updateRecipientSchema = z.object({
  fullName: z.string().trim().min(2, "Full name must be at least 2 characters").max(120).optional(),
  email: z.string().trim().email("Must be a valid email address").max(255).optional(),
  externalIdentifier: z.string().trim().max(100).nullable().optional(),
  metadata: z.record(z.any()).optional(),
});

export const bulkImportRecipientsSchema = z.object({
  recipients: z.array(createRecipientSchema).min(1, "At least one recipient must be supplied"),
});

export class RecipientService {
  private recipientRepo: RecipientRepository;
  private tenantRepo: TenantRepository;

  constructor(recipientRepo?: RecipientRepository, tenantRepo?: TenantRepository) {
    this.recipientRepo = recipientRepo || new RecipientRepository();
    this.tenantRepo = tenantRepo || new TenantRepository();
  }

  private async getAuthorizedTenant(slug: string, session: SessionPayload) {
    const tenant = await this.tenantRepo.findBySlug(slug);
    if (!tenant) throw new Error(`Institution '${slug}' not found`);

    const callerMembership = session.tenants?.find((t) => t.slug === slug || t.tenantId === tenant.id);
    const isPlatformAdmin = session.platformRole === "SUPER_ADMIN";

    if (!callerMembership && !isPlatformAdmin) {
      throw new Error(`Forbidden: You do not possess access to institution '${slug}'`);
    }

    return { tenant, callerMembership, isPlatformAdmin };
  }

  async createRecipient(
    slug: string,
    input: z.infer<typeof createRecipientSchema>,
    session: SessionPayload
  ): Promise<RecipientRecord> {
    const { tenant, callerMembership, isPlatformAdmin } = await this.getAuthorizedTenant(slug, session);

    if (!isPlatformAdmin) {
      assertTenantPermission(callerMembership?.role, "batches:create");
    }

    const validated = createRecipientSchema.parse(input);

    const recipient = await this.recipientRepo.createRecipient({
      tenantId: tenant.id,
      fullName: validated.fullName,
      email: validated.email,
      externalIdentifier: validated.externalIdentifier,
      metadata: validated.metadata,
    });

    await this.tenantRepo.recordAuditLog({
      tenantId: tenant.id,
      userId: session.sub,
      userEmail: session.email,
      action: "RECIPIENT_CREATED",
      resourceType: "Recipient",
      resourceId: recipient.id,
      metadata: {
        fullName: recipient.fullName,
        email: recipient.email,
        externalIdentifier: recipient.externalIdentifier,
      },
    });

    return recipient;
  }

  async getRecipient(
    slug: string,
    id: string,
    session: SessionPayload
  ): Promise<RecipientRecord> {
    const { tenant } = await this.getAuthorizedTenant(slug, session);

    const recipient = await this.recipientRepo.getRecipientById(tenant.id, id);
    if (!recipient) {
      throw new Error(`Recipient '${id}' not found for institution '${slug}'`);
    }

    return recipient;
  }

  async listRecipients(
    slug: string,
    session: SessionPayload,
    options: ListRecipientsOptions = {}
  ): Promise<{ items: RecipientRecord[]; total: number }> {
    const { tenant, callerMembership, isPlatformAdmin } = await this.getAuthorizedTenant(slug, session);

    if (!isPlatformAdmin) {
      assertTenantPermission(callerMembership?.role, "credentials:read");
    }

    return this.recipientRepo.listRecipients(tenant.id, options);
  }

  async updateRecipient(
    slug: string,
    id: string,
    input: z.infer<typeof updateRecipientSchema>,
    session: SessionPayload
  ): Promise<RecipientRecord> {
    const { tenant, callerMembership, isPlatformAdmin } = await this.getAuthorizedTenant(slug, session);

    if (!isPlatformAdmin) {
      assertTenantPermission(callerMembership?.role, "batches:create");
    }

    const validated = updateRecipientSchema.parse(input);
    const updated = await this.recipientRepo.updateRecipient(tenant.id, id, validated);

    await this.tenantRepo.recordAuditLog({
      tenantId: tenant.id,
      userId: session.sub,
      userEmail: session.email,
      action: "RECIPIENT_UPDATED",
      resourceType: "Recipient",
      resourceId: id,
      metadata: { changedFields: Object.keys(input) },
    });

    return updated;
  }

  async deleteRecipient(
    slug: string,
    id: string,
    session: SessionPayload
  ): Promise<boolean> {
    const { tenant, callerMembership, isPlatformAdmin } = await this.getAuthorizedTenant(slug, session);

    if (!isPlatformAdmin) {
      assertTenantPermission(callerMembership?.role, "batches:create");
    }

    const success = await this.recipientRepo.deleteRecipient(tenant.id, id);

    if (success) {
      await this.tenantRepo.recordAuditLog({
        tenantId: tenant.id,
        userId: session.sub,
        userEmail: session.email,
        action: "RECIPIENT_DELETED",
        resourceType: "Recipient",
        resourceId: id,
        metadata: { recipientId: id },
      });
    }

    return success;
  }

  async bulkImportRecipients(
    slug: string,
    input: z.infer<typeof bulkImportRecipientsSchema>,
    session: SessionPayload
  ): Promise<{
    imported: RecipientRecord[];
    duplicatesSkipped: number;
    total: number;
  }> {
    const { tenant, callerMembership, isPlatformAdmin } = await this.getAuthorizedTenant(slug, session);

    if (!isPlatformAdmin) {
      assertTenantPermission(callerMembership?.role, "batches:create");
    }

    const validated = bulkImportRecipientsSchema.parse(input);
    const imported: RecipientRecord[] = [];
    let duplicatesSkipped = 0;

    for (const r of validated.recipients) {
      try {
        const existing = await this.recipientRepo.findByEmail(tenant.id, r.email);
        if (existing) {
          duplicatesSkipped++;
          continue;
        }

        const created = await this.recipientRepo.createRecipient({
          tenantId: tenant.id,
          fullName: r.fullName,
          email: r.email,
          externalIdentifier: r.externalIdentifier,
          metadata: r.metadata,
        });
        imported.push(created);
      } catch {
        duplicatesSkipped++;
      }
    }

    await this.tenantRepo.recordAuditLog({
      tenantId: tenant.id,
      userId: session.sub,
      userEmail: session.email,
      action: "RECIPIENTS_BULK_IMPORTED",
      resourceType: "Recipient",
      resourceId: tenant.id,
      metadata: {
        totalSupplied: validated.recipients.length,
        importedCount: imported.length,
        duplicatesSkipped,
      },
    });

    return {
      imported,
      duplicatesSkipped,
      total: validated.recipients.length,
    };
  }
}
