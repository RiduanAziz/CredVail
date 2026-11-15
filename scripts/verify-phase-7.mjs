/**
 * CREDVAIL Phase 7 Audit & Verification Test Suite
 *
 * Automated verification of:
 * 1. Phase 7 Scaffolding & Configuration Files
 * 2. ECDSA NIST P-256 Key Pair Generation & Formats (JWK, Multibase Base58-BTC)
 * 3. AES-256-GCM Private Key Encryption at Rest
 * 4. Cryptographic Data Signing & Verification
 * 5. W3C did:web Identifier Resolution & DID Document Builder
 * 6. Key Epoch Management & Graceful Rotation (Epoch 1 -> Epoch N)
 * 7. Emergency Cryptographic Key Compromise & Revocation (SEC-09)
 * 8. RBAC Governance & Multi-Tenant Isolation Barriers
 * 9. Leak-Proof Public Key Projections (Zero Private Key Leaks)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { KeyService, encodeBase58 } from '../src/lib/crypto/key-service.ts';
import { KeyRepository } from '../src/lib/repositories/key-repository.ts';
import { KeyManagementService } from '../src/lib/services/key-management-service.ts';
import { TenantRepository } from '../src/lib/repositories/tenant-repository.ts';
import { assertTenantPermission } from '../src/lib/auth/rbac.ts';

const ROOT_DIR = path.resolve('.');

test('1. Phase 7 Scaffolding & Required Architecture Files Exist', async () => {
  const requiredFiles = [
    'src/lib/crypto/key-service.ts',
    'src/lib/repositories/key-repository.ts',
    'src/lib/services/key-management-service.ts',
    'src/app/api/v1/tenants/[slug]/keys/route.ts',
    'src/app/api/v1/tenants/[slug]/keys/rotate/route.ts',
    'src/app/api/v1/tenants/[slug]/keys/compromise/route.ts',
    'src/app/api/v1/tenants/[slug]/did/route.ts',
    'src/app/tenants/[slug]/.well-known/did.json/route.ts',
    'src/app/.well-known/did.json/route.ts',
    'src/app/(dashboard)/[slug]/keys/page.tsx',
    'test/unit/key-generation.test.ts',
    'test/unit/did-web.test.ts',
    'test/integration/key-governance-flow.test.ts',
  ];

  for (const f of requiredFiles) {
    const fullPath = path.join(ROOT_DIR, f);
    assert.ok(fs.existsSync(fullPath), `Required Phase 7 file missing: ${f}`);
    assert.ok(fs.statSync(fullPath).size > 100, `File is empty: ${f}`);
  }
});

test('2. ECDSA NIST P-256 Key Pair Generation & Formatting', async () => {
  const keyPair = KeyService.generateEcdsaKeyPair();

  // Public Key JWK (RFC 7517)
  assert.equal(keyPair.publicKeyJwk.kty, 'EC');
  assert.equal(keyPair.publicKeyJwk.crv, 'P-256');
  assert.ok(keyPair.publicKeyJwk.x.length > 20);
  assert.ok(keyPair.publicKeyJwk.y.length > 20);

  // Public Key Multibase Base58-BTC ('z' prefix)
  assert.ok(keyPair.publicKeyMultibase.startsWith('z'));
  assert.ok(keyPair.publicKeyMultibase.length > 30);

  // PEM structures
  assert.ok(keyPair.publicKeyPem.includes('-----BEGIN PUBLIC KEY-----'));
  assert.ok(keyPair.publicKeyPem.includes('-----END PUBLIC KEY-----'));
  assert.ok(keyPair.privateKeyPem.includes('-----BEGIN PRIVATE KEY-----'));
  assert.ok(keyPair.privateKeyPem.includes('-----END PRIVATE KEY-----'));

  // SHA-256 Fingerprint
  assert.match(keyPair.fingerprint, /^[a-f0-9]{64}$/);

  // Base58 encoder check
  const encoded = encodeBase58(Buffer.from('CredVail Phase 7 Test'));
  assert.equal(typeof encoded, 'string');
  assert.ok(encoded.length > 0);
  assert.ok(!/[0OIl]/.test(encoded), 'Base58 must not contain ambiguous characters 0, O, I, l');
});

test('3. AES-256-GCM Private Key Encryption at Rest', async () => {
  const keyPair = KeyService.generateEcdsaKeyPair();
  const encrypted = KeyService.encryptPrivateKey(keyPair.privateKeyPem);

  assert.ok(encrypted.startsWith('aes-256-gcm:'));
  const parts = encrypted.split(':');
  assert.equal(parts.length, 4, 'Encrypted format must be aes-256-gcm:iv:tag:ciphertext');
  assert.equal(parts[1].length, 24, 'IV must be 12 bytes (24 hex characters)');
  assert.equal(parts[2].length, 32, 'Auth tag must be 16 bytes (32 hex characters)');

  // Decrypt and compare
  const decrypted = KeyService.decryptPrivateKey(encrypted);
  assert.equal(decrypted, keyPair.privateKeyPem);

  // Tampered ciphertext should fail decryption
  const tampered = `aes-256-gcm:${parts[1]}:${parts[2]}:${parts[3].slice(0, -2)}99`;
  assert.throws(() => KeyService.decryptPrivateKey(tampered));
});

test('4. Cryptographic Signing & Verification Operations', async () => {
  const keyPair1 = KeyService.generateEcdsaKeyPair();
  const keyPair2 = KeyService.generateEcdsaKeyPair();
  const payload = 'VerifiableCredential:Hash:0x3958bcda71289';

  // Sign with key 1
  const signature = KeyService.signData(keyPair1.privateKeyPem, payload);
  assert.equal(typeof signature, 'string');
  assert.ok(signature.length > 50);

  // Verify with PEM
  const pemValid = KeyService.verifySignature(keyPair1.publicKeyPem, payload, signature);
  assert.equal(pemValid, true);

  // Verify with JWK
  const jwkValid = KeyService.verifySignature(keyPair1.publicKeyJwk, payload, signature);
  assert.equal(jwkValid, true);

  // Verify tampering detection
  const tamperedValid = KeyService.verifySignature(keyPair1.publicKeyPem, payload + 'TAMPER', signature);
  assert.equal(tamperedValid, false);

  // Verify wrong key rejection
  const wrongKeyValid = KeyService.verifySignature(keyPair2.publicKeyPem, payload, signature);
  assert.equal(wrongKeyValid, false);
});

test('5. W3C did:web Identifier Resolution & Document Builder', async () => {
  // Deterministic URL mapping
  const rootUrl = KeyService.didWebToHttpsUrl('did:web:credvail.com');
  assert.equal(rootUrl, 'https://credvail.com/.well-known/did.json');

  const tenantUrl = KeyService.didWebToHttpsUrl('did:web:credvail.com:tenants:apex');
  assert.equal(tenantUrl, 'https://credvail.com/tenants/apex/.well-known/did.json');

  // Document building with compromise exclusion
  const didUri = 'did:web:credvail.com:tenants:apex';
  const key1 = KeyService.generateEcdsaKeyPair();
  const key2 = KeyService.generateEcdsaKeyPair();

  const didDoc = KeyService.buildDidDocument(didUri, [
    { keyEpoch: 2, publicKeyJwk: key2.publicKeyJwk, isActive: true, isCompromised: false },
    { keyEpoch: 1, publicKeyJwk: key1.publicKeyJwk, isActive: false, isCompromised: true }, // COMPROMISED
  ]);

  assert.equal(didDoc.id, didUri);
  assert.ok(didDoc['@context'].includes('https://www.w3.org/ns/did/v1'));
  // All keys remain in verificationMethod for history
  assert.equal(didDoc.verificationMethod.length, 2);
  // Compromised key MUST be excluded from assertionMethod
  assert.deepEqual(didDoc.assertionMethod, [`${didUri}#key-2`]);
});

test('6. Institutional Key Epoch Lifecycle & Graceful Rotation', async () => {
  KeyRepository.resetInMemoryStore();
  const tenantRepo = new TenantRepository();
  const slug = `audit-univ-${Date.now()}`;
  const tenant = await tenantRepo.createTenant({
    name: 'Audit Test University',
    slug,
    legalEntityName: 'Audit Test University Inc.',
    websiteUrl: `https://${slug}.edu`,
    didUri: `did:web:credvail.com:tenants:${slug}`,
    ownerUserId: 'usr_audit_owner',
  });

  // 1. Initial key creation
  const initial = await KeyManagementService.listKeys(tenant.slug);
  assert.ok(initial.activeKey);
  assert.equal(initial.activeKey.keyEpoch, 1);
  assert.equal(initial.activeKey.isActive, true);
  assert.equal(initial.activeKey.isCompromised, false);

  // 2. Rotate to Epoch 2
  const rotated = await KeyManagementService.rotateKey(tenant.slug);
  assert.equal(rotated.keyEpoch, 2);
  assert.equal(rotated.isActive, true);

  // Check state after rotation
  const updated = await KeyManagementService.listKeys(tenant.slug);
  assert.equal(updated.allEpochs.length, 2);
  assert.equal(updated.activeKey.keyEpoch, 2);

  const epoch1 = updated.allEpochs.find((k) => k.keyEpoch === 1);
  assert.equal(epoch1.isActive, false); // Gracefully rotated
  assert.equal(epoch1.isCompromised, false);
  assert.ok(epoch1.validTo);
});

test('7. Emergency Cryptographic Key Compromise Revocation (SEC-09)', async () => {
  KeyRepository.resetInMemoryStore();
  const tenantRepo = new TenantRepository();
  const slug = `sec-acad-${Date.now()}`;
  const tenant = await tenantRepo.createTenant({
    name: 'Security Test Academy',
    slug,
    legalEntityName: 'Security Test Academy Inc.',
    websiteUrl: `https://${slug}.edu`,
    didUri: `did:web:credvail.com:tenants:${slug}`,
    ownerUserId: 'usr_sec_owner',
  });

  await KeyManagementService.listKeys(tenant.slug);
  await KeyManagementService.rotateKey(tenant.slug);

  // Flag Epoch 1 as compromised
  const compromised = await KeyManagementService.flagCompromised(tenant.slug, 1);
  assert.equal(compromised.keyEpoch, 1);
  assert.equal(compromised.isCompromised, true);
  assert.equal(compromised.isActive, false);
  assert.ok(compromised.revokedAt);

  // Verify DID Document excludes compromised key
  const didDoc = await KeyManagementService.getTenantDidDocument(tenant.slug);
  assert.ok(!didDoc.assertionMethod.includes(`${tenant.didUri}#key-1`));
  assert.ok(didDoc.assertionMethod.includes(`${tenant.didUri}#key-2`));
});

test('8. RBAC Permissions & Multi-Tenant Isolation Barriers', async () => {
  KeyRepository.resetInMemoryStore();
  const tenantRepo = new TenantRepository();

  const slugAlpha = `alpha-${Date.now()}`;
  const tenantAlpha = await tenantRepo.createTenant({
    name: 'Alpha Institute',
    slug: slugAlpha,
    legalEntityName: 'Alpha Institute Inc.',
    websiteUrl: `https://${slugAlpha}.edu`,
    didUri: `did:web:credvail.com:tenants:${slugAlpha}`,
    ownerUserId: 'usr_alpha',
  });

  const slugBeta = `beta-${Date.now()}`;
  const tenantBeta = await tenantRepo.createTenant({
    name: 'Beta Institute',
    slug: slugBeta,
    legalEntityName: 'Beta Institute Inc.',
    websiteUrl: `https://${slugBeta}.edu`,
    didUri: `did:web:credvail.com:tenants:${slugBeta}`,
    ownerUserId: 'usr_beta',
  });

  const sessionBeta = {
    sub: 'usr_beta',
    email: 'beta@inst.org',
    fullName: 'Beta Admin',
    platformRole: 'USER',
    currentTenantId: tenantBeta.id,
    currentTenantRole: 'ORG_OWNER',
    tenants: [{ tenantId: tenantBeta.id, role: 'ORG_OWNER', slug: tenantBeta.slug, name: tenantBeta.name }],
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    jti: 'jti_beta',
  };

  // Cross-tenant access rejected
  await assert.rejects(
    async () => {
      await KeyManagementService.listKeys(tenantAlpha.slug, sessionBeta);
    },
    { message: /Forbidden/ }
  );

  // RBAC permissions check
  assert.doesNotThrow(() => assertTenantPermission('ORG_OWNER', 'keys:manage'));
  assert.doesNotThrow(() => assertTenantPermission('ORG_OWNER', 'keys:rotate'));
  assert.doesNotThrow(() => assertTenantPermission('ORG_OWNER', 'keys:compromise'));

  assert.throws(() => assertTenantPermission('INSTITUTION_ADMIN', 'keys:manage'));
  assert.throws(() => assertTenantPermission('INSTITUTION_ADMIN', 'keys:rotate'));
  assert.throws(() => assertTenantPermission('INSTITUTION_ADMIN', 'keys:compromise'));

  assert.throws(() => assertTenantPermission('CERTIFICATE_ISSUER', 'keys:rotate'));
  assert.throws(() => assertTenantPermission('READ_ONLY_STAFF', 'keys:manage'));
});

test('9. Leak-Proof Public Key Projections', async () => {
  const tenantRepo = new TenantRepository();
  const slugProj = `proj-${Date.now()}`;
  const tenant = await tenantRepo.createTenant({
    name: 'Projection Test',
    slug: slugProj,
    legalEntityName: 'Projection Test Inc.',
    websiteUrl: `https://${slugProj}.edu`,
    didUri: `did:web:credvail.com:tenants:${slugProj}`,
    ownerUserId: 'usr_proj',
  });

  const { activeKey, allEpochs } = await KeyManagementService.listKeys(tenant.slug);
  assert.ok(activeKey);

  // Ensure no private key fields are exposed in public projection
  assert.equal('encryptedPrivateKey' in activeKey, false);
  assert.equal('privateKeyPem' in activeKey, false);
  assert.equal('privateKey' in activeKey, false);

  for (const ep of allEpochs) {
    assert.equal('encryptedPrivateKey' in ep, false);
    assert.equal('privateKeyPem' in ep, false);
    assert.equal('privateKey' in ep, false);
  }
});
