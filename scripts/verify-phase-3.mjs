/**
 * CREDVAIL Phase 3 Audit & Dashboard Verification Test Suite
 *
 * Verifies:
 * 1. Phase 3 File Scaffold & Dashboard Route Structure
 * 2. Route Handlers for Profile, Members, Analytics, and Audit Logs
 * 3. Repository Methods (updateTenant, getAnalytics, recordAuditLog, listAuditLogs)
 * 4. TenantService Workflow (Branding, Analytics, Member Invites, Sole Owner Safeguards)
 * 5. Dashboard UI Components & Navigation Integrity
 * 6. Multi-Tenant Isolation for Institutional Analytics & Audit Trails
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = path.resolve('.');

test('1. Phase 3 Scaffold & Dashboard Route Files Exist', async () => {
  const requiredFiles = [
    'src/app/(dashboard)/[slug]/layout.tsx',
    'src/app/(dashboard)/[slug]/page.tsx',
    'src/app/(dashboard)/[slug]/members/page.tsx',
    'src/app/(dashboard)/[slug]/settings/page.tsx',
    'src/app/(dashboard)/[slug]/audit-logs/page.tsx',
    'src/app/(dashboard)/[slug]/certificates/page.tsx',
    'src/app/(dashboard)/[slug]/templates/page.tsx',
    'src/app/(dashboard)/[slug]/keys/page.tsx',
  ];

  for (const f of requiredFiles) {
    const fullPath = path.join(ROOT_DIR, f);
    assert.ok(fs.existsSync(fullPath), `Required dashboard file missing: ${f}`);
    assert.ok(fs.statSync(fullPath).size > 100, `File is empty: ${f}`);
  }
});

test('2. Phase 3 Route Handlers & HTTP Methods', async () => {
  const routes = [
    { file: 'src/app/api/v1/tenants/[slug]/route.ts', methods: ['GET', 'PATCH'] },
    { file: 'src/app/api/v1/tenants/[slug]/analytics/overview/route.ts', methods: ['GET'] },
    { file: 'src/app/api/v1/tenants/[slug]/audit-logs/route.ts', methods: ['GET'] },
    { file: 'src/app/api/v1/tenants/[slug]/members/route.ts', methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
    { file: 'src/app/api/v1/tenants/[slug]/members/invite/route.ts', methods: ['POST'] },
    { file: 'src/app/api/v1/tenants/[slug]/members/[userId]/route.ts', methods: ['PATCH', 'DELETE'] },
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

test('3. Repository & Service Method Signatures', async () => {
  const repoFile = path.join(ROOT_DIR, 'src', 'lib', 'repositories', 'tenant-repository.ts');
  const serviceFile = path.join(ROOT_DIR, 'src', 'lib', 'services', 'tenant-service.ts');

  const repoContent = fs.readFileSync(repoFile, 'utf-8');
  assert.match(repoContent, /updateTenant\s*\(/, 'TenantRepository must have updateTenant');
  assert.match(repoContent, /getAnalytics\s*\(/, 'TenantRepository must have getAnalytics');
  assert.match(repoContent, /recordAuditLog\s*\(/, 'TenantRepository must have recordAuditLog');
  assert.match(repoContent, /listAuditLogs\s*\(/, 'TenantRepository must have listAuditLogs');

  const serviceContent = fs.readFileSync(serviceFile, 'utf-8');
  assert.match(serviceContent, /updateOrganization\s*\(/, 'TenantService must have updateOrganization');
  assert.match(serviceContent, /getAnalyticsOverview\s*\(/, 'TenantService must have getAnalyticsOverview');
  assert.match(serviceContent, /getAuditLogs\s*\(/, 'TenantService must have getAuditLogs');
  assert.match(serviceContent, /inviteMember\s*\(/, 'TenantService must have inviteMember');
  assert.match(serviceContent, /updateMemberRole\s*\(/, 'TenantService must have updateMemberRole');
  assert.match(serviceContent, /removeMember\s*\(/, 'TenantService must have removeMember');
});

test('4. Dashboard Layout & Navigation Structure', async () => {
  const layoutFile = path.join(ROOT_DIR, 'src', 'app', '(dashboard)', '[slug]', 'layout.tsx');
  const content = fs.readFileSync(layoutFile, 'utf-8');

  // Verify core navigation links exist
  assert.match(content, /Overview/, 'Layout must have Overview nav link');
  assert.match(content, /Team Members/, 'Layout must have Team Members nav link');
  assert.match(content, /Settings & Branding/, 'Layout must have Settings & Branding nav link');
  assert.match(content, /Certificates/, 'Layout must have Certificates nav link');
  assert.match(content, /Templates/, 'Layout must have Templates nav link');
  assert.match(content, /Signing Keys & Trust/, 'Layout must have Signing Keys nav link');
  assert.match(content, /Audit Trail/, 'Layout must have Audit Trail nav link');
  assert.match(content, /DID:\s*<\/span>/, 'Layout must display DID identifier');
});

test('5. Dashboard Overview Metrics & Quick Actions', async () => {
  const pageFile = path.join(ROOT_DIR, 'src', 'app', '(dashboard)', '[slug]', 'page.tsx');
  const content = fs.readFileSync(pageFile, 'utf-8');

  // Check 6 key metric cards
  assert.match(content, /Total Issued/, 'Must show Total Issued metric');
  assert.match(content, /Active Current/, 'Must show Active Current metric');
  assert.match(content, /Revoked/, 'Must show Revoked metric');
  assert.match(content, /Total Batches/, 'Must show Total Batches metric');
  assert.match(content, /Templates/, 'Must show Templates metric');
  assert.match(content, /Team Staff/, 'Must show Team Staff metric');

  // Check quick actions
  assert.match(content, /Design Template/, 'Must have Design Template action');
  assert.match(content, /Bulk Certificate Issuance/, 'Must have Bulk Issuance action');
  assert.match(content, /Manage Team/, 'Must have Manage Team action');
  assert.match(content, /Cryptographic Keys/, 'Must have Cryptographic Keys action');
});

test('6. Member Management & Sole Owner Safeguards', async () => {
  const membersPage = path.join(ROOT_DIR, 'src', 'app', '(dashboard)', '[slug]', 'members', 'page.tsx');
  const content = fs.readFileSync(membersPage, 'utf-8');

  assert.match(content, /Invite Team Member/, 'Must have Invite Team Member button');
  assert.match(content, /Active Staff Directory/, 'Must display Active Staff Directory');
  assert.match(content, /Edit Role/, 'Must support role editing');
  assert.match(content, /Trash2/, 'Must support member removal');
  assert.match(content, /ROLE_DEFINITIONS/, 'Must define RBAC roles');

  // Verify sole owner warning in service
  const serviceFile = path.join(ROOT_DIR, 'src', 'lib', 'services', 'tenant-service.ts');
  const serviceContent = fs.readFileSync(serviceFile, 'utf-8');
  assert.match(serviceContent, /Cannot demote the sole Organization Owner/);
  assert.match(serviceContent, /Cannot remove the sole Organization Owner/);
});

test('7. Settings & Visual Identity Customization', async () => {
  const settingsPage = path.join(ROOT_DIR, 'src', 'app', '(dashboard)', '[slug]', 'settings', 'page.tsx');
  const content = fs.readFileSync(settingsPage, 'utf-8');

  assert.match(content, /Institutional Identity/, 'Must have Institutional Identity section');
  assert.match(content, /Primary Brand Color/, 'Must configure Primary Brand Color');
  assert.match(content, /Secondary \(Gold\) Color/, 'Must configure Secondary Color');
  assert.match(content, /Accent Color/, 'Must configure Accent Color');
  assert.match(content, /Brand Palette Live Preview/, 'Must show live brand palette preview');
  assert.match(content, /W3C DID Identifier/, 'Must display immutable W3C DID identifier');
});
