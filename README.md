# CREDVAIL

> **Blockchain-Verified, Privacy-Preserving Digital Credential Infrastructure**

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Phase](https://img.shields.io/badge/Phase-Phase_0_Complete-success.svg)](#development-phases)
[![Node](https://img.shields.io/badge/Node-v24.x-green.svg)](https://nodejs.org)
[![Solidity](https://img.shields.io/badge/Solidity-^0.8.24-lightgrey.svg)](https://soliditylang.org/)

---

## 1. Project Overview

**CREDVAIL** is a secure, multi-tenant digital credential infrastructure enabling universities, schools, training centers, professional organizations, and enterprises to design, issue, manage, and cryptographically verify digital certificates and credentials.

The platform provides a dual-layer credentialing architecture:
1. **Human-Centric Digital Certificate Management:** Multi-tenant dashboard, drag-and-drop template designer, CSV/XLSX bulk ingestion with formula injection protection, collision-safe certificate numbering, and print-ready vector PDF generation with embedded QR codes.
2. **Cryptographic Trust & Verification Infrastructure:** W3C Verifiable Credentials Data Model 2.0 credential structures, W3C `did:web` institutional identity, ECDSA P-256 signing in the current prototype, Ethereum Sepolia-compatible Merkle-root batch anchoring, status-list snapshots, and freshness-aware verification. Standards-compliant selective disclosure is a planned capability and is intentionally disabled until a maintained W3C `ecdsa-sd-2023` cryptosuite is integrated.

---

## Current Security-Hardening Status

The `security/hardening-selective-disclosure` branch and [draft PR #1](https://github.com/RiduanAziz/CredVail/pull/1) intentionally disable the legacy custom disclosure-token implementation. Do not describe the current implementation as W3C ECDSA-SD-2023 or zero-knowledge selective disclosure.

The previous benchmark runner is also blocked because its blockchain state was simulated by default and some gas values were hard-coded. Existing benchmark artifacts are development diagnostics, not final thesis evidence. See [Security Remediation Status](docs/security/REMEDIATION_STATUS.md).

---

## 2. Research Novelty & Thesis Contribution

CREDVAIL addresses the critical trilemma in academic and vocational credentialing: **Gas Scalability vs. Revocation Freshness vs. Holder Privacy**.

- **Dual-Layer Status Anchoring:** Batch issuance is anchored on Ethereum Sepolia using Keccak-256 Merkle roots ($\mathcal{O}(1)$ gas scaling for $N$ credentials), while credential status (active/revoked) is maintained via off-chain W3C Bitstring Status Lists whose periodic cryptographic commitments are anchored on-chain.
- **Key Epoch & Compromise Disambiguation:** Differentiates between routine key rotation (preserving historical credentials signed during valid epochs) and key compromise (enforcing emergency revocation).
- **5-State Verification Semantics:**
  - `VALID_CURRENT`
  - `REVOKED`
  - `AUTHENTICITY_ONLY`
  - `STATUS_UNKNOWN`
  - `INVALID`

---

## 3. Technology Stack

- **Frontend:** Next.js 15 (App Router), TypeScript, Tailwind CSS, `shadcn/ui`, Lucide Icons.
- **Backend:** Next.js Route Handlers, Zod, modular Service/Repository architecture.
- **Database:** PostgreSQL, Prisma ORM.
- **Authentication:** Argon2id password hashing, secure session management, multi-tenant RBAC.
- **Blockchain:** Ethereum Sepolia Testnet, Solidity `^0.8.24`, OpenZeppelin Contracts v5, Foundry, Viem.
- **Credentials & Cryptography:** W3C VC Data Model 2.0 structures, W3C `did:web` / `did:key`, ECDSA P-256 prototype signatures, Keccak-256 Merkle trees, and status-list snapshot anchoring. The current status-list payload still requires migration and conformance testing against W3C Bitstring Status List v1.0. Selective disclosure is disabled pending standards-suite integration.
- **Document Processing:** PDF generation, QR code generation, CSV/XLSX sanitized parser, streaming ZIP generation.
- **Testing:** Vitest, Playwright, Foundry, automated benchmark suite.

---

## 4. Architectural Documentation

Complete Phase 0 architectural specifications:
- [Master Implementation Plan & Roadmap](docs/MASTER_ROADMAP.md)
- [Phase 0 Master Specification](docs/architecture/PHASE_0_SPECIFICATION.md)
- [Database Schema & ER Architecture](docs/architecture/DATABASE_SCHEMA.md)
- [REST API Contract & Endpoints](docs/architecture/API_SPECIFICATION.md)
- [Cryptographic Profile & Standards](docs/architecture/CRYPTOGRAPHIC_PROFILE.md)
- [STRIDE Threat Model & Security Checklist](docs/architecture/THREAT_MODEL_STRIDE.md)
- [Thesis Research Methodology & Evaluation Harness](docs/architecture/RESEARCH_METHODOLOGY.md)

---

## 5. Development Phases

The engineering lifecycle follows the 16-phase security-first roadmap defined in [docs/MASTER_ROADMAP.md](docs/MASTER_ROADMAP.md):

- [x] **PHASE 0:** Project Baseline and Engineering Governance
- [x] **PHASE 1:** Engineering Infrastructure and CI Quality Gates
- [ ] **PHASE 2:** Production Security and Persistence Hardening (In Progress / Remediation)
- [ ] **PHASE 3:** Authentication, Organizations and Multi-Tenant RBAC
- [ ] **PHASE 4:** Issuer Identity and Cryptographic Key Management
- [ ] **PHASE 5:** Certificate Template Designer
- [ ] **PHASE 6:** Recipient Management and Spreadsheet Import
- [ ] **PHASE 7:** Credential Issuance and Document Generation
- [ ] **PHASE 8:** Claim Invitations and Single-Owner Credential Authorization (H1.3.3.1)
- [ ] **PHASE 9:** Holder Wallet and Holder Identity
- [ ] **PHASE 10:** Public Credential Verification
- [ ] **PHASE 11:** Revocation, Status Lists and Credential Lifecycle
- [ ] **PHASE 12:** Blockchain Anchoring and Smart Contract Reliability
- [ ] **PHASE 13:** Audit Logs, Analytics and Reporting
- [ ] **PHASE 14:** Privacy-Preserving Presentations and Interoperability
- [ ] **PHASE 15:** SaaS Commercialization and Platform Administration
- [ ] **PHASE 16:** Production Deployment and Operational Readiness

---

## 6. License

This project is licensed under the [Apache License 2.0](LICENSE).
