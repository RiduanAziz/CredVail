/**
 * CREDVAIL Phase 8 Audit & Verification Test Suite
 *
 * Automated verification of:
 * 1. Phase 8 Scaffolding & Configuration Files
 * 2. W3C Verifiable Credential Data Model 2.0 Schema Conformance
 * 3. RFC 8785 Canonical JSON Serialization & Deterministic VC Hashing
 * 4. ECDSA NIST P-256 Digital Signing (JsonWebSignature2020) & Tamper Rejection
 * 5. Deterministic Keccak-256 Merkle Leaf Calculation (Profile Section 5.1)
 * 6. OpenZeppelin-Compatible Merkle Tree Construction & Commutative Pair Sorting
 * 7. O(log N) Cryptographic Inclusion Proof Generation & Verification
 * 8. End-to-End Batch Processing with Signed VCs & Merkle Evidence
 * 9. Tenant Isolation & Access Control Barriers
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { VcService } from '../src/lib/crypto/vc-service.ts';
import { CredvailMerkleTree } from '../src/lib/crypto/merkle.ts';
import { canonicalizeJson, computeKeccak256 } from '../src/lib/crypto/canonical.ts';
import { KeyService } from '../src/lib/crypto/key-service.ts';
import { BatchRepository } from '../src/lib/repositories/batch-repository.ts';
import { CredentialRepository } from '../src/lib/repositories/credential-repository.ts';
import { TemplateRepository } from '../src/lib/repositories/template-repository.ts';
import { TenantRepository } from '../src/lib/repositories/tenant-repository.ts';
import { KeyManagementService } from '../src/lib/services/key-management-service.ts';
import { BatchProcessingService } from '../src/lib/services/batch-processing-service.ts';
import { TEMPLATE_PRESETS } from '../src/lib/templates/presets.ts';

const ROOT_DIR = path.resolve('.');

test('1. Phase 8 Scaffolding & Required Architecture Files Exist', async () => {
  const requiredFiles = [
    'src/lib/crypto/vc-service.ts',
    'src/lib/crypto/merkle.ts',
    'src/lib/crypto/canonical.ts',
    'src/lib/services/batch-processing-service.ts',
    'src/lib/repositories/credential-repository.ts',
    'src/app/api/v1/tenants/[slug]/credentials/[id]/vc/route.ts',
    'src/app/api/v1/tenants/[slug]/credentials/[id]/merkle-proof/route.ts',
    'src/app/api/v1/tenants/[slug]/batches/[id]/merkle/route.ts',
    'src/app/(dashboard)/[slug]/certificates/page.tsx',
    'test/unit/vc-service.test.ts',
    'test/unit/merkle-proofs.test.ts',
    'test/integration/vc-issuance-flow.test.ts',
  ];

  for (const f of requiredFiles) {
    const fullPath = path.join(ROOT_DIR, f);
    assert.ok(fs.existsSync(fullPath), `Required Phase 8 file missing: ${f}`);
    assert.ok(fs.statSync(fullPath).size > 100, `File is empty: ${f}`);
  }
});

test('2. W3C Verifiable Credential Data Model 2.0 Schema Conformance', async () => {
  const unsignedVc = VcService.buildUnsignedCredential({
    credentialId: 'urn:uuid:12345678-1234-1234-1234-123456789abc',
    certificateNumber: 'AUDIT-2026-000001',
    tenantDidUri: 'did:web:credvail.com:tenants:audit',
    tenantName: 'Audit University',
    tenantSlug: 'audit',
    recipientId: 'rec_audit_1',
    recipientName: 'Ada Lovelace',
    recipientEmail: 'ada@lovelace.org',
    claims: { course_name: 'Computer Science', grade: 'A' },
    batchId: 'batch_audit',
    merkleIndex: 0,
    bitstringIndex: 0,
  });

  assert.ok(unsignedVc['@context'].includes('https://www.w3.org/ns/credentials/v2'));
  assert.ok(unsignedVc['@context'].includes('https://w3id.org/security/suites/jws-2020/v1'));
  assert.equal(unsignedVc.id, 'urn:uuid:12345678-1234-1234-1234-123456789abc');
  assert.ok(unsignedVc.type.includes('VerifiableCredential'));
  assert.ok(unsignedVc.type.includes('CertificateCredential'));
  assert.equal(unsignedVc.issuer.id, 'did:web:credvail.com:tenants:audit');
  assert.equal(unsignedVc.issuer.name, 'Audit University');
  assert.equal(unsignedVc.credentialSubject.name, 'Ada Lovelace');
  assert.equal(unsignedVc.credentialSubject.certificateNumber, 'AUDIT-2026-000001');
  assert.equal(unsignedVc.credentialStatus.type, 'BitstringStatusListEntry');
});

test('3. RFC 8785 Canonical JSON Serialization & Deterministic VC Hashing', async () => {
  const objA = { z: 1, a: 2, m: { y: 'val', x: 'val2' } };
  const objB = { a: 2, m: { x: 'val2', y: 'val' }, z: 1 };

  const canonicalA = canonicalizeJson(objA);
  const canonicalB = canonicalizeJson(objB);

  // Exact canonical match regardless of object property ordering
  assert.equal(canonicalA, canonicalB);
  assert.equal(canonicalA, '{"a":2,"m":{"x":"val2","y":"val"},"z":1}');

  // Deterministic Keccak-256 hash
  const hashA = computeKeccak256(canonicalA);
  const hashB = computeKeccak256(canonicalB);
  assert.equal(hashA, hashB);
  assert.ok(hashA.startsWith('0x'));
  assert.equal(hashA.length, 66);
});

test('4. ECDSA NIST P-256 Digital Signing (JsonWebSignature2020) & Tamper Rejection', async () => {
  const keyPair = KeyService.generateEcdsaKeyPair();
  const keyIdentifier = 'did:web:credvail.com:tenants:audit#key-1';

  const unsignedVc = VcService.buildUnsignedCredential({
    credentialId: 'urn:uuid:sign-test-1',
    certificateNumber: 'AUDIT-2026-000002',
    tenantDidUri: 'did:web:credvail.com:tenants:audit',
    tenantName: 'Audit University',
    tenantSlug: 'audit',
    recipientId: 'rec_2',
    recipientName: 'Alan Turing',
    recipientEmail: 'alan@turing.org',
    claims: { course_name: 'Decryption Theory' },
    batchId: 'batch_audit',
    merkleIndex: 1,
    bitstringIndex: 1,
  });

  const signedVc = VcService.signCredential(unsignedVc, keyPair.privateKeyPem, keyIdentifier);

  assert.ok(signedVc.proof);
  assert.equal(signedVc.proof.type, 'JsonWebSignature2020');
  assert.equal(signedVc.proof.verificationMethod, keyIdentifier);

  // Verification succeeds with public key PEM
  const pemValid = VcService.verifyCredentialSignature(signedVc, keyPair.publicKeyPem);
  assert.equal(pemValid, true);

  // Verification succeeds with public key JWK
  const jwkValid = VcService.verifyCredentialSignature(signedVc, keyPair.publicKeyJwk);
  assert.equal(jwkValid, true);

  // Tampering detection
  const tampered = JSON.parse(JSON.stringify(signedVc));
  tampered.credentialSubject.claims['course_name'] = 'Tampered Course';
  assert.equal(VcService.verifyCredentialSignature(tampered, keyPair.publicKeyPem), false);
});

test('5. Deterministic Keccak-256 Merkle Leaf Calculation (Profile Section 5.1)', async () => {
  const credId = 'urn:uuid:leaf-test-1';
  const certNum = 'AUDIT-2026-000003';
  const vcHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

  const leafHash1 = VcService.computeLeafHash(credId, certNum, vcHash);
  const leafHash2 = VcService.computeLeafHash(credId, certNum, vcHash);

  assert.equal(leafHash1, leafHash2);
  assert.ok(leafHash1.startsWith('0x'));
  assert.equal(leafHash1.length, 66);
});

test('6. OpenZeppelin-Compatible Merkle Tree Construction & Commutative Pair Sorting', async () => {
  const a = computeKeccak256('Node Alpha');
  const b = computeKeccak256('Node Beta');

  // Commutative sorted hashing
  const hashAB = CredvailMerkleTree.hashPair(a, b);
  const hashBA = CredvailMerkleTree.hashPair(b, a);
  assert.equal(hashAB, hashBA);

  // Single leaf
  const single = computeKeccak256('Single Leaf');
  const tree1 = new CredvailMerkleTree([single]);
  assert.equal(tree1.getRoot(), single);
  assert.equal(tree1.getLeafCount(), 1);
});

test('7. O(log N) Cryptographic Inclusion Proof Generation & Verification', async () => {
  for (const count of [1, 2, 3, 5, 8, 13]) {
    const leaves = Array.from({ length: count }, (_, i) => computeKeccak256(`Audit-Leaf-${count}-${i}`));
    const tree = VcService.buildBatchMerkleTree(leaves);
    const root = tree.getRoot();

    for (let i = 0; i < count; i++) {
      const proof = VcService.generateMerkleProof(tree, i);
      assert.equal(proof.root, root);
      assert.equal(proof.leafHash, leaves[i]);
      assert.equal(proof.index, i);
      assert.equal(proof.totalLeaves, count);

      const isValid = VcService.verifyMerkleProof(proof.leafHash, proof.proof, proof.root);
      assert.equal(isValid, true, `Proof verification failed for tree size ${count}, leaf index ${i}`);
    }
  }

  // Reject tampered proof
  const leaves = [computeKeccak256('L1'), computeKeccak256('L2'), computeKeccak256('L3')];
  const tree = VcService.buildBatchMerkleTree(leaves);
  const proof = VcService.generateMerkleProof(tree, 0);

  const fakeLeaf = computeKeccak256('Fake');
  assert.equal(VcService.verifyMerkleProof(fakeLeaf, proof.proof, proof.root), false);
});

test('8. End-to-End Batch Processing with Signed VCs & Merkle Evidence', async () => {
  BatchRepository.resetInMemoryStore();
  CredentialRepository.resetInMemoryStore();
  TemplateRepository.resetInMemoryStore();

  const tenantRepo = new TenantRepository();
  const slug = `audit-tenant-${Date.now()}`;
  const tenant = await tenantRepo.createTenant({
    name: 'Audit Institute of Technology',
    slug,
    legalEntityName: 'Audit Institute Inc.',
    websiteUrl: `https://${slug}.edu`,
    didUri: `did:web:credvail.com:tenants:${slug}`,
    ownerUserId: 'usr_audit_owner',
  });

  await KeyManagementService.listKeys(tenant.slug);

  const templateRepo = new TemplateRepository();
  const template = await templateRepo.createTemplate({
    tenantId: tenant.id,
    title: 'Bachelor of Cryptography',
    category: 'COURSE_COMPLETION',
    description: 'Degree Certificate',
    layoutConfig: TEMPLATE_PRESETS.COURSE_COMPLETION.layoutConfig,
  });

  const batch = await BatchRepository.createBatch({
    tenantId: tenant.id,
    templateId: template.id,
    title: 'Audit Batch 2026',
    stagedRecipients: [
      { fullName: 'Claude Shannon', email: 'shannon@bell.com', status: 'VALID', certificateNumberPreview: 'AUDIT-001' },
      { fullName: 'Katherine Johnson', email: 'johnson@nasa.gov', status: 'VALID', certificateNumberPreview: 'AUDIT-002' },
      { fullName: 'Grace Hopper', email: 'hopper@navy.mil', status: 'VALID', certificateNumberPreview: 'AUDIT-003' },
    ],
  });

  const session = {
    sub: 'usr_audit_owner',
    email: 'audit@owner.com',
    fullName: 'Audit Owner',
    platformRole: 'USER',
    currentTenantId: tenant.id,
    currentTenantRole: 'ORG_OWNER',
    tenants: [{ tenantId: tenant.id, slug: tenant.slug, name: tenant.name, role: 'ORG_OWNER' }],
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    jti: 'jti_aud_1',
  };

  const result = await BatchProcessingService.processBatch(tenant.slug, batch.id, session);

  assert.equal(result.status, 'GENERATED');
  assert.equal(result.totalProcessed, 3);
  assert.ok(result.merkleRoot);
  assert.ok(result.merkleRoot.startsWith('0x'));

  // Verify credentials in repository
  const { items } = await CredentialRepository.listCredentials(tenant.id, { batchId: batch.id });
  assert.equal(items.length, 3);

  const { key: activeKey } = await KeyManagementService.getActiveSigningKey(tenant.slug, session);

  for (const item of items) {
    const vc = item.vcPayloadJson;
    assert.equal(vc['@context'].includes('https://www.w3.org/ns/credentials/v2'), true);
    assert.ok(vc.proof);

    // Cryptographic signature validity
    const sigValid = VcService.verifyCredentialSignature(vc, activeKey.publicKeyPem);
    assert.equal(sigValid, true);

    // Merkle proof inclusion validity
    const proof = await CredentialRepository.getMerkleProof(tenant.id, item.id);
    assert.ok(proof);
    assert.equal(proof.root, result.merkleRoot);
    const proofValid = VcService.verifyMerkleProof(proof.leafHash, proof.proof, proof.root);
    assert.equal(proofValid, true);
  }
});

test('9. Tenant Isolation & Access Control Barriers', async () => {
  const tenantRepo = new TenantRepository();
  const slugAlpha = `alpha-${Date.now()}`;
  const slugBeta = `beta-${Date.now()}`;

  const tenantAlpha = await tenantRepo.createTenant({
    name: 'Alpha Inst',
    slug: slugAlpha,
    legalEntityName: 'Alpha Inst Inc.',
    websiteUrl: `https://${slugAlpha}.edu`,
    didUri: `did:web:credvail.com:tenants:${slugAlpha}`,
    ownerUserId: 'usr_alpha',
  });

  const tenantBeta = await tenantRepo.createTenant({
    name: 'Beta Inst',
    slug: slugBeta,
    legalEntityName: 'Beta Inst Inc.',
    websiteUrl: `https://${slugBeta}.edu`,
    didUri: `did:web:credvail.com:tenants:${slugBeta}`,
    ownerUserId: 'usr_beta',
  });

  const sessionBeta = {
    sub: 'usr_beta',
    email: 'beta@user.com',
    fullName: 'Beta User',
    platformRole: 'USER',
    currentTenantId: tenantBeta.id,
    currentTenantRole: 'ORG_OWNER',
    tenants: [{ tenantId: tenantBeta.id, slug: tenantBeta.slug, name: tenantBeta.name, role: 'ORG_OWNER' }],
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    jti: 'jti_beta',
  };

  // Cross-tenant credential lookup returns null
  const crossProof = await CredentialRepository.getMerkleProof(tenantBeta.id, 'cred_fake_alpha_id');
  assert.equal(crossProof, null);

  // Cross-tenant batch processing rejected with Forbidden
  await assert.rejects(
    async () => {
      await BatchProcessingService.processBatch(tenantAlpha.slug, 'batch_fake', sessionBeta);
    },
    { message: /Forbidden/ }
  );
});
