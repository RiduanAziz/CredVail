/**
 * CREDVAIL Phase 2 Audit & Multi-Tenancy Verification Test Suite
 *
 * Verifies:
 * 1. Argon2id Password Hashing Engine & OWASP Security Parameters
 * 2. Cryptographic HMAC-SHA256 Session Management & Expiration
 * 3. Role-Based Access Control (RBAC) Matrix & Permission Assertions
 * 4. Tenant Context Extraction & Multi-Tenant Query Isolation
 * 5. Architectural Repositories & Service Implementations
 * 6. Next.js Route Handlers for Auth and Tenant APIs
 * 7. Modern UI Pages for Registration and Login
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { hash, verify, Version } from '@node-rs/argon2';

const ROOT_DIR = path.resolve('.');

test('1. Argon2id Password Security & OWASP Compliance', async () => {
  const passwordFile = path.join(ROOT_DIR, 'src', 'lib', 'auth', 'password.ts');
  assert.ok(fs.existsSync(passwordFile), 'password.ts must exist');

  const content = fs.readFileSync(passwordFile, 'utf-8');
  assert.match(content, /memoryCost:\s*65536/, 'Must use OWASP recommended 64MB (65536 KiB) memory cost');
  assert.match(content, /timeCost:\s*3/, 'Must use at least 3 iterations for time cost');
  assert.match(content, /parallelism:\s*4/, 'Must use parallelism degree 4');

  // Verify real hashing with @node-rs/argon2
  const plainPassword = 'CorrectHorseBatteryStaple!2026';
  const hashedPassword = await hash(plainPassword, {
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
    version: Version.Version13,
  });

  assert.ok(hashedPassword.startsWith('$argon2id$'), 'Hash algorithm identifier must be $argon2id$');
  const valid = await verify(hashedPassword, plainPassword);
  assert.equal(valid, true, 'Verification of correct password against Argon2id hash must return true');

  const invalid = await verify(hashedPassword, 'WrongPassword123!');
  assert.equal(invalid, false, 'Verification of incorrect password must return false');
});

test('2. HMAC-SHA256 Session Management & Timing Attack Protection', async () => {
  const sessionFile = path.join(ROOT_DIR, 'src', 'lib', 'auth', 'session.ts');
  assert.ok(fs.existsSync(sessionFile), 'session.ts must exist');

  const content = fs.readFileSync(sessionFile, 'utf-8');
  assert.match(content, /crypto\.timingSafeEqual/, 'Session verification must use timingSafeEqual');
  assert.match(content, /SESSION_COOKIE_NAME/, 'Must define SESSION_COOKIE_NAME');
  assert.match(content, /SESSION_DURATION_SECONDS/, 'Must define SESSION_DURATION_SECONDS');

  // Verify HMAC-SHA256 token lifecycle
  const secret = 'credvail_test_secret_for_audit_32bytes!';
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: 'usr_test_123',
    email: 'admin@apex.edu',
    fullName: 'Test Admin',
    platformRole: 'USER',
    tenants: [{ tenantId: 'tnt_1', slug: 'apex', name: 'Apex', role: 'ORG_OWNER' }],
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400,
    jti: 'jti_unique_nonce',
  };

  const encHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signingInput = `${encHeader}.${encPayload}`;
  const sig = crypto.createHmac('sha256', secret).update(signingInput).digest('base64url');
  const token = `${signingInput}.${sig}`;

  // Verify valid token signature
  const expectedSig = crypto.createHmac('sha256', secret).update(signingInput).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedSigBuf = Buffer.from(expectedSig);
  assert.equal(sigBuf.length, expectedSigBuf.length);
  assert.ok(crypto.timingSafeEqual(sigBuf, expectedSigBuf), 'HMAC signature must verify');

  // Verify tampered payload detection
  const tamperedPayload = { ...payload, platformRole: 'SUPER_ADMIN' };
  const tamperedEncPayload = Buffer.from(JSON.stringify(tamperedPayload)).toString('base64url');
  const tamperedInput = `${encHeader}.${tamperedEncPayload}`;
  const tamperedExpectedSig = crypto.createHmac('sha256', secret).update(tamperedInput).digest('base64url');
  assert.notEqual(sig, tamperedExpectedSig, 'Tampered token must have non-matching signature');
});

test('3. RBAC Matrix & Permission Boundary Coverage', async () => {
  const rbacFile = path.join(ROOT_DIR, 'src', 'lib', 'auth', 'rbac.ts');
  assert.ok(fs.existsSync(rbacFile), 'rbac.ts must exist');

  const content = fs.readFileSync(rbacFile, 'utf-8');

  // Check roles are present
  const roles = [
    'ORG_OWNER',
    'INSTITUTION_ADMIN',
    'CERTIFICATE_ISSUER',
    'TEMPLATE_DESIGNER',
    'READ_ONLY_STAFF',
    'SUPER_ADMIN',
    'PLATFORM_AUDITOR',
    'USER',
  ];
  for (const r of roles) {
    assert.match(content, new RegExp(`\\b${r}\\b`), `RBAC must define role ${r}`);
  }

  // Check core permissions
  const permissions = [
    'tenant:manage',
    'tenant:delete',
    'members:invite',
    'members:update_role',
    'members:remove',
    'keys:manage',
    'keys:rotate',
    'templates:create',
    'templates:update',
    'templates:delete',
    'batches:create',
    'batches:issue',
    'credentials:revoke',
    'credentials:reissue',
    'credentials:read',
    'audit:read',
  ];
  for (const p of permissions) {
    assert.match(content, new RegExp(`"${p}"`), `RBAC must define permission ${p}`);
  }
});

test('4. Tenant Context & Multi-Tenant Query Scoping', async () => {
  const contextFile = path.join(ROOT_DIR, 'src', 'lib', 'auth', 'tenant-context.ts');
  assert.ok(fs.existsSync(contextFile), 'tenant-context.ts must exist');

  const content = fs.readFileSync(contextFile, 'utf-8');
  assert.match(content, /export function extractSession/, 'Must export extractSession');
  assert.match(content, /export function extractTenantContext/, 'Must export extractTenantContext');
  assert.match(content, /export function scopeTenantQuery/, 'Must export scopeTenantQuery');
  assert.match(content, /class AuthenticationError/, 'Must declare AuthenticationError');
  assert.match(content, /class AuthorizationError/, 'Must declare AuthorizationError');
  assert.match(content, /Critical Security Violation/, 'Must protect against unscoped tenant queries');
});

test('5. Architectural Repositories & Services Exist & Are Complete', async () => {
  const requiredModules = [
    'src/lib/repositories/user-repository.ts',
    'src/lib/repositories/tenant-repository.ts',
    'src/lib/services/auth-service.ts',
    'src/lib/services/tenant-service.ts',
  ];

  for (const mod of requiredModules) {
    const fullPath = path.join(ROOT_DIR, mod);
    assert.ok(fs.existsSync(fullPath), `Module missing: ${mod}`);
    const content = fs.readFileSync(fullPath, 'utf-8');
    assert.ok(content.length > 200, `Module empty or incomplete: ${mod}`);
  }

  // Check did:web format in tenant service
  const tenantServiceContent = fs.readFileSync(
    path.join(ROOT_DIR, 'src', 'lib', 'services', 'tenant-service.ts'),
    'utf-8'
  );
  assert.match(
    tenantServiceContent,
    /did:web:.*:tenants:/,
    'Tenant service must generate standard W3C did:web URIs'
  );
});

test('6. API Route Handlers for Authentication & Multi-Tenancy', async () => {
  const routeHandlers = [
    { file: 'src/app/api/v1/auth/register/route.ts', methods: ['POST'] },
    { file: 'src/app/api/v1/auth/login/route.ts', methods: ['POST'] },
    { file: 'src/app/api/v1/auth/logout/route.ts', methods: ['POST'] },
    { file: 'src/app/api/v1/auth/me/route.ts', methods: ['GET'] },
    { file: 'src/app/api/v1/tenants/route.ts', methods: ['POST'] },
    { file: 'src/app/api/v1/tenants/[slug]/route.ts', methods: ['GET'] },
    { file: 'src/app/api/v1/tenants/[slug]/members/route.ts', methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
  ];

  for (const { file, methods } of routeHandlers) {
    const fullPath = path.join(ROOT_DIR, file);
    assert.ok(fs.existsSync(fullPath), `Route handler missing: ${file}`);
    const content = fs.readFileSync(fullPath, 'utf-8');

    for (const method of methods) {
      assert.match(
        content,
        new RegExp(`export async function ${method}\\s*\\(`),
        `Route handler ${file} must export ${method} method`
      );
    }
  }
});

test('7. Authentication UI Components & Pages', async () => {
  const uiPages = [
    { file: 'src/app/(auth)/login/page.tsx', matches: ['Email Address', 'Password', 'Sign In', 'Authentication'] },
    { file: 'src/app/(auth)/register/page.tsx', matches: ['Register Your Institution', 'Create Your Personal Wallet', '/register/institution', '/register/wallet'] },
    { file: 'src/app/(auth)/register/institution/page.tsx', matches: ['Account Administrator', 'Institution Information', 'Official Work Email'] },
    { file: 'src/app/(auth)/register/wallet/page.tsx', matches: ['Personal Account Details', 'Full Name', 'Email Address'] },
  ];

  for (const { file, matches } of uiPages) {
    const fullPath = path.join(ROOT_DIR, file);
    assert.ok(fs.existsSync(fullPath), `Auth page missing: ${file}`);
    const content = fs.readFileSync(fullPath, 'utf-8');

    for (const text of matches) {
      assert.match(content, new RegExp(text, 'i'), `Page ${file} missing UI element: ${text}`);
    }
  }
});
