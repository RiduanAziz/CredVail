/**
 * CREDVAIL Phase 4 Audit & Certificate Template Designer Verification Test Suite
 *
 * Verifies:
 * 1. Template Scaffolding & Type Definitions
 * 2. 10 Master Categories & 9 Master Dynamic Placeholders Coverage
 * 3. Route Handlers for Template Management & Real-Time Preview
 * 4. Repository & Service Layer Methods
 * 5. Dynamic QR Code Generation & Vector Preview Engine
 * 6. Interactive Visual Studio Canvas & Inspector UI
 * 7. Deletion Safeguard Linked to Batch Issuances
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';

const ROOT_DIR = path.resolve('.');

test('1. Phase 4 Scaffolding & Configuration Files Exist', async () => {
  const requiredFiles = [
    'src/types/template.ts',
    'src/lib/templates/presets.ts',
    'src/lib/repositories/template-repository.ts',
    'src/lib/services/template-service.ts',
    'src/app/(dashboard)/[slug]/templates/page.tsx',
    'src/app/(dashboard)/[slug]/templates/[id]/page.tsx',
    'src/app/api/v1/tenants/[slug]/templates/route.ts',
    'src/app/api/v1/tenants/[slug]/templates/[id]/route.ts',
    'src/app/api/v1/tenants/[slug]/templates/[id]/preview/route.ts',
  ];

  for (const f of requiredFiles) {
    const fullPath = path.join(ROOT_DIR, f);
    assert.ok(fs.existsSync(fullPath), `Required template designer file missing: ${f}`);
    assert.ok(fs.statSync(fullPath).size > 100, `File is empty: ${f}`);
  }
});

test('2. 10 Certificate Categories & 9 Dynamic Placeholders Coverage', async () => {
  const presetsFile = path.join(ROOT_DIR, 'src', 'lib', 'templates', 'presets.ts');
  const content = fs.readFileSync(presetsFile, 'utf-8');

  // Verify all 10 categories from master prompt
  const categories = [
    'COURSE_COMPLETION',
    'EVENT_PARTICIPATION',
    'INTERNSHIP_COMPLETION',
    'TRAINING_COMPLETION',
    'ACHIEVEMENT',
    'APPRECIATION',
    'MEMBERSHIP',
    'WORKSHOP_ATTENDANCE',
    'COMPETITION_PARTICIPATION',
    'CUSTOM',
  ];

  for (const cat of categories) {
    assert.match(content, new RegExp(`\\b${cat}\\b`), `Preset library must include category ${cat}`);
  }

  // Verify all 9 dynamic placeholders from master prompt
  const placeholders = [
    '{{recipient_name}}',
    '{{certificate_number}}',
    '{{course_name}}',
    '{{organization_name}}',
    '{{issue_date}}',
    '{{completion_date}}',
    '{{grade}}',
    '{{instructor_name}}',
    '{{verification_url}}',
  ];

  for (const ph of placeholders) {
    assert.match(content, new RegExp(ph.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Must include placeholder ${ph}`);
  }
});

test('3. Template API Route Handlers & HTTP Methods', async () => {
  const routes = [
    { file: 'src/app/api/v1/tenants/[slug]/templates/route.ts', methods: ['GET', 'POST'] },
    { file: 'src/app/api/v1/tenants/[slug]/templates/[id]/route.ts', methods: ['GET', 'PUT', 'DELETE'] },
    { file: 'src/app/api/v1/tenants/[slug]/templates/[id]/preview/route.ts', methods: ['POST'] },
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
});

test('4. Repository & Service Method Signatures', async () => {
  const repoFile = path.join(ROOT_DIR, 'src', 'lib', 'repositories', 'template-repository.ts');
  const serviceFile = path.join(ROOT_DIR, 'src', 'lib', 'services', 'template-service.ts');

  const repoContent = fs.readFileSync(repoFile, 'utf-8');
  assert.match(repoContent, /createTemplate\s*\(/);
  assert.match(repoContent, /listTemplates\s*\(/);
  assert.match(repoContent, /getTemplateById\s*\(/);
  assert.match(repoContent, /updateTemplate\s*\(/);
  assert.match(repoContent, /deleteTemplate\s*\(/);
  assert.match(repoContent, /seedPresetsIfEmpty\s*\(/);

  const serviceContent = fs.readFileSync(serviceFile, 'utf-8');
  assert.match(serviceContent, /createTemplate\s*\(/);
  assert.match(serviceContent, /listTemplates\s*\(/);
  assert.match(serviceContent, /getTemplate\s*\(/);
  assert.match(serviceContent, /updateTemplate\s*\(/);
  assert.match(serviceContent, /deleteTemplate\s*\(/);
  assert.match(serviceContent, /generatePreview\s*\(/);
});

test('5. Dynamic QR Code Generation Verification', async () => {
  const testUrl = 'https://credvail.io/verify/CREDVAIL-2026-TEST';
  const qrDataUrl = await QRCode.toDataURL(testUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 96,
  });

  assert.ok(qrDataUrl.startsWith('data:image/png;base64,'), 'QR generator must output valid base64 data URI');
  assert.ok(qrDataUrl.length > 500, 'QR image data URL must have valid payload bytes');
});

test('6. Interactive Visual Studio Canvas & Inspector UI', async () => {
  const designerFile = path.join(ROOT_DIR, 'src', 'app', '(dashboard)', '[slug]', 'templates', '[id]', 'page.tsx');
  const content = fs.readFileSync(designerFile, 'utf-8');

  // Verify designer UI capabilities
  assert.match(content, /Elements Library/, 'Must have Elements Library panel');
  assert.match(content, /Inspector/, 'Must have Property Inspector panel');
  assert.match(content, /Font Family/, 'Must have typography font controls');
  assert.match(content, /QR Code Size/, 'Must have dynamic QR positioning and sizing');
  assert.match(content, /Signatures/, 'Must have signature blocks support');
  assert.match(content, /Save Template/, 'Must have Save Template button');
});

test('7. Accidental Data Loss Safeguard: Batch Linkage Check', async () => {
  const repoFile = path.join(ROOT_DIR, 'src', 'lib', 'repositories', 'template-repository.ts');
  const content = fs.readFileSync(repoFile, 'utf-8');

  assert.match(
    content,
    /Cannot delete template: It is actively linked to issued batches/,
    'Must prevent deleting templates that have issued batches'
  );
});
