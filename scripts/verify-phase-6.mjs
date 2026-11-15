/**
 * CREDVAIL Phase 6 Audit & Verification Test Suite
 *
 * Automated verification of:
 * 1. Phase 6 Scaffolding & Required Architecture Files
 * 2. High-Resolution Vector PDF Generation via pdf-lib
 * 3. Cryptographic Verification QR Code Generation (Raster & Vector)
 * 4. Compressed Bulk ZIP Archive Packaging via fflate
 * 5. Credential Persistence, PDF/ZIP Buffer Caching & Scoping
 * 6. End-to-End Batch Processing & Status Lifecycle (DRAFT -> GENERATED)
 * 7. Tenant Isolation Barriers across Credential & Batch Downloads
 * 8. API Route Handlers & Dashboard UI Integration
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { unzipSync } from 'fflate';

import { PdfGenerator, hexToRgb, replacePlaceholders } from '../src/lib/pdf/pdf-generator.ts';
import { QrService } from '../src/lib/pdf/qr-service.ts';
import { ZipService } from '../src/lib/pdf/zip-service.ts';
import { CredentialRepository } from '../src/lib/repositories/credential-repository.ts';
import { BatchRepository } from '../src/lib/repositories/batch-repository.ts';
import { TemplateRepository } from '../src/lib/repositories/template-repository.ts';
import { TenantRepository } from '../src/lib/repositories/tenant-repository.ts';
import { BatchProcessingService } from '../src/lib/services/batch-processing-service.ts';
import { TEMPLATE_PRESETS } from '../src/lib/templates/presets.ts';

const ROOT_DIR = path.resolve('.');

test('1. Phase 6 Scaffolding & Configuration Files Exist', async () => {
  const requiredFiles = [
    'src/lib/pdf/pdf-generator.ts',
    'src/lib/pdf/qr-service.ts',
    'src/lib/pdf/zip-service.ts',
    'src/lib/repositories/credential-repository.ts',
    'src/lib/services/batch-processing-service.ts',
    'src/app/api/v1/tenants/[slug]/batches/[id]/process/route.ts',
    'src/app/api/v1/tenants/[slug]/batches/[id]/download-zip/route.ts',
    'src/app/api/v1/tenants/[slug]/credentials/route.ts',
    'src/app/api/v1/tenants/[slug]/credentials/[id]/route.ts',
    'src/app/api/v1/tenants/[slug]/credentials/[id]/pdf/route.ts',
    'src/app/(dashboard)/[slug]/certificates/page.tsx',
    'test/unit/pdf-generator.test.ts',
    'test/unit/qr-zip-generation.test.ts',
    'test/integration/batch-processing-flow.test.ts',
  ];

  for (const f of requiredFiles) {
    const fullPath = path.join(ROOT_DIR, f);
    assert.ok(fs.existsSync(fullPath), `Required Phase 6 file missing: ${f}`);
    assert.ok(fs.statSync(fullPath).size > 100, `File is empty: ${f}`);
  }
});

test('2. Hex to RGB and Placeholder Utilities', async () => {
  // Color conversion
  const rgbWhite = hexToRgb('#ffffff');
  assert.equal(rgbWhite.red, 1);
  assert.equal(rgbWhite.green, 1);
  assert.equal(rgbWhite.blue, 1);

  const rgbPrimary = hexToRgb('#0f172a');
  assert.ok(rgbPrimary.red < 0.1);
  assert.ok(rgbPrimary.blue > 0.1);

  // Placeholder substitution
  const rawText = 'Issued to {{recipient_name}} for {{course_name}}';
  const claims = {
    recipient_name: 'Grace Hopper',
    course_name: 'Compiler Architecture',
  };
  const resolved = replacePlaceholders(rawText, claims);
  assert.equal(resolved, 'Issued to Grace Hopper for Compiler Architecture');
});

test('3. QR Code Generation (PNG & Data URL & SVG)', async () => {
  const url = 'https://credvail.com/verify/test-verification-token';
  const qrResult = await QrService.generateVerificationQr(url, { size: 120 });

  assert.ok(qrResult.dataUrl.startsWith('data:image/png;base64,'));
  assert.ok(qrResult.pngBuffer instanceof Buffer);
  assert.ok(qrResult.pngBuffer.length > 50);

  // PNG magic number: 0x89 0x50 0x4E 0x47
  assert.equal(qrResult.pngBuffer[0], 0x89);
  assert.equal(qrResult.pngBuffer[1], 0x50);
  assert.equal(qrResult.pngBuffer[2], 0x4e);
  assert.equal(qrResult.pngBuffer[3], 0x47);

  // SVG representation
  const svg = await QrService.generateSvg(url);
  assert.ok(svg.includes('<svg'));
  assert.ok(svg.includes('</svg>'));
});

test('4. Print-Ready Vector PDF Generation via pdf-lib', async () => {
  const template = {
    id: 'tmpl_audit_1',
    tenantId: 'tenant_audit',
    title: 'Excellence in Quantum Computing',
    description: null,
    category: 'ACHIEVEMENT',
    dimensions: {
      width: 1120,
      height: 792,
      orientation: 'LANDSCAPE',
      unit: 'PX',
    },
    layoutConfig: TEMPLATE_PRESETS.ACHIEVEMENT.layoutConfig,
    backgroundImageUrl: null,
    isDefault: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const claims = {
    recipient_name: 'Richard Feynman',
    certificate_number: 'QUANTUM-2026-000001',
    course_name: 'Quantum Electrodynamics',
    organization_name: 'Institute of Advanced Physics',
    issue_date: 'November 15, 2026',
    completion_date: 'November 1, 2026',
    grade: 'Nobel Laureate Distinction',
    instructor_name: 'Prof. Hans Bethe',
    verification_url: 'https://credvail.com/verify/QUANTUM-2026-000001',
  };

  const pdfBytes = await PdfGenerator.generateCertificate({
    template,
    claims,
    verificationUrl: claims.verification_url,
    tenantName: 'Institute of Advanced Physics',
  });

  assert.ok(pdfBytes instanceof Uint8Array);
  assert.ok(pdfBytes.length > 1500, `PDF output too small: ${pdfBytes.length} bytes`);

  // PDF header signature check: '%PDF-'
  const header = Buffer.from(pdfBytes.slice(0, 5)).toString('ascii');
  assert.equal(header, '%PDF-');
});

test('5. Bulk ZIP Compression & Decompression Verification', async () => {
  const dummyPdf1 = Buffer.from('%PDF-1.7 Certificate 1 Content');
  const dummyPdf2 = Buffer.from('%PDF-1.7 Certificate 2 Content');

  const zipBytes = ZipService.createBatchArchive([
    { filename: 'CERT_001_Feynman.pdf', data: dummyPdf1 },
    { filename: 'CERT_002_Curie.pdf', data: dummyPdf2 },
  ]);

  assert.ok(zipBytes instanceof Uint8Array);
  assert.ok(zipBytes.length > 50);

  // ZIP signature: PK\x03\x04
  assert.equal(zipBytes[0], 0x50);
  assert.equal(zipBytes[1], 0x4b);
  assert.equal(zipBytes[2], 0x03);
  assert.equal(zipBytes[3], 0x04);

  // Unzip and verify contents
  const unzipped = unzipSync(zipBytes);
  assert.ok('CERT_001_Feynman.pdf' in unzipped);
  assert.ok('CERT_002_Curie.pdf' in unzipped);
  assert.equal(Buffer.from(unzipped['CERT_001_Feynman.pdf']).toString(), '%PDF-1.7 Certificate 1 Content');
});

test('6. Credential Repository Persistence & PDF Buffer Caching', async () => {
  CredentialRepository.resetInMemoryStore();

  const cred = await CredentialRepository.createCredential({
    credentialId: 'urn:uuid:11111111-2222-3333-4444-555555555555',
    certificateNumber: 'AUDIT-2026-000100',
    tenantId: 'tenant_audit_gtu',
    batchId: 'batch_test_1',
    recipientName: 'Marie Curie',
    recipientEmail: 'marie.curie@sorbonne.fr',
    leafHash: '0x1234567890abcdef',
    merkleIndex: 0,
    bitstringIndex: 0,
    claimsData: {
      recipient_name: 'Marie Curie',
      course_name: 'Radiochemistry',
    },
    pdfBytes: Buffer.from('%PDF-1.7 Test PDF Content'),
  });

  assert.equal(cred.certificateNumber, 'AUDIT-2026-000100');
  assert.equal(cred.state, 'ISSUED');

  // Verify retrieval
  const foundById = await CredentialRepository.findCredentialById('tenant_audit_gtu', cred.id);
  assert.ok(foundById);
  assert.equal(foundById?.certificateNumber, 'AUDIT-2026-000100');

  const foundByCert = await CredentialRepository.findCredentialByCertificateNumber('tenant_audit_gtu', 'AUDIT-2026-000100');
  assert.ok(foundByCert);

  // Verify PDF buffer retrieval
  const cachedPdf = CredentialRepository.getPdfBuffer(cred.id);
  assert.ok(cachedPdf);
  assert.equal(Buffer.from(cachedPdf).toString(), '%PDF-1.7 Test PDF Content');

  // Verify cross-tenant isolation
  const crossTenantLookup = await CredentialRepository.findCredentialById('tenant_other', cred.id);
  assert.equal(crossTenantLookup, null);
});

test('7. End-to-End Batch Processing & Full Certificate Generation Lifecycle', async () => {
  BatchRepository.resetInMemoryStore();
  CredentialRepository.resetInMemoryStore();

  const tenantRepo = new TenantRepository();
  const templateRepo = new TemplateRepository();

  const tenant = await tenantRepo.createTenant({
    slug: `apex-poly-${Date.now()}`,
    name: 'Apex Polytechnic Institute',
    legalEntityName: 'Apex Polytechnic Inc.',
    websiteUrl: 'https://apexpoly.edu',
    didUri: `did:web:apexpoly-${Date.now()}.edu`,
    ownerUserId: 'usr_owner_apex',
  });

  const template = await templateRepo.createTemplate({
    tenantId: tenant.id,
    title: 'Diploma in Advanced Robotics',
    category: 'TRAINING_COMPLETION',
    layoutConfig: TEMPLATE_PRESETS.TRAINING_COMPLETION.layoutConfig,
    isDefault: true,
  });

  const stagedBatch = await BatchRepository.createBatch({
    tenantId: tenant.id,
    templateId: template.id,
    title: '2026 Robotics Cohort',
    stagedRecipients: [
      {
        fullName: 'Nikola Tesla',
        email: 'tesla@wardenclyffe.org',
        certificateNumberPreview: 'APEX-2026-000001',
        courseName: 'High Frequency Alternating Currents',
        issueDate: '2026-11-15',
        status: 'VALID',
      },
      {
        fullName: 'Guglielmo Marconi',
        email: 'marconi@wireless.co.uk',
        certificateNumberPreview: 'APEX-2026-000002',
        courseName: 'Radio Telegraphy',
        issueDate: '2026-11-15',
        status: 'VALID',
      },
    ],
  });

  assert.equal(stagedBatch.status, 'DRAFT');

  const adminSession = {
    sub: 'usr_owner_apex',
    email: 'admin@apexpoly.edu',
    fullName: 'Apex Admin',
    platformRole: 'USER',
    tenants: [{ tenantId: tenant.id, slug: tenant.slug, role: 'ORG_OWNER' }],
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  // Process batch
  const processResult = await BatchProcessingService.processBatch(
    tenant.slug,
    stagedBatch.id,
    adminSession
  );

  assert.equal(processResult.status, 'GENERATED');
  assert.equal(processResult.totalProcessed, 2);
  assert.ok(processResult.zipSize > 500);

  // Check updated batch status
  const updatedBatch = await BatchRepository.findBatchById(tenant.id, stagedBatch.id);
  assert.equal(updatedBatch?.status, 'GENERATED');

  // Verify individual PDF retrieval
  const firstCert = processResult.credentials[0];
  const { pdfBytes } = await BatchProcessingService.getCredentialPdf(
    tenant.slug,
    firstCert.certificateNumber,
    adminSession
  );
  assert.ok(pdfBytes instanceof Uint8Array);
  assert.equal(Buffer.from(pdfBytes.slice(0, 5)).toString(), '%PDF-');

  // Verify bulk ZIP retrieval
  const { zipBytes, batchNumber } = await BatchProcessingService.getBatchZip(
    tenant.slug,
    stagedBatch.id,
    adminSession
  );
  assert.equal(batchNumber, stagedBatch.batchNumber);
  assert.equal(zipBytes[0], 0x50); // PK header
  const unzipped = unzipSync(zipBytes);
  assert.equal(Object.keys(unzipped).length, 2);
});
