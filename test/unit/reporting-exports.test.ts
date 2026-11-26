import { describe, it, expect, beforeEach } from "vitest";
import { ReportingService } from "@/lib/services/reporting-service";
import { SelectiveDisclosureEngine } from "@/lib/crypto/selective-disclosure";
import { AuthService } from "@/lib/services/auth-service";
import { TenantService } from "@/lib/services/tenant-service";
import { CredentialRepository } from "@/lib/repositories/credential-repository";
import { EmailVerificationRepository } from "@/lib/repositories/email-verification-repository";
import { inMemoryUserStore } from "@/lib/repositories/user-repository";
import { inMemoryTenantStore } from "@/lib/repositories/tenant-repository";
import { verifySessionToken } from "@/lib/auth/session";

describe("Phase 13 & Phase 14: Analytics Report Exports & Selective Disclosure Compliance", () => {
  const authService = new AuthService();
  const tenantService = new TenantService();

  beforeEach(() => {
    inMemoryUserStore.clear();
    inMemoryTenantStore.clear();
    CredentialRepository.resetInMemoryStore();
  });

  it("13.x generates formula-safe CSV, JSON, and PDF reports with date/action filters and records audit log", async () => {
    const owner = await authService.register({
      email: "audit@report-uni.edu",
      password: "AuditPassword!123",
      fullName: "Report Admin",
    });
    await EmailVerificationRepository.consumeAndVerifyUser(owner.verificationToken);

    const tenant = await tenantService.createOrganization(
      {
        name: "Report University",
        legalEntityName: "Report University",
        websiteUrl: "https://report-uni.edu",
        slug: "report-uni",
      },
      owner.user.id
    );

    const loginRes = await authService.login({
      email: "audit@report-uni.edu",
      password: "AuditPassword!123",
      targetTenantId: tenant.id,
    });
    const session = verifySessionToken(loginRes.token)!;

    await CredentialRepository.createCredential({
      credentialId: "urn:uuid:rep-1",
      certificateNumber: "REP-2026-001",
      tenantId: tenant.id,
      batchId: "batch_rep_1",
      recipientName: "=CMD('whoami')",
      recipientEmail: "holder1@report-uni.edu",
      leafHash: "0x" + "11".repeat(32),
      merkleIndex: 0,
      bitstringIndex: 0,
      claimsData: {},
      vcPayloadJson: {} as any,
    });

    const csvReport = await ReportingService.generateReport({
      tenantSlug: "report-uni",
      session,
      format: "csv",
      resourceType: "credentials",
    });
    expect(csvReport.rowCount).toBe(1);
    expect(typeof csvReport.body).toBe("string");
    // Formula injection must be neutralized with leading single quote
    expect(csvReport.body as string).toContain("\"'=CMD('whoami')\"");

    const jsonReport = await ReportingService.generateReport({
      tenantSlug: "report-uni",
      session,
      format: "json",
      resourceType: "audit_logs",
      actionFilter: "REPORT_GENERATED",
    });
    const parsed = JSON.parse(jsonReport.body as string);
    expect(parsed.totalRows).toBeGreaterThanOrEqual(1);
    expect(parsed.rows[0].action).toBe("REPORT_GENERATED");

    const pdfReport = await ReportingService.generateReport({
      tenantSlug: "report-uni",
      session,
      format: "pdf",
      resourceType: "credentials",
    });
    expect(pdfReport.body).toBeInstanceOf(Uint8Array);
    expect((pdfReport.body as Uint8Array).slice(0, 4)).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46])); // %PDF
  });

  it("14.x preserves fail-closed W3C ecdsa-sd-2023 selective disclosure compliance status", () => {
    const status = SelectiveDisclosureEngine.getComplianceStatus();
    expect(status.standard).toBe("W3C ecdsa-sd-2023");
    expect(status.failClosedActive).toBe(true);
    expect(status.supported).toBe(false);
  });
});
