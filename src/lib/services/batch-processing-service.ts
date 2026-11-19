/**
 * CREDVAIL Batch Processing & Certificate Issuance Engine
 * 
 * Orchestrates atomic generation of:
 * 1. Unique collision-safe certificate numbers
 * 2. Stable W3C Credential identifiers (URNs)
 * 3. Canonical cryptographic verification URLs & QR codes
 * 4. High-resolution print-ready vector PDF certificates (via pdf-lib)
 * 5. Deterministic claim leaf hashes for Merkle tree anchoring
 * 6. Compressed bulk ZIP archives (via fflate)
 * 7. Scoped persistence in CredentialRepository and IssuanceBatch status transition
 */

import { randomUUID } from "crypto";
import { BatchRepository, type IssuanceBatchRecord, type StagedRecipientData } from "../repositories/batch-repository.ts";
import { CredentialRepository, type StoredCredentialRecord } from "../repositories/credential-repository.ts";
import { TemplateRepository } from "../repositories/template-repository.ts";
import { TenantRepository } from "../repositories/tenant-repository.ts";
import { PdfGenerator } from "../pdf/pdf-generator.ts";
import { QrService } from "../pdf/qr-service.ts";
import { ZipService, type ZipFileInput } from "../pdf/zip-service.ts";
import { computeKeccak256 } from "../crypto/canonical.ts";
import { VcService, type W3CVerifiableCredential } from "../crypto/vc-service.ts";
import { KeyManagementService } from "./key-management-service.ts";
import { KeyRepository } from "../repositories/key-repository.ts";
import { assertTenantPermission } from "../auth/rbac.ts";
import type { SessionPayload } from "../auth/session.ts";
import { TEMPLATE_PRESETS } from "../templates/presets.ts";
import type { MerkleInclusionProof } from "../../types/index.ts";
import { ClaimInvitationService } from "./claim-invitation-service.ts";

export interface BatchClaimLink {
  certificateNumber: string;
  recipientName: string;
  recipientEmail: string;
  claimUrl: string;
  claimToken: string;
}

export interface BatchProcessingResult {
  batchId: string;
  batchNumber: string;
  status: string;
  totalProcessed: number;
  merkleRoot?: string;
  credentials: Array<{
    id: string;
    credentialId: string;
    certificateNumber: string;
    recipientName: string;
    recipientEmail: string;
    leafHash: string;
    merkleProof?: MerkleInclusionProof;
    verificationUrl: string;
    claimUrl?: string;
    claimToken?: string;
  }>;
  claimLinks?: BatchClaimLink[];
  zipSize: number;
  processedAt: string;
}

export class BatchProcessingService {
  private static tenantRepo = new TenantRepository();
  private static templateRepo = new TemplateRepository();
  private static batchClaimExports = new Map<
    string,
    {
      tenantId: string;
      batchId: string;
      batchNumber: string;
      claimLinks: BatchClaimLink[];
      exportCsv: string;
      createdAt: number;
    }
  >();

  /**
   * Resets in-memory export cache (for test hermeticity).
   */
  static resetExportStore(): void {
    this.batchClaimExports.clear();
  }

  /**
   * Clears claim export for a batch (e.g. upon failure or expiration).
   */
  static clearBatchClaimExport(batchId: string): void {
    this.batchClaimExports.delete(batchId);
  }

  /**
   * Retrieves authorized batch claim links and CSV export for an authorized tenant member.
   *
   * DELIVERY ARCHITECTURE (Option A Primary, Transient Secondary):
   * - Authoritative Delivery Channel: The authenticated `POST .../batches/:id/process` response.
   *   The issuer UI directly consumes and downloads the claim links immediately upon generation.
   * - Secondary Transient Cache: This endpoint reads from a short-lived process-local cache
   *   with an explicit 15-minute TTL. It is single-process only.
   */
  static async getBatchClaimExport(
    tenantSlug: string,
    batchId: string,
    session?: SessionPayload
  ): Promise<{
    batchId: string;
    batchNumber: string;
    claimLinks: BatchClaimLink[];
    exportCsv: string;
    createdAt: string;
  }> {
    const { tenant, role } = await this.resolveTenantContext(tenantSlug, session);
    assertTenantPermission(role, "batches:create");

    const batch = await BatchRepository.findBatchById(tenant.id, batchId);
    if (!batch) {
      throw new Error(`Batch with ID "${batchId}" not found for this institution.`);
    }

    const exportData = this.batchClaimExports.get(batchId);
    if (!exportData || exportData.tenantId !== tenant.id) {
      throw new Error(`Claim delivery export for batch "${batch.batchNumber}" is not available or has expired. Please use the authoritative claim links returned in the batch processing response.`);
    }

    // Explicit 15-minute retention policy for process-local export cache
    const CLAIM_EXPORT_TTL_MS = 15 * 60 * 1000;
    if (Date.now() - exportData.createdAt > CLAIM_EXPORT_TTL_MS) {
      this.batchClaimExports.delete(batchId);
      throw new Error(`Claim delivery export for batch "${batch.batchNumber}" has expired (15-minute retention limit exceeded).`);
    }

    return {
      batchId: exportData.batchId,
      batchNumber: exportData.batchNumber,
      claimLinks: exportData.claimLinks,
      exportCsv: exportData.exportCsv,
      createdAt: new Date(exportData.createdAt).toISOString(),
    };
  }

  /**
   * Resolves tenant context and verifies authorization.
   */
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

  /**
   * Generates a collision-safe certificate number: <TENANT_PREFIX>-<YEAR>-<SEQ>
   */
  private static generateUniqueCertificateNumber(
    tenantPrefix: string,
    existingCerts: Set<string>,
    sequenceNumber: number
  ): string {
    const year = new Date().getFullYear();
    const cleanPrefix = (tenantPrefix || "CREDVAIL").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 10);
    
    let candidate = `${cleanPrefix}-${year}-${String(sequenceNumber).padStart(6, "0")}`;
    let counter = sequenceNumber;

    while (existingCerts.has(candidate)) {
      counter++;
      candidate = `${cleanPrefix}-${year}-${String(counter).padStart(6, "0")}`;
    }

    existingCerts.add(candidate);
    return candidate;
  }

  /**
   * Processes a staged batch: renders PDFs, generates QRs, records credentials,
   * compiles ZIP archive, and transitions batch status to GENERATED.
   */
  static async processBatch(
    tenantSlug: string,
    batchId: string,
    session?: SessionPayload,
    baseUrl: string = "https://credvail.com"
  ): Promise<BatchProcessingResult> {
    const { tenant, role } = await this.resolveTenantContext(tenantSlug, session);
    assertTenantPermission(role, "batches:create");

    // 1. Fetch batch record
    const batch = await BatchRepository.findBatchById(tenant.id, batchId);
    if (!batch) {
      throw new Error(`Batch with ID "${batchId}" not found for this institution.`);
    }

    if (batch.status === "GENERATED" || batch.status === "ANCHORED") {
      throw new Error(`Batch "${batch.batchNumber}" has already been processed (status: ${batch.status}).`);
    }

    // 2. Fetch associated certificate template
    const rawTemplate = await this.templateRepo.getTemplateById(tenant.id, batch.templateId);
    if (!rawTemplate) {
      throw new Error(`Certificate template with ID "${batch.templateId}" not found.`);
    }

    const fallbackPreset = TEMPLATE_PRESETS[rawTemplate.category as keyof typeof TEMPLATE_PRESETS] || TEMPLATE_PRESETS.COURSE_COMPLETION;
    const template = {
      ...rawTemplate,
      layoutConfig: rawTemplate.layoutConfig || fallbackPreset.layoutConfig,
    };

    // 3. Filter valid staged recipients
    const validRecipients = batch.stagedRecipients.filter((r) => r.status === "VALID");
    if (validRecipients.length === 0) {
      throw new Error("Cannot process batch: No valid recipient records found in this batch.");
    }

    // Update status to PROCESSING
    await BatchRepository.updateBatchStatus(tenant.id, batchId, "PROCESSING");

    // Retrieve active signing key epoch for this institution
    let activeKeyInfo: any = null;
    try {
      activeKeyInfo = await KeyManagementService.getActiveSigningKey(tenantSlug, session);
    } catch {
      await KeyRepository.getOrCreateInitialKey(tenant.id, tenant.didUri);
      activeKeyInfo = await KeyManagementService.getActiveSigningKey(tenantSlug, session);
    }

    const existingCerts = await BatchRepository.getExistingCertificateNumbers(tenant.id);
    const tenantPrefix = tenant.slug.toUpperCase().slice(0, 8);

    const generatedCredentials: BatchProcessingResult["credentials"] = [];
    const zipFiles: ZipFileInput[] = [];
    const claimLinks: BatchClaimLink[] = [];

    interface StagedItem {
      recipient: StagedRecipientData;
      certNumber: string;
      credentialId: string;
      verificationUrl: string;
      claims: Record<string, string>;
      pdfBytes: Uint8Array;
      signedVc: W3CVerifiableCredential;
      leafHash: `0x${string}`;
    }

    try {
      const stagedItems: StagedItem[] = [];
      let seqIndex = 1;

      // Stage 1: Build claims, render PDFs, generate QRs, and sign W3C VCs
      for (let i = 0; i < validRecipients.length; i++) {
        const recipient = validRecipients[i];

        // A. Resolve or generate unique collision-safe certificate number
        let certNumber = recipient.certificateNumberPreview;
        if (!certNumber || existingCerts.has(certNumber)) {
          certNumber = this.generateUniqueCertificateNumber(tenantPrefix, existingCerts, seqIndex);
        } else {
          existingCerts.add(certNumber);
        }
        seqIndex++;

        // B. Generate stable Credential URN and Verification URL
        const credentialUuid = randomUUID();
        const credentialId = `urn:uuid:${credentialUuid}`;
        const verificationUrl = `${baseUrl}/verify/${credentialUuid}`;

        // C. Generate Verification QR code
        const qrResult = await QrService.generateVerificationQr(verificationUrl, template.layoutConfig.qrCode);

        // D. Build comprehensive claims dictionary for template placeholders
        const claims: Record<string, string> = {
          recipient_name: recipient.fullName,
          recipient_email: recipient.email,
          certificate_number: certNumber,
          course_name: recipient.courseName || template.title,
          organization_name: tenant.name,
          issue_date: recipient.issueDate || new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
          completion_date: recipient.completionDate || recipient.issueDate,
          grade: recipient.grade || "Completed",
          instructor_name: recipient.instructorName || "Authorized Signatory",
          verification_url: verificationUrl,
          ...(recipient.customData || {}),
        };

        // E. Render high-resolution print-ready PDF
        const pdfBytes = await PdfGenerator.generateCertificate({
          template,
          claims,
          verificationUrl,
          tenantName: tenant.name,
          tenantLogoUrl: tenant.logoUrl,
          qrPngBuffer: qrResult.pngBuffer,
        });

        // F. Construct unsigned W3C Verifiable Credential 2.0
        const unsignedVc = VcService.buildUnsignedCredential({
          credentialId,
          certificateNumber: certNumber,
          tenantDidUri: tenant.didUri,
          tenantName: tenant.name,
          tenantSlug: tenant.slug,
          recipientId: recipient.id || randomUUID(),
          recipientName: recipient.fullName,
          recipientEmail: recipient.email,
          claims,
          batchId: batch.id,
          merkleIndex: i,
          bitstringIndex: i,
          baseUrl,
        });

        // G. Sign W3C VC using issuer's active NIST P-256 private key
        const signedVc = VcService.signCredential(
          unsignedVc,
          activeKeyInfo.decryptedPrivateKey,
          activeKeyInfo.key.keyIdentifier
        );

        // H. Compute VC hash and Merkle leaf hash (Keccak-256)
        const vcHash = VcService.computeVcHash(signedVc);
        const leafHash = VcService.computeLeafHash(credentialId, certNumber, vcHash);

        stagedItems.push({
          recipient,
          certNumber,
          credentialId,
          verificationUrl,
          claims,
          pdfBytes,
          signedVc,
          leafHash,
        });
      }

      // Stage 2: Construct Merkle Tree over all batch leaf hashes
      const leaves = stagedItems.map((item) => item.leafHash);
      const merkleTree = VcService.buildBatchMerkleTree(leaves);
      const merkleRoot = merkleTree.getRoot();

      // Stage 3: Generate Merkle Proofs, attach to VCs, and persist
      for (let i = 0; i < stagedItems.length; i++) {
        const item = stagedItems[i];
        const merkleProof = VcService.generateMerkleProof(merkleTree, i);
        const fullVc = VcService.attachMerkleProof(item.signedVc, merkleProof, batch.id);

        const credRecord = await CredentialRepository.createCredential({
          credentialId: item.credentialId,
          certificateNumber: item.certNumber,
          tenantId: tenant.id,
          batchId: batch.id,
          recipientName: item.recipient.fullName,
          recipientEmail: item.recipient.email,
          leafHash: item.leafHash,
          merkleIndex: i,
          bitstringIndex: i,
          claimsData: item.claims,
          pdfBytes: item.pdfBytes,
          vcPayloadJson: fullVc as any,
          merkleProof,
        });

        // Automatically create single-use claim invitation for recipient
        const invite = await ClaimInvitationService.createInvitation({
          credentialId: item.credentialId,
          certificateNumber: item.certNumber,
          recipientEmail: item.recipient.email,
          tenantId: tenant.id,
        });

        const rawToken = invite.rawToken;
        // Secure URL fragment: token resides strictly in URL hash (#token=...) to prevent
        // leakage in web server access logs, reverse proxies, and HTTP referrers.
        const claimUrl = `${baseUrl}/claim?cert=${encodeURIComponent(item.certNumber)}#token=${rawToken}`;

        claimLinks.push({
          certificateNumber: item.certNumber,
          recipientName: item.recipient.fullName,
          recipientEmail: item.recipient.email,
          claimUrl,
          claimToken: rawToken,
        });

        generatedCredentials.push({
          id: credRecord.id,
          credentialId: item.credentialId,
          certificateNumber: item.certNumber,
          recipientName: item.recipient.fullName,
          recipientEmail: item.recipient.email,
          leafHash: item.leafHash,
          merkleProof,
          verificationUrl: item.verificationUrl,
          claimUrl,
          claimToken: rawToken,
        });

        // Prepare file for ZIP archive
        const safeName = item.recipient.fullName.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30);
        zipFiles.push({
          filename: `${item.certNumber}_${safeName}.pdf`,
          data: item.pdfBytes,
        });
      }

      // 4. Create and store compressed ZIP archive
      const zipArchiveBytes = ZipService.createBatchArchive(zipFiles);
      CredentialRepository.storeBatchZip(batch.id, zipArchiveBytes);

      // 5. Store temporary in-memory claim delivery export for authorized tenant members
      const csvHeader = "Recipient Name,Recipient Email,Certificate Number,Claim URL\n";
      const csvRows = claimLinks
        .map(
          (c) =>
            `"${c.recipientName.replace(/"/g, '""')}","${c.recipientEmail.replace(/"/g, '""')}","${c.certificateNumber}","${c.claimUrl}"`
        )
        .join("\n");
      const exportCsv = `${csvHeader}${csvRows}`;

      this.batchClaimExports.set(batch.id, {
        tenantId: tenant.id,
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        claimLinks,
        exportCsv,
        createdAt: Date.now(),
      });

      // 6. Update Batch Status to GENERATED with Merkle Root
      await BatchRepository.updateBatchStatus(tenant.id, batch.id, "GENERATED", {
        merkleRoot,
      });

      // 7. Record Audit Log (Tokens are strictly excluded from audit logs)
      await this.tenantRepo.recordAuditLog({
        tenantId: tenant.id,
        userId: session?.sub,
        userEmail: session?.email,
        action: "BATCH_PROCESSED",
        resourceType: "IssuanceBatch",
        resourceId: batch.id,
        metadata: {
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          totalGenerated: generatedCredentials.length,
          merkleRoot,
          zipSizeBytes: zipArchiveBytes.length,
          templateId: template.id,
          keyEpoch: activeKeyInfo.key.keyEpoch,
        },
      });

      return {
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        status: "GENERATED",
        totalProcessed: generatedCredentials.length,
        merkleRoot,
        credentials: generatedCredentials,
        claimLinks,
        zipSize: zipArchiveBytes.length,
        processedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      this.clearBatchClaimExport(batch.id);
      await BatchRepository.updateBatchStatus(tenant.id, batch.id, "FAILED", {
        errorSummary: err.message || "Unknown error during batch processing",
      });
      throw err;
    }
  }

  /**
   * Retrieves individual PDF binary buffer for a credential.
   */
  static async getCredentialPdf(
    tenantSlug: string,
    credentialIdOrCertNumber: string,
    session?: SessionPayload
  ): Promise<{ pdfBytes: Uint8Array; certificateNumber: string }> {
    const { tenant } = await this.resolveTenantContext(tenantSlug, session);

    // Look up credential
    let cred = await CredentialRepository.findCredentialById(tenant.id, credentialIdOrCertNumber);
    if (!cred) {
      cred = await CredentialRepository.findCredentialByCertificateNumber(tenant.id, credentialIdOrCertNumber);
    }

    if (!cred) {
      throw new Error(`Credential "${credentialIdOrCertNumber}" not found for this institution.`);
    }

    const pdfBytes = CredentialRepository.getPdfBuffer(cred.id) ||
      CredentialRepository.getPdfBuffer(cred.certificateNumber) ||
      CredentialRepository.getPdfBuffer(cred.credentialId);

    if (!pdfBytes) {
      // Regenerate on the fly if needed
      const batch = await BatchRepository.findBatchById(tenant.id, cred.batchId);
      const template = batch ? await this.templateRepo.getTemplateById(tenant.id, batch.templateId) : null;
      if (template) {
        const fallbackPreset = TEMPLATE_PRESETS[template.category as keyof typeof TEMPLATE_PRESETS] || TEMPLATE_PRESETS.COURSE_COMPLETION;
        const resolvedTemplate = {
          ...template,
          layoutConfig: template.layoutConfig || fallbackPreset.layoutConfig,
        };
        const verificationUrl = `https://credvail.com/verify/${cred.credentialId.replace("urn:uuid:", "")}`;
        const newPdf = await PdfGenerator.generateCertificate({
          template: resolvedTemplate,
          claims: cred.claimsData,
          verificationUrl,
          tenantName: tenant.name,
          tenantLogoUrl: tenant.logoUrl,
        });
        CredentialRepository.storePdfBuffer(cred.id, newPdf);
        return { pdfBytes: newPdf, certificateNumber: cred.certificateNumber };
      }
      throw new Error(`PDF binary for certificate "${cred.certificateNumber}" is unavailable.`);
    }

    return { pdfBytes, certificateNumber: cred.certificateNumber };
  }

  /**
   * Retrieves bulk ZIP archive for a generated batch.
   */
  static async getBatchZip(
    tenantSlug: string,
    batchId: string,
    session?: SessionPayload
  ): Promise<{ zipBytes: Uint8Array; batchNumber: string }> {
    const { tenant } = await this.resolveTenantContext(tenantSlug, session);

    const batch = await BatchRepository.findBatchById(tenant.id, batchId);
    if (!batch) {
      throw new Error(`Batch "${batchId}" not found for this institution.`);
    }

    if (batch.status !== "GENERATED" && batch.status !== "ANCHORED") {
      throw new Error(`Batch "${batch.batchNumber}" has not been generated yet (status: ${batch.status}).`);
    }

    let zipBytes = CredentialRepository.getBatchZip(batch.id);

    if (!zipBytes) {
      // Re-package from stored credentials if needed
      const { items } = await CredentialRepository.listCredentials(tenant.id, { batchId: batch.id, limit: 1000 });
      const files: ZipFileInput[] = [];
      for (const item of items) {
        const pdf = CredentialRepository.getPdfBuffer(item.id) || CredentialRepository.getPdfBuffer(item.certificateNumber);
        if (pdf) {
          const safeName = item.recipientName.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30);
          files.push({
            filename: `${item.certificateNumber}_${safeName}.pdf`,
            data: pdf,
          });
        }
      }
      if (files.length > 0) {
        zipBytes = ZipService.createBatchArchive(files);
        CredentialRepository.storeBatchZip(batch.id, zipBytes);
      }
    }

    if (!zipBytes) {
      throw new Error(`ZIP archive for batch "${batch.batchNumber}" is unavailable.`);
    }

    return { zipBytes, batchNumber: batch.batchNumber };
  }
}
