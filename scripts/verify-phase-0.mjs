/**
 * CREDVAIL Phase 0 Audit & Architecture Verification Test Suite
 * 
 * Verifies that all Phase 0 requirements, architectural specifications,
 * database models, API routes, cryptographic profiles, and STRIDE threats
 * are rigorously defined and complete before proceeding to Phase 1.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = path.resolve('.');
const ARCH_DIR = path.join(ROOT_DIR, 'docs', 'architecture');

test('Phase 0 File Completeness Check', async (t) => {
  const requiredFiles = [
    'PHASE_0_SPECIFICATION.md',
    'DATABASE_SCHEMA.md',
    'API_SPECIFICATION.md',
    'CRYPTOGRAPHIC_PROFILE.md',
    'THREAT_MODEL_STRIDE.md',
    'RESEARCH_METHODOLOGY.md'
  ];

  for (const file of requiredFiles) {
    const filePath = path.join(ARCH_DIR, file);
    assert.ok(fs.existsSync(filePath), `Required architectural specification file missing: ${file}`);
    const stats = fs.statSync(filePath);
    assert.ok(stats.size > 1000, `Specification file ${file} is unexpectedly brief (${stats.size} bytes)`);
  }
});

test('Functional Modules A through M Coverage Check', async (t) => {
  const specContent = fs.readFileSync(path.join(ARCH_DIR, 'PHASE_0_SPECIFICATION.md'), 'utf-8');
  
  const modules = [
    'Authentication and Institution Management', // Module A
    'Certificate Template Designer',              // Module B
    'Ingestion & Bulk Generation',                // Module C
    'Digital Certificate Dashboard',              // Module D
    'Verifiable Credential',                      // Module E
    'Blockchain',                                 // Module F
    'QR',                                         // Module G
    'Wallet',                                     // Module H
    'Selective Disclosure',                       // Module I
    'Challenge',                                  // Module J
    'Revocation',                                 // Module K
    'Freshness-Aware',                            // Module L
    'Audit'                                       // Module M
  ];

  for (const mod of modules) {
    const regex = new RegExp(mod, 'i');
    assert.match(specContent, regex, `Module '${mod}' must be covered in Phase 0 specification`);
  }
});

test('Database Multi-Tenant Isolation & Entity Integrity', async (t) => {
  const dbSpec = fs.readFileSync(path.join(ARCH_DIR, 'DATABASE_SCHEMA.md'), 'utf-8');
  
  const requiredEntities = [
    'Tenant',
    'User',
    'TenantMembership',
    'IssuerKey',
    'CertificateTemplate',
    'Recipient',
    'IssuanceBatch',
    'CredentialRecord',
    'StatusSnapshot',
    'ChallengeNonce',
    'AuditLog'
  ];

  for (const entity of requiredEntities) {
    assert.match(dbSpec, new RegExp(`model\\s+${entity}|${entity}\\s+\\(`, 'i'), `Entity ${entity} must be specified`);
  }

  // Verify mandatory tenantId isolation on tenant-scoped models
  const tenantScopedEntities = [
    'IssuerKey',
    'CertificateTemplate',
    'Recipient',
    'IssuanceBatch',
    'CredentialRecord',
    'StatusSnapshot'
  ];

  for (const entity of tenantScopedEntities) {
    assert.ok(
      dbSpec.includes(entity) && dbSpec.includes('tenantId'),
      `Entity ${entity} must enforce multi-tenant isolation via tenantId`
    );
  }
});

test('Cryptographic Primitives & Profile Conformance', async (t) => {
  const cryptoSpec = fs.readFileSync(path.join(ARCH_DIR, 'CRYPTOGRAPHIC_PROFILE.md'), 'utf-8');

  // Verify standards and algorithms
  assert.match(cryptoSpec, /Verifiable Credentials Data Model/i, 'Must conform to Verifiable Credentials Data Model');
  assert.match(cryptoSpec, /2\.0/i, 'Must target version 2.0');
  assert.match(cryptoSpec, /did:web/i, 'Must support did:web issuer identity');
  assert.match(cryptoSpec, /did:key/i, 'Must support did:key holder binding');
  assert.match(cryptoSpec, /ecdsa-sd-2023/i, 'Must support ECDSA-SD-2023 selective disclosure');
  assert.match(cryptoSpec, /Bitstring Status List/i, 'Must support W3C Bitstring Status List');
  assert.match(cryptoSpec, /Keccak-256|RFC 6962/i, 'Must support Keccak-256 / RFC 6962 Merkle tree');
  assert.match(cryptoSpec, /Argon2id/i, 'Must enforce Argon2id password hashing');

  // Verify 5-state verification outcome engine
  const states = ['VALID_CURRENT', 'REVOKED', 'AUTHENTICITY_ONLY', 'STATUS_UNKNOWN', 'INVALID'];
  for (const state of states) {
    assert.ok(cryptoSpec.includes(state), `Verification state machine must define '${state}'`);
  }
});

test('STRIDE Threat Model & Defense Mapping', async (t) => {
  const strideSpec = fs.readFileSync(path.join(ARCH_DIR, 'THREAT_MODEL_STRIDE.md'), 'utf-8');

  const threats = [
    'Spoofing',
    'Tampering',
    'Repudiation',
    'Information Disclosure',
    'Denial of Service',
    'Elevation of Privilege'
  ];

  for (const threat of threats) {
    assert.match(strideSpec, new RegExp(threat, 'i'), `STRIDE threat category '${threat}' must be analyzed`);
  }

  // Check specific high-priority defenses
  assert.match(strideSpec, /formula injection/i, 'Formula injection defense must be documented');
  assert.match(strideSpec, /challenge nonce/i, 'Challenge nonce replay defense must be documented');
  assert.match(strideSpec, /tenant isolation/i, 'Cross-tenant elevation of privilege defense must be documented');
});

test('Empirical Thesis Methodology & Metrics M1-M7', async (t) => {
  const researchSpec = fs.readFileSync(path.join(ARCH_DIR, 'RESEARCH_METHODOLOGY.md'), 'utf-8');

  // Verify formal hypotheses
  assert.match(researchSpec, /Hypothesis 1/i, 'Hypothesis 1 must be formulated');
  assert.match(researchSpec, /Hypothesis 2/i, 'Hypothesis 2 must be formulated');
  assert.match(researchSpec, /Hypothesis 3/i, 'Hypothesis 3 must be formulated');

  // Verify metrics M1 through M7
  for (let i = 1; i <= 7; i++) {
    assert.match(researchSpec, new RegExp(`M${i}`, 'i'), `Metric M${i} must be specified`);
  }
});

test('Local Development Environment Pre-flight', async (t) => {
  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
  assert.ok(nodeMajor >= 18, `Node.js version must be >= 18 (current: ${process.versions.node})`);
  assert.ok(fs.existsSync(path.join(ROOT_DIR, 'package.json')) || fs.existsSync(path.join(ROOT_DIR, 'README.md')), 'Workspace root verified');
});
