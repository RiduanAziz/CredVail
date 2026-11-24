/**
 * CREDVAIL Individual Credential Issuance Engine
 * 
 * Orchestrates atomic generation of single on-demand credentials:
 * 1. Template resolution and version snapshot retention
 * 2. Recipient registration / profile lookup
 * 3. Collision-safe certificate numbering
 * 4. Stable W3C Credential URNs and verification URLs
 * 5. High-resolution vector PDF rendering with dynamic QR codes
 * 6. Cryptographic W3C Verifiable Credential signing with active P-256 issuer key
 * 7. Single-leaf Merkle tree commitment
 * 8. Automatic single-use claim invitation dispatch
 * 9. Scoped multi-tenant persistence and audit logging
 */

import { randomUUID } from "crypto";
import { z } from "zod";
import { CredentialRepository, type StoredCredentialRecord } from "../repositories/credential-repository.ts";
import { BatchRepository, type StagedRecipientData } from "../repositories/batch-repository.ts";
import { TemplateRepository } from "../repositories/template-repository.ts";
import { TenantRepository } from "../repositories/tenant-repository.ts";
import { RecipientRepository } from "../repositories/recipient-repository.ts";
import { KeyManagementService } from "./key-management-service.ts";
import { KeyRepository } from "../repositories/key-repository.ts";
import { ClaimInvitationService } from "./claim-invitation-service.ts";
import { PdfGenerator } from "../pdf/pdf-generator.ts";
import { QrService } from "../pdf/qr-service.ts";
import { VcService } from "../crypto/vc-service.ts";
import { assertTenantPermission } from "../auth/rbac.ts";
import type { SessionPayload } from "../auth/session.ts";
import { TEMPLATE_PRESETS } from "../templates/presets.ts";

export const issueSingleCredentialInputSchema = z.object({
  templateId: z.string().min(1, "Template ID is required"),
  recipient: z.object({
    fullName: z.string().trim().min(2, "Full name must be at least 2 characters").max(120),
    email: z.string().trim().email("Must be a valid email address").max(255),
    externalIdentifier: z.string().trim().max(100).optional(),
  }),
  claims: z.record(z.string()).optional().default({}),
  certificateNumber: z.string().trim().max(50).optional(),
});

export type IssueSingleCredentialInput = z.input<typeof issueSingleCredentialInputSchema>;

export interface SingleIssuanceResult {
  credential: {
    id: string;
    credentialId: string;
    certificateNumber: string;
    recipientName: string;
    recipientEmail: string;
    leafHash: string;
    verificationUrl: string;
    state: string;
  };
  claimUrl: string;
  claimToken: string;
  pdfBase64: string;
  batchId: string;
  issuedAt: string;
}

export class CredentialIssuanceService {
  private static tenantRepo = new TenantRepository();
  private static templateRepo = new TemplateRepository();
  private static recipientRepo = new RecipientRepository();

  private static async resolveTenantContext(slug: string, session?: SessionPayload) {
    const tenant = await this.tenantRepo.findBySlug(slug);
    if (!tenant) {
      throw new Error(`Institution with slug "${slug}" not found.`);
    }

    if (session) {
      const membership = session.tenants?.find((t) => t.slug === slug || t.tenantId === tenant.id);
      if (!membership && session.platformRole !== "SUPER_ADMIN") {
        throw new Error("Forbidden: User is not authorized for this institution.");
      }
      return { tenant, role: membership?.role || "READ_ONLY_STAFF" };
    }

    return { tenant, role: "ORG_OWNER" as const };
  }

  private static generateUniqueCertificateNumber(
    tenantPrefix: string,
    existingCerts: Set<string>
  ): string {
    const year = new Date().getFullYear();
    const cleanPrefix = (tenantPrefix || "CREDVAIL").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 10);
    const rand = Math.floor(100000 + Math.random() * 900000);
    let candidate = `${cleanPrefix}-${year}-${rand}`;

    while (existingCerts.has(candidate)) {
      candidate = `${cleanPrefix}-${year}-${Math.floor(100000 + Math.random() * 900000)}`;
    }

    existingCerts.add(candidate);
    return candidate;
  }

  /**
   * Issues an individual credential on demand with full cryptographic evidence.
   */
  static async issueSingleCredential(
    tenantSlug: string,
    input: IssueSingleCredentialInput,
    session?: SessionPayload,
    baseUrl: string = "https://credvail.com"
  ): Promise<SingleIssuanceResult> {
    const { tenant, role } = await this.resolveTenantContext(tenantSlug, session);
    assertTenantPermission(role, "batches:create");

    const validated = issueSingleCredentialInputSchema.parse(input);

    // 1. Resolve and validate template
    const rawTemplate = await this.templateRepo.getTemplateById(tenant.id, validated.templateId);
    if (!rawTemplate) {
      throw new Error(`Certificate template with ID "${validated.templateId}" not found.`);
    }
    if (rawTemplate.isArchived) {
      throw new Error(`Cannot issue credential: Template "${rawTemplate.title}" is archived.`);
    }

    const fallbackPreset =
      TEMPLATE_PRESETS[rawTemplate.category as keyof typeof TEMPLATE_PRESETS] ||
      TEMPLATE_PRESETS.COURSE_COMPLETION;
    const template = {
      ...rawTemplate,
      layoutConfig: rawTemplate.layoutConfig || fallbackPreset.layoutConfig,
    };

    // 2. Resolve or register recipient
    let recipientRecord = await this.recipientRepo.findByEmail(tenant.id, validated.recipient.email);
    if (!recipientRecord) {
      recipientRecord = await this.recipientRepo.createRecipient({
        tenantId: tenant.id,
        fullName: validated.recipient.fullName,
        email: validated.recipient.email,
        externalIdentifier: validated.recipient.externalIdentifier,
      });
    }

    // 3. Resolve active signing key
    let activeKeyInfo: any = null;
    try {
      activeKeyInfo = await KeyManagementService.getActiveSigningKey(tenantSlug, session);
    } catch {
      await KeyRepository.getOrCreateInitialKey(tenant.id, tenant.didUri);
      activeKeyInfo = await KeyManagementService.getActiveSigningKey(tenantSlug, session);
    }

    // 4. Resolve unique certificate number
    const existingCerts = await BatchRepository.getExistingCertificateNumbers(tenant.id);
    const tenantPrefix = tenant.slug.toUpperCase().slice(0, 8);
    let certNumber = validated.certificateNumber;
    if (!certNumber || existingCerts.has(certNumber)) {
      certNumber = this.generateUniqueCertificateNumber(tenantPrefix, existingCerts);
    } else {
      existingCerts.add(certNumber);
    }

    // 5. Create dedicated parent batch record for relational integrity
    const batch = await BatchRepository.createBatch({
      tenantId: tenant.id,
      templateId: template.id,
      templateVersion: template.version || 1,
      templateSnapshot: template,
      title: `Direct Issuance - ${certNumber}`,
      stagedRecipients: [
        {
          fullName: recipientRecord.fullName,
          email: recipientRecord.email,
          externalIdentifier: recipientRecord.externalIdentifier || undefined,
          certificateNumberPreview: certNumber,
          issueDate: validated.claims.issue_date || new Date().toISOString(),
          status: "VALID",
        },
      ],
    });

    // 6. Generate stable Credential URN and Verification URL
    const credentialUuid = randomUUID();
    const credentialId = `urn:uuid:${credentialUuid}`;
    const verificationUrl = `${baseUrl}/verify/${credentialUuid}`;

    // 7. Generate Verification QR code
    const qrResult = await QrService.generateVerificationQr(verificationUrl, template.layoutConfig.qrCode);

    // 8. Build comprehensive claims dictionary
    const claims: Record<string, string> = {
      recipient_name: recipientRecord.fullName,
      recipient_email: recipientRecord.email,
      certificate_number: certNumber,
      course_name: validated.claims.course_name || validated.claims["credential.title"] || template.title,
      organization_name: tenant.name,
      issue_date: validated.claims.issue_date || new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      completion_date: validated.claims.completion_date || validated.claims.issue_date || new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      grade: validated.claims.grade || "First Class with Distinction",
      instructor_name: validated.claims.instructor_name || "Authorized Signatory",
      verification_url: verificationUrl,
      ...validated.claims,
    };

    // 9. Render vector PDF
    const pdfBytes = await PdfGenerator.generateCertificate({
      template,
      claims,
      verificationUrl,
      tenantName: tenant.name,
      tenantLogoUrl: tenant.logoUrl,
      qrPngBuffer: qrResult.pngBuffer,
    });

    // 10. Construct and sign W3C VC 2.0
    const unsignedVc = VcService.buildUnsignedCredential({
      credentialId,
      certificateNumber: certNumber,
      tenantDidUri: tenant.didUri,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      recipientId: recipientRecord.id,
      recipientName: recipientRecord.fullName,
      recipientEmail: recipientRecord.email,
      claims,
      batchId: batch.id,
      merkleIndex: 0,
      bitstringIndex: 0,
      baseUrl,
    });

    const signedVc = VcService.signCredential(
      unsignedVc,
      activeKeyInfo.decryptedPrivateKey,
      activeKeyInfo.key.keyIdentifier
    );

    // 11. Compute leaf hash and Merkle root
    const vcHash = VcService.computeVcHash(signedVc);
    const leafHash = VcService.computeLeafHash(credentialId, certNumber, vcHash);
    const merkleTree = VcService.buildBatchMerkleTree([leafHash]);
    const merkleProof = VcService.generateMerkleProof(merkleTree, 0);
    const fullVc = VcService.attachMerkleProof(signedVc, merkleProof, batch.id);

    // 12. Persist in CredentialRepository
    const credRecord = await CredentialRepository.createCredential({
      credentialId,
      certificateNumber: certNumber,
      tenantId: tenant.id,
      batchId: batch.id,
      recipientId: recipientRecord.id,
      recipientName: recipientRecord.fullName,
      recipientEmail: recipientRecord.email,
      leafHash,
      merkleIndex: 0,
      bitstringIndex: 0,
      claimsData: claims,
      pdfBytes,
      vcPayloadJson: fullVc as any,
      merkleProof,
    });

    // 13. Create single-use claim invitation
    const invite = await ClaimInvitationService.createInvitation({
      credentialId,
      certificateNumber: certNumber,
      recipientEmail: recipientRecord.email,
      tenantId: tenant.id,
    });

    const rawToken = invite.rawToken;
    const claimUrl = `${baseUrl}/claim?cert=${encodeURIComponent(certNumber)}#token=${rawToken}`;

    // Update batch status to GENERATED
    await BatchRepository.updateBatchStatus(tenant.id, batch.id, "GENERATED", { merkleRoot: merkleTree.getRoot() });

    // Record audit log
    await this.tenantRepo.recordAuditLog({
      tenantId: tenant.id,
      userId: session?.sub,
      userEmail: session?.email,
      action: "CREDENTIAL_ISSUED_SINGLE",
      resourceType: "CredentialRecord",
      resourceId: credRecord.id,
      metadata: {
        credentialId,
        certificateNumber: certNumber,
        recipientEmail: recipientRecord.email,
        templateId: template.id,
        templateVersion: template.version || 1,
        batchId: batch.id,
      },
    });

    return {
      credential: {
        id: credRecord.id,
        credentialId,
        certificateNumber: certNumber,
        recipientName: recipientRecord.fullName,
        recipientEmail: recipientRecord.email,
        leafHash,
        verificationUrl,
        state: credRecord.state,
      },
      claimUrl,
      claimToken: rawToken,
      pdfBase64: Buffer.from(pdfBytes).toString("base64"),
      batchId: batch.id,
      issuedAt: new Date().toISOString(),
    };
  }
}
