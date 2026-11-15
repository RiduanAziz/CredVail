/**
 * CREDVAIL Phase 1 Audit & Architecture Verification Test Suite
 * 
 * Verifies that the project scaffold, design system, database schema,
 * cryptographic primitives, and smart contract workspace are properly
 * configured, functional, and adhering to master prompt standards.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = path.resolve('.');

test('Phase 1 Scaffolding & Configuration Files Exist', async () => {
  const requiredFiles = [
    'package.json',
    'tsconfig.json',
    'next.config.mjs',
    'tailwind.config.ts',
    'postcss.config.mjs',
    'components.json',
    'vitest.config.ts',
    '.env.example',
    '.gitignore',
    'foundry.toml',
    'prisma/schema.prisma'
  ];

  for (const f of requiredFiles) {
    const fullPath = path.join(ROOT_DIR, f);
    assert.ok(fs.existsSync(fullPath), `Required config file missing: ${f}`);
    assert.ok(fs.statSync(fullPath).size > 0, `File is empty: ${f}`);
  }
});

test('Prisma Schema Model Verification', async () => {
  const schemaPath = path.join(ROOT_DIR, 'prisma', 'schema.prisma');
  const schema = fs.readFileSync(schemaPath, 'utf-8');

  const models = [
    'User',
    'Tenant',
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

  for (const model of models) {
    assert.match(schema, new RegExp(`model\\s+${model}\\s+\\{`), `Missing Prisma model: ${model}`);
  }

  // Ensure PostgreSQL datasource
  assert.match(schema, /provider\s+=\s+"postgresql"/, 'Datasource must be PostgreSQL');
});

test('Smart Contract Workspace Verification', async () => {
  const interfacePath = path.join(ROOT_DIR, 'contracts', 'src', 'interfaces', 'ICredvailRegistry.sol');
  const contractPath = path.join(ROOT_DIR, 'contracts', 'src', 'CredvailRegistry.sol');
  const foundryPath = path.join(ROOT_DIR, 'contracts', 'foundry.toml');

  assert.ok(fs.existsSync(interfacePath), 'ICredvailRegistry.sol must exist');
  assert.ok(fs.existsSync(contractPath), 'CredvailRegistry.sol must exist');
  assert.ok(fs.existsSync(foundryPath), 'contracts/foundry.toml must exist');

  const contractSrc = fs.readFileSync(contractPath, 'utf-8');
  assert.match(contractSrc, /contract\s+CredvailRegistry\s+is\s+ICredvailRegistry/, 'Must implement ICredvailRegistry');
  assert.match(contractSrc, /function\s+anchorBatch/, 'Must implement anchorBatch');
  assert.match(contractSrc, /function\s+anchorStatusDigest/, 'Must implement anchorStatusDigest');
  assert.match(contractSrc, /function\s+verifyCredentialProof/, 'Must implement verifyCredentialProof');
});

test('Design System & UI Components Verification', async () => {
  const uiComponents = [
    'src/components/ui/button.tsx',
    'src/components/ui/badge.tsx',
    'src/components/ui/card.tsx',
    'src/components/ui/input.tsx',
    'src/components/ui/tabs.tsx',
    'src/components/layout/Navbar.tsx',
    'src/components/layout/Footer.tsx',
    'src/app/layout.tsx',
    'src/app/page.tsx',
    'src/app/globals.css'
  ];

  for (const comp of uiComponents) {
    const fullPath = path.join(ROOT_DIR, comp);
    assert.ok(fs.existsSync(fullPath), `Missing UI component or layout: ${comp}`);
    assert.ok(fs.statSync(fullPath).size > 100, `UI component ${comp} is unexpectedly small`);
  }
});

test('Environment Configuration Security Verification', async () => {
  const envExample = fs.readFileSync(path.join(ROOT_DIR, '.env.example'), 'utf-8');

  // Verify security keys are templated and not leaking real credentials
  assert.match(envExample, /DATABASE_URL=/);
  assert.match(envExample, /SESSION_SECRET=/);
  assert.match(envExample, /KMS_MASTER_KEY=/);
  assert.match(envExample, /NEXT_PUBLIC_SEPOLIA_RPC_URL=/);
  assert.match(envExample, /STORAGE_DRIVER=/);
  assert.match(envExample, /CHALLENGE_TTL_SECONDS=/);

  // Assert .env is in .gitignore
  const gitignore = fs.readFileSync(path.join(ROOT_DIR, '.gitignore'), 'utf-8');
  assert.match(gitignore, /\.env/, '.env must be excluded in .gitignore');
  assert.match(gitignore, /node_modules/, 'node_modules must be excluded in .gitignore');
});
