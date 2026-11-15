/**
 * CREDVAIL Phase 5 Audit & Spreadsheet Ingestion Verification Test Suite
 *
 * Verifies:
 * 1. Phase 5 Scaffolding & Required Module Files
 * 2. RFC 4180 Parsing & SEC-07 Formula Injection Defense
 * 3. Intelligent Header Auto-Detection & Column Mapping
 * 4. Recipient Schema Hygiene & Duplicate Detection
 * 5. Collision-Safe Certificate Number Generation Preview
 * 6. Batch API Route Handlers & Repository/Service Multi-Tenant Signatures
 * 7. UI Ingestion Wizard & Batch History Components
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  parseCSV,
  hasFormulaInjection,
  sanitizeFormulaValue,
  stripBOM,
  detectDelimiter,
} from '../src/lib/csv/spreadsheet-parser.ts';
import {
  suggestColumnMappings,
  isValidEmail,
  normalizeDate,
  generateCertificateNumber,
  validateSpreadsheetBatch,
} from '../src/lib/services/batch-validation-service.ts';

const ROOT_DIR = path.resolve('.');

test('1. Phase 5 Scaffolding & Configuration Files Exist', async () => {
  const requiredFiles = [
    'src/lib/csv/spreadsheet-parser.ts',
    'src/lib/services/batch-validation-service.ts',
    'src/lib/repositories/batch-repository.ts',
    'src/lib/services/batch-service.ts',
    'src/app/api/v1/tenants/[slug]/batches/route.ts',
    'src/app/api/v1/tenants/[slug]/batches/upload/route.ts',
    'src/app/api/v1/tenants/[slug]/batches/validate/route.ts',
    'src/app/api/v1/tenants/[slug]/batches/stage/route.ts',
    'src/app/api/v1/tenants/[slug]/batches/[id]/route.ts',
    'src/app/(dashboard)/[slug]/batches/page.tsx',
    'test/unit/spreadsheet-parser.test.ts',
    'test/unit/batch-validation.test.ts',
    'test/integration/spreadsheet-import-flow.test.ts',
  ];

  for (const f of requiredFiles) {
    const fullPath = path.join(ROOT_DIR, f);
    assert.ok(fs.existsSync(fullPath), `Required Phase 5 file missing: ${f}`);
    assert.ok(fs.statSync(fullPath).size > 100, `File is empty: ${f}`);
  }
});

test('2. RFC 4180 Parsing & SEC-07 Formula Injection Defense', async () => {
  // BOM handling
  const rawBom = '\uFEFFName,Email\nAlice,alice@example.com';
  assert.equal(stripBOM(rawBom), 'Name,Email\nAlice,alice@example.com');

  // Delimiter detection
  assert.equal(detectDelimiter('A,B,C\n1,2,3'), ',');
  assert.equal(detectDelimiter('A\tB\tC\n1\t2\t3'), '\t');
  assert.equal(detectDelimiter('A;B;C\n1;2;3'), ';');

  // SEC-07 Formula Injection vector detection
  assert.ok(hasFormulaInjection("=cmd|'/c calc'!A1"), 'Must detect = formula prefix');
  assert.ok(hasFormulaInjection('+12345'), 'Must detect + prefix');
  assert.ok(hasFormulaInjection('-2+3'), 'Must detect - prefix');
  assert.ok(hasFormulaInjection('@SUM(A1:B10)'), 'Must detect @ prefix');
  assert.ok(hasFormulaInjection('\tmalicious'), 'Must detect tab prefix');
  assert.ok(hasFormulaInjection('\rmalicious'), 'Must detect CR prefix');
  assert.ok(!hasFormulaInjection('Prof. Alan Turing'), 'Safe name must not trigger alert');

  // Sanitization with leading quote
  assert.equal(sanitizeFormulaValue("=cmd|'...'!A0"), "'=cmd|'...'!A0");

  // End-to-end CSV parse with injection neutralization
  const csvContent = `Full Name,Email,Grade
Alice,alice@example.com,A+
=cmd|'/c calc'!A1,dan@evil.com,+99`;

  const parsed = parseCSV(csvContent, { sanitizeFormulas: true });
  assert.equal(parsed.rowCount, 2);
  assert.equal(parsed.rows[1]['Full Name'], "'=cmd|'/c calc'!A1");
  assert.equal(parsed.rows[1]['Grade'], "'+99");
  assert.ok(parsed.formulaInjections.length >= 2, 'Must log all neutralized formula alerts');
});

test('3. Intelligent Header Auto-Detection & Column Mapping', async () => {
  const headers = [
    'Student Name',
    'Email Address',
    'Course Title',
    'Final Grade',
    'Student ID',
    'Issue Date',
  ];

  const mapping = suggestColumnMappings(headers);
  assert.equal(mapping.recipient_name, 'Student Name');
  assert.equal(mapping.recipient_email, 'Email Address');
  assert.equal(mapping.course_name, 'Course Title');
  assert.equal(mapping.grade, 'Final Grade');
  assert.equal(mapping.external_id, 'Student ID');
  assert.equal(mapping.issue_date, 'Issue Date');
});

test('4. Recipient Schema Hygiene & Duplicate Detection', async () => {
  assert.ok(isValidEmail('alice.turing@cambridge.ac.uk'));
  assert.ok(isValidEmail('dean+cred@sub.apex.edu'));
  assert.ok(!isValidEmail('invalid-email'));
  assert.ok(!isValidEmail('user@'));
  assert.ok(!isValidEmail(''));

  assert.equal(normalizeDate('2026-11-15'), '2026-11-15');
  assert.equal(normalizeDate('15/11/2026'), '2026-11-15');

  const parsed = {
    headers: ['Name', 'Email'],
    rows: [
      { Name: 'Grace Hopper', Email: 'grace@navy.mil' },
      { Name: '', Email: 'missing.name@example.com' },
      { Name: 'Bad Email', Email: 'not-an-email' },
      { Name: 'Grace Duplicate', Email: 'grace@navy.mil' },
    ],
    rawGrid: [],
    rowCount: 4,
    detectedType: 'CSV',
    formulaInjections: [],
  };

  const report = validateSpreadsheetBatch(parsed, {
    recipient_name: 'Name',
    recipient_email: 'Email',
  });

  assert.equal(report.totalRows, 4);
  assert.equal(report.validCount, 1);
  assert.equal(report.invalidCount, 2); // missing name and bad email
  assert.equal(report.duplicateCount, 1); // duplicate email
  assert.equal(report.rows[3].status, 'DUPLICATE');
  assert.equal(report.rows[3].duplicateOfRowIndex, 2);
});

test('5. Collision-Safe Certificate Number Generation Preview', async () => {
  const cert1 = generateCertificateNumber('APEX', 2026, 1);
  const cert999 = generateCertificateNumber('CREDVAIL', 2026, 999);

  assert.equal(cert1, 'APEX-2026-000001');
  assert.equal(cert999, 'CREDVAIL-2026-000999');
  assert.ok(/^APEX-2026-\d{6}$/.test(cert1));
});

test('6. Batch API Route Handlers & Multi-Tenant Method Signatures', async () => {
  const routes = [
    { file: 'src/app/api/v1/tenants/[slug]/batches/route.ts', methods: ['GET'] },
    { file: 'src/app/api/v1/tenants/[slug]/batches/upload/route.ts', methods: ['POST'] },
    { file: 'src/app/api/v1/tenants/[slug]/batches/validate/route.ts', methods: ['POST'] },
    { file: 'src/app/api/v1/tenants/[slug]/batches/stage/route.ts', methods: ['POST'] },
    { file: 'src/app/api/v1/tenants/[slug]/batches/[id]/route.ts', methods: ['GET', 'DELETE'] },
  ];

  for (const { file, methods } of routes) {
    const fullPath = path.join(ROOT_DIR, file);
    assert.ok(fs.existsSync(fullPath), `Route handler missing: ${file}`);
    const content = fs.readFileSync(fullPath, 'utf-8');

    for (const method of methods) {
      assert.match(
        content,
        new RegExp(`export async function ${method}\\s*\\(`),
        `Route ${file} must export ${method} method`
      );
    }
  }

  // Verify BatchRepository signatures & deletion safeguard
  const repoFile = path.join(ROOT_DIR, 'src', 'lib', 'repositories', 'batch-repository.ts');
  const repoContent = fs.readFileSync(repoFile, 'utf-8');
  assert.match(repoContent, /createBatch\s*\(/);
  assert.match(repoContent, /findBatchById\s*\(/);
  assert.match(repoContent, /listBatches\s*\(/);
  assert.match(repoContent, /updateBatchStatus\s*\(/);
  assert.match(repoContent, /deleteBatch\s*\(/);
  assert.match(repoContent, /getExistingRecipientEmails\s*\(/);
  assert.match(repoContent, /Cannot delete batch in \$\{batch\.status\} status/);

  // Verify BatchService signatures & RBAC
  const serviceFile = path.join(ROOT_DIR, 'src', 'lib', 'services', 'batch-service.ts');
  const serviceContent = fs.readFileSync(serviceFile, 'utf-8');
  assert.match(serviceContent, /parseUploadedSpreadsheet\s*\(/);
  assert.match(serviceContent, /validateSpreadsheetData\s*\(/);
  assert.match(serviceContent, /stageBatch\s*\(/);
  assert.match(serviceContent, /listBatches\s*\(/);
  assert.match(serviceContent, /getBatchById\s*\(/);
  assert.match(serviceContent, /deleteBatch\s*\(/);
  assert.match(serviceContent, /assertTenantPermission/);
});

test('7. UI Ingestion Wizard & Batch History Components', async () => {
  const pagePath = path.join(ROOT_DIR, 'src', 'app', '(dashboard)', '[slug]', 'batches', 'page.tsx');
  const content = fs.readFileSync(pagePath, 'utf-8');

  assert.ok(content.includes('Spreadsheet Ingestion & Batches'), 'Must render header');
  assert.ok(content.includes('handleFileUpload'), 'Must handle drag & drop and file upload');
  assert.ok(content.includes('suggestedMapping'), 'Must handle column mapping');
  assert.ok(content.includes('BatchDiagnosticReport'), 'Must render diagnostic report');
  assert.ok(content.includes('handleStageBatch'), 'Must stage draft batch');
  assert.ok(content.includes('downloadSampleCSV'), 'Must provide sample CSV download');
  assert.ok(content.includes('SEC-07 Threat Defense'), 'Must highlight formula injection defense');
});
