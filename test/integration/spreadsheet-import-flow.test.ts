import { describe, it, expect, beforeEach } from 'vitest';
import { BatchService } from '@/lib/services/batch-service';
import { BatchRepository } from '@/lib/repositories/batch-repository';
import { TemplateService } from '@/lib/services/template-service';
import { inMemoryTemplateStore } from '@/lib/repositories/template-repository';
import { inMemoryTenantStore } from '@/lib/repositories/tenant-repository';
import { AuthService } from '@/lib/services/auth-service';
import { TenantService } from '@/lib/services/tenant-service';
import { verifySessionToken, SessionPayload } from '@/lib/auth/session';

describe('Phase 5 End-to-End Spreadsheet Import & Recipient Validation Flow', () => {
  const authService = new AuthService();
  const tenantService = new TenantService();
  const templateService = new TemplateService();

  let aliceSession: SessionPayload;
  let bobSession: SessionPayload;
  let seededTemplateId: string;
  let apexTenantId: string;

  beforeEach(async () => {
    BatchRepository.resetInMemoryStore();
    inMemoryTemplateStore.clear();
    inMemoryTenantStore.clear();

    // 1. Setup Tenant A: Apex Institute with Alice as ORG_OWNER
    const aliceReg = await authService.register({
      email: 'alice@apex-inst.edu',
      password: 'ApexDeanPassword!2026',
      fullName: 'Dean Alice Turing',
    });

    const apexTenant = await tenantService.createOrganization(
      {
        name: 'Apex Institute',
        legalEntityName: 'Apex Institute of Technology',
        websiteUrl: 'https://apex.edu',
        slug: 'apex-inst',
      },
      aliceReg.user.id
    );
    apexTenantId = apexTenant.id;

    const aliceLogin = await authService.login({
      email: 'alice@apex-inst.edu',
      password: 'ApexDeanPassword!2026',
      targetTenantId: apexTenant.id,
    });
    aliceSession = verifySessionToken(aliceLogin.token)!;

    // 2. Setup Tenant B: Other Institute with Bob as ORG_OWNER
    const bobReg = await authService.register({
      email: 'bob@other-inst.edu',
      password: 'BobCompetitorPassword!2026',
      fullName: 'Dean Bob Lovelace',
    });

    const otherTenant = await tenantService.createOrganization(
      {
        name: 'Other Institute',
        legalEntityName: 'Other Educational Foundation',
        websiteUrl: 'https://other.edu',
        slug: 'other-inst',
      },
      bobReg.user.id
    );

    const bobLogin = await authService.login({
      email: 'bob@other-inst.edu',
      password: 'BobCompetitorPassword!2026',
      targetTenantId: otherTenant.id,
    });
    bobSession = verifySessionToken(bobLogin.token)!;

    // 3. Seed templates for Apex Institute
    const templates = await templateService.listTemplates('apex-inst', aliceSession);
    expect(templates.length).toBeGreaterThan(0);
    seededTemplateId = templates[0].id;
  });

  it('completes the full ingestion flow: upload, parse, column mapping, validation diagnostics, duplicate detection, formula sanitization, and batch staging', async () => {
    // 1. Prepare raw CSV buffer containing a mix of valid records, invalid emails, duplicates, and formula injections
    const rawCsv = `Student Name,Email Address,Course Name,Final Grade,Student ID
Grace Hopper,grace@navy.mil,Compilers & Systems,A+,GH-1906
Alan Turing,alan@bletchley.uk,Cryptography 101,A,AT-1912
=cmd|'/c calc'!A1,hacker@evil.com,Exploit Dev,+99,EX-0001
Invalid User,not-an-email,Web Development,Pass,IU-0002
Missing Email Person,,Database Design,B,ME-0003
Grace Hopper,grace@navy.mil,Duplicate Course,A,GH-DUP`;

    const fileBuffer = Buffer.from(rawCsv, 'utf8');

    // 2. Upload and Parse Spreadsheet
    const parseResult = await BatchService.parseUploadedSpreadsheet(
      'apex-inst',
      fileBuffer,
      'graduating_cohort_2026.csv',
      aliceSession
    );

    expect(parseResult.detectedType).toBe('CSV');
    expect(parseResult.rowCount).toBe(6);
    expect(parseResult.headers).toEqual([
      'Student Name',
      'Email Address',
      'Course Name',
      'Final Grade',
      'Student ID',
    ]);

    // Check intelligent column mapping auto-detection
    expect(parseResult.suggestedMapping.recipient_name).toBe('Student Name');
    expect(parseResult.suggestedMapping.recipient_email).toBe('Email Address');
    expect(parseResult.suggestedMapping.course_name).toBe('Course Name');
    expect(parseResult.suggestedMapping.grade).toBe('Final Grade');
    expect(parseResult.suggestedMapping.external_id).toBe('Student ID');

    // Check SEC-07 Formula Injection Detection
    expect(parseResult.formulaInjections.length).toBeGreaterThanOrEqual(1);
    expect(parseResult.formulaInjections.some((alert) => alert.originalValue.startsWith('=cmd'))).toBe(true);

    // 3. Validate Spreadsheet against active template
    const validationReport = await BatchService.validateSpreadsheetData(
      'apex-inst',
      {
        templateId: seededTemplateId,
        headers: parseResult.headers,
        rows: parseResult.rawRows,
        columnMapping: {
          recipient_name: parseResult.suggestedMapping.recipient_name,
          recipient_email: parseResult.suggestedMapping.recipient_email,
          course_name: parseResult.suggestedMapping.course_name,
          grade: parseResult.suggestedMapping.grade,
          external_id: parseResult.suggestedMapping.external_id,
        },
      },
      aliceSession
    );

    expect(validationReport.totalRows).toBe(6);
    expect(validationReport.validCount).toBe(3); // Grace, Alan, and sanitized hacker
    expect(validationReport.invalidCount).toBe(2); // Bad email and missing email
    expect(validationReport.duplicateCount).toBe(1); // Grace Hopper duplicate
    expect(validationReport.summary.canProceed).toBe(true);

    // Check collision-safe certificate numbers were generated for valid rows
    const validRows = validationReport.rows.filter((r) => r.status === 'VALID');
    expect(validRows.length).toBe(3);
    for (const row of validRows) {
      expect(row.certificateNumberPreview).toMatch(/^APEX-INS-\d{4}-\d{6}$/);
    }

    // Check formula injection was neutralized
    const sanitizedHacker = validationReport.rows.find((r) => r.recipientEmail === 'hacker@evil.com');
    expect(sanitizedHacker).toBeDefined();
    expect(sanitizedHacker?.recipientName).toBe("'=cmd|'/c calc'!A1");
    expect(sanitizedHacker?.grade).toBe("'+99");
    expect(sanitizedHacker?.isFormulaSanitized).toBe(true);

    // 4. Stage Valid Batch
    const stagedBatch = await BatchService.stageBatch(
      'apex-inst',
      {
        templateId: seededTemplateId,
        title: 'Spring 2026 Engineering Honors',
        stagedRecipients: validationReport.rows.map((r) => ({
          fullName: r.recipientName,
          email: r.recipientEmail,
          externalIdentifier: r.externalIdentifier,
          certificateNumberPreview: r.certificateNumberPreview,
          courseName: r.courseName,
          issueDate: r.issueDate,
          completionDate: r.completionDate,
          grade: r.grade,
          instructorName: r.instructorName,
          customData: r.customData,
          status: r.status,
          errors: r.errors,
        })),
      },
      aliceSession
    );

    expect(stagedBatch.id).toBeDefined();
    expect(stagedBatch.status).toBe('DRAFT');
    expect(stagedBatch.batchNumber).toMatch(/^BATCH-\d{4}-\d{6}$/);
    expect(stagedBatch.validCount).toBe(3);
    expect(stagedBatch.invalidCount).toBe(3); // 2 invalid + 1 duplicate

    // 5. List batches for Apex
    const apexBatches = await BatchService.listBatches('apex-inst', aliceSession);
    expect(apexBatches.length).toBe(1);
    expect(apexBatches[0].id).toBe(stagedBatch.id);

    // 6. Strict Tenant Isolation Barrier: Bob from other-inst cannot see or access Apex's batch
    await expect(
      BatchService.getBatchById('apex-inst', stagedBatch.id, bobSession)
    ).rejects.toThrow(/Forbidden/);

    const bobBatches = await BatchService.listBatches('other-inst', bobSession);
    expect(bobBatches.length).toBe(0);

    // 7. Verify Audit Trail entry was recorded
    const auditLogs = await inMemoryTenantStore.listAuditLogs(apexTenantId, 10);
    expect(auditLogs.some((l) => l.action === 'BATCH_STAGED')).toBe(true);
  });
});
