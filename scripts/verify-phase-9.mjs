/**
 * CREDVAIL Phase 9 Verification Suite: Blockchain Integration & Sepolia Anchoring
 * 
 * Verifies:
 * 1. Phase 9 Scaffolding & Smart Contract Architecture Files Exist
 * 2. CredvailRegistry Solidity Contract & Foundry Test Parity
 * 3. TypeScript Typed ABI Representation & Viem Configuration
 * 4. Multi-Tenant Cryptographic Partitioning & Hash Derivation
 * 5. Institutional Key Epoch Governance & Compromise Invalidation on Sepolia
 * 6. Batch Merkle Root Anchoring (O(1) Scaling) & Deduplication
 * 7. OpenZeppelin-Compatible On-Chain Merkle Proof Verification
 * 8. Status List Digest Anchoring & Freshness Support
 * 9. End-to-End Batch Anchoring & On-Chain Verification Integration Flow
 * 10. Multi-Tenant Security Boundaries & Cross-Tenant Attack Rejection
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { keccak256, toHex } from 'viem';

import { CREDVAIL_REGISTRY_ABI } from '../src/lib/blockchain/credvail-registry-abi.ts';
import { BlockchainService } from '../src/lib/blockchain/blockchain-service.ts';
import { CredvailMerkleTree } from '../src/lib/crypto/merkle.ts';
import { TenantRepository } from '../src/lib/repositories/tenant-repository.ts';
import { TemplateRepository } from '../src/lib/repositories/template-repository.ts';
import { BatchRepository } from '../src/lib/repositories/batch-repository.ts';
import { CredentialRepository } from '../src/lib/repositories/credential-repository.ts';
import { KeyRepository } from '../src/lib/repositories/key-repository.ts';
import { BatchProcessingService } from '../src/lib/services/batch-processing-service.ts';
import { TEMPLATE_PRESETS } from '../src/lib/templates/presets.ts';

const ROOT_DIR = path.resolve('.');

test('1. Phase 9 Scaffolding & Required Architecture Files Exist', () => {
  const requiredFiles = [
    'contracts/src/interfaces/ICredvailRegistry.sol',
    'contracts/src/CredvailRegistry.sol',
    'contracts/test/CredvailRegistry.t.sol',
    'contracts/foundry.toml',
    'src/lib/blockchain/credvail-registry-abi.ts',
    'src/lib/blockchain/blockchain-service.ts',
    'src/app/api/v1/tenants/[slug]/batches/[id]/anchor/route.ts',
    'src/app/api/v1/tenants/[slug]/credentials/[id]/verify-onchain/route.ts',
    'src/app/api/v1/blockchain/status/route.ts',
    'test/unit/blockchain-registry.test.ts',
    'test/integration/blockchain-anchoring-flow.test.ts',
  ];

  for (const relPath of requiredFiles) {
    const fullPath = path.join(ROOT_DIR, relPath);
    assert.ok(fs.existsSync(fullPath), `Required Phase 9 file must exist: ${relPath}`);
  }
});

test('2. CredvailRegistry Solidity Contract & Foundry Test Parity', () => {
  const contractPath = path.join(ROOT_DIR, 'contracts/src/CredvailRegistry.sol');
  const interfacePath = path.join(ROOT_DIR, 'contracts/src/interfaces/ICredvailRegistry.sol');
  const testPath = path.join(ROOT_DIR, 'contracts/test/CredvailRegistry.t.sol');

  const contractSrc = fs.readFileSync(contractPath, 'utf-8');
  const interfaceSrc = fs.readFileSync(interfacePath, 'utf-8');
  const testSrc = fs.readFileSync(testPath, 'utf-8');

  // Interface signatures
  assert.ok(interfaceSrc.includes('registerIssuerKey'), 'Interface must define registerIssuerKey');
  assert.ok(interfaceSrc.includes('rotateIssuerKey'), 'Interface must define rotateIssuerKey');
  assert.ok(interfaceSrc.includes('flagKeyCompromised'), 'Interface must define flagKeyCompromised');
  assert.ok(interfaceSrc.includes('anchorBatch'), 'Interface must define anchorBatch');
  assert.ok(interfaceSrc.includes('verifyCredentialProof'), 'Interface must define verifyCredentialProof');
  assert.ok(interfaceSrc.includes('anchorStatusDigest'), 'Interface must define anchorStatusDigest');

  // Contract implementations
  assert.ok(contractSrc.includes('contract CredvailRegistry is ICredvailRegistry'), 'Contract must implement interface');
  assert.ok(contractSrc.includes('onlyTenantManager(tenantHash)'), 'Must enforce onlyTenantManager modifier');
  assert.ok(contractSrc.includes('computedHash <= proofElement'), 'Must implement OpenZeppelin sorted pair hashing');

  // Foundry test assertions
  assert.ok(testSrc.includes('testOwnerIsDeployer'), 'Foundry tests must test ownership');
  assert.ok(testSrc.includes('testRegisterIssuerKey'), 'Foundry tests must test key registration');
  assert.ok(testSrc.includes('testRotateIssuerKey'), 'Foundry tests must test key rotation');
  assert.ok(testSrc.includes('testFlagKeyCompromised'), 'Foundry tests must test key compromise');
  assert.ok(testSrc.includes('testAnchorBatchAndVerifyProof'), 'Foundry tests must test batch anchor and proof');
  assert.ok(testSrc.includes('testTenantIsolation'), 'Foundry tests must test tenant isolation');
});

test('3. TypeScript Typed ABI Representation & Viem Configuration', () => {
  assert.ok(Array.isArray(CREDVAIL_REGISTRY_ABI), 'ABI must be an array');

  const fnNames = CREDVAIL_REGISTRY_ABI.filter((item) => item.type === 'function').map((f) => f.name);
  const eventNames = CREDVAIL_REGISTRY_ABI.filter((item) => item.type === 'event').map((e) => e.name);

  assert.ok(fnNames.includes('registerIssuerKey'), 'ABI must contain registerIssuerKey');
  assert.ok(fnNames.includes('rotateIssuerKey'), 'ABI must contain rotateIssuerKey');
  assert.ok(fnNames.includes('flagKeyCompromised'), 'ABI must contain flagKeyCompromised');
  assert.ok(fnNames.includes('anchorBatch'), 'ABI must contain anchorBatch');
  assert.ok(fnNames.includes('verifyCredentialProof'), 'ABI must contain verifyCredentialProof');
  assert.ok(fnNames.includes('anchorStatusDigest'), 'ABI must contain anchorStatusDigest');

  assert.ok(eventNames.includes('IssuerKeyRegistered'), 'ABI must contain IssuerKeyRegistered event');
  assert.ok(eventNames.includes('IssuerKeyRotated'), 'ABI must contain IssuerKeyRotated event');
  assert.ok(eventNames.includes('IssuerKeyCompromised'), 'ABI must contain IssuerKeyCompromised event');
  assert.ok(eventNames.includes('BatchAnchored'), 'ABI must contain BatchAnchored event');
  assert.ok(eventNames.includes('StatusDigestAnchored'), 'ABI must contain StatusDigestAnchored event');
});

test('4. Multi-Tenant Cryptographic Partitioning & Hash Derivation', () => {
  const tenantSlug = 'oxford-university';
  const tenantHash = BlockchainService.computeTenantHash(tenantSlug);
  assert.equal(typeof tenantHash, 'string');
  assert.equal(tenantHash.startsWith('0x'), true);
  assert.equal(tenantHash.length, 66);

  // Case & whitespace invariance
  const variantHash = BlockchainService.computeTenantHash('  OXFORD-UNIVERSITY ');
  assert.equal(tenantHash, variantHash);

  // Batch Hash
  const batchId = 'BATCH-2026-9999';
  const batchHash = BlockchainService.computeBatchHash(batchId);
  assert.equal(batchHash.startsWith('0x'), true);
  assert.equal(batchHash.length, 66);
});

test('5. Institutional Key Epoch Governance & Compromise Invalidation on Sepolia', async () => {
  BlockchainService.resetSimulatedState();

  const slug = 'cambridge';
  const fp1 = '0x1111111111111111111111111111111111111111111111111111111111111111';
  const fp2 = '0x2222222222222222222222222222222222222222222222222222222222222222';

  // 1. Register Epoch 1
  const reg1 = await BlockchainService.registerIssuerKey(slug, 1, fp1);
  assert.ok(reg1.txHash.startsWith('0x'), 'Transaction hash must start with 0x');

  const key1 = await BlockchainService.getIssuerKey(slug, 1);
  assert.ok(key1 && key1.exists, 'Key epoch 1 must exist');
  assert.equal(key1.publicKeyFingerprint.toLowerCase(), fp1.toLowerCase());
  assert.equal(key1.isCompromised, false);

  // 2. Rotate to Epoch 2
  const rot = await BlockchainService.rotateIssuerKey(slug, 1, 2, fp2);
  assert.ok(rot.txHash.startsWith('0x'), 'Rotation tx hash must start with 0x');

  const key2 = await BlockchainService.getIssuerKey(slug, 2);
  assert.ok(key2 && key2.exists, 'Key epoch 2 must exist');
  assert.equal(key2.publicKeyFingerprint.toLowerCase(), fp2.toLowerCase());

  // 3. Flag Epoch 1 Compromised
  const compTime = 1763205000;
  const comp = await BlockchainService.flagKeyCompromised(slug, 1, compTime);
  assert.ok(comp.txHash.startsWith('0x'), 'Compromise tx hash must start with 0x');

  const compKey1 = await BlockchainService.getIssuerKey(slug, 1);
  assert.equal(compKey1.isCompromised, true);
  assert.equal(compKey1.compromisedAt, compTime);
});

test('6. Batch Merkle Root Anchoring (O(1) Scaling) & Deduplication', async () => {
  BlockchainService.resetSimulatedState();

  const slug = 'yale';
  const batchId = 'BATCH-YALE-101';
  const root = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

  const anchor = await BlockchainService.anchorBatch(slug, batchId, root, 500);
  assert.ok(anchor.txHash.startsWith('0x'));
  assert.ok(anchor.blockNumber > 0);

  const batch = await BlockchainService.getBatch(slug, batchId);
  assert.ok(batch && batch.exists);
  assert.equal(batch.merkleRoot.toLowerCase(), root.toLowerCase());
  assert.equal(batch.leafCount, 500);

  // Duplicate anchor rejection
  await assert.rejects(
    async () => BlockchainService.anchorBatch(slug, batchId, root, 500),
    /Batch already anchored/
  );
});

test('7. OpenZeppelin-Compatible On-Chain Merkle Proof Verification', async () => {
  BlockchainService.resetSimulatedState();

  const slug = 'princeton';
  const batchId = 'BATCH-PRINCETON-2026';

  const leaves = [
    keccak256(toHex('leaf-0-alice')),
    keccak256(toHex('leaf-1-bob')),
    keccak256(toHex('leaf-2-charlie')),
    keccak256(toHex('leaf-3-diana')),
  ];
  const tree = new CredvailMerkleTree(leaves);
  const root = tree.getRoot();

  await BlockchainService.anchorBatch(slug, batchId, root, leaves.length);

  // Verify all 4 proofs
  for (let i = 0; i < leaves.length; i++) {
    const proof = tree.getProof(i);
    const valid = await BlockchainService.verifyCredentialProof(slug, batchId, leaves[i], proof);
    assert.equal(valid, true, `Proof for leaf ${i} must be valid on-chain`);
  }

  // Reject tampered leaf
  const forgedLeaf = keccak256(toHex('leaf-forged'));
  const fakeValid = await BlockchainService.verifyCredentialProof(slug, batchId, forgedLeaf, tree.getProof(0));
  assert.equal(fakeValid, false, 'Tampered leaf proof must fail on-chain');
});

test('8. Status List Digest Anchoring & Freshness Support', async () => {
  BlockchainService.resetSimulatedState();

  const slug = 'eth-zurich';
  const digest = '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';

  const res = await BlockchainService.anchorStatusDigest(slug, 1, digest);
  assert.ok(res.txHash.startsWith('0x'));

  const rec = await BlockchainService.getStatusDigest(slug, 1);
  assert.ok(rec && rec.exists);
  assert.equal(rec.digestSha256.toLowerCase(), digest.toLowerCase());

  // Duplicate rejection
  await assert.rejects(
    async () => BlockchainService.anchorStatusDigest(slug, 1, digest),
    /Status epoch already exists/
  );
});

test('9. End-to-End Batch Anchoring & On-Chain Verification Integration Flow', async () => {
  TemplateRepository.resetInMemoryStore();
  BatchRepository.resetInMemoryStore();
  CredentialRepository.resetInMemoryStore();
  KeyRepository.resetInMemoryStore();
  BlockchainService.resetSimulatedState();

  const slug = `columbia-uni-${Date.now()}`;
  const tenantRepo = new TenantRepository();
  const tenant = await tenantRepo.createTenant({
    name: 'Columbia University',
    slug,
    legalEntityName: 'The Trustees of Columbia University',
    websiteUrl: 'https://columbia.edu',
    didUri: `did:web:credvail.com:tenants:${slug}`,
    ownerUserId: 'user_hopper',
  });

  const templateRepo = new TemplateRepository();
  const template = await templateRepo.createTemplate({
    tenantId: tenant.id,
    title: 'Computer Science Honors Degree',
    category: 'COURSE_COMPLETION',
    description: 'Degree Certificate',
    layoutConfig: TEMPLATE_PRESETS.COURSE_COMPLETION.layoutConfig,
  });

  const stagedBatch = await BatchRepository.createBatch({
    tenantId: tenant.id,
    templateId: template.id,
    title: 'May 2026 Graduating Class',
    stagedRecipients: [
      {
        fullName: 'Grace Hopper',
        email: 'hopper@columbia.edu',
        certificateNumberPreview: 'CU-2026-0001',
        courseName: 'Advanced Compilers',
        issueDate: '2026-11-15',
        status: 'VALID',
      },
      {
        fullName: 'Alan Turing',
        email: 'turing@columbia.edu',
        certificateNumberPreview: 'CU-2026-0002',
        courseName: 'Automata Theory',
        issueDate: '2026-11-15',
        status: 'VALID',
      },
    ],
  });

  // Process batch (PDFs, VCs, Merkle Tree)
  const processed = await BatchProcessingService.processBatch(slug, stagedBatch.id);
  assert.equal(processed.status, 'GENERATED');
  assert.ok(processed.merkleRoot);

  // Anchor to Sepolia
  const anchorResult = await BlockchainService.anchorBatch(slug, stagedBatch.id, processed.merkleRoot, 2);
  assert.ok(anchorResult.txHash);

  // Update DB state
  await BatchRepository.updateBatchStatus(tenant.id, stagedBatch.id, 'ANCHORED', {
    onChainTxHash: anchorResult.txHash,
    blockchainBlockNumber: anchorResult.blockNumber,
  });

  // Verify on-chain verification of each credential
  const { items } = await CredentialRepository.listCredentials(tenant.id, { batchId: stagedBatch.id });
  assert.equal(items.length, 2);

  for (const cred of items) {
    const proof = await CredentialRepository.getMerkleProof(tenant.id, cred.id);
    assert.ok(proof);
    const verified = await BlockchainService.verifyCredentialProof(slug, stagedBatch.id, cred.leafHash, proof.proof);
    assert.equal(verified, true);
  }
});

test('10. Multi-Tenant Security Boundaries & Cross-Tenant Attack Rejection', async () => {
  BlockchainService.resetSimulatedState();

  const root = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  await BlockchainService.anchorBatch('legitimate-institution', 'BATCH-CONFIDENTIAL', root, 10);

  // Cross-tenant query on malicious tenant must fail
  const badQuery = await BlockchainService.getBatch('attacker-institution', 'BATCH-CONFIDENTIAL');
  assert.equal(badQuery, null);

  const crossVerified = await BlockchainService.verifyCredentialProof('attacker-institution', 'BATCH-CONFIDENTIAL', root, []);
  assert.equal(crossVerified, false);
});
