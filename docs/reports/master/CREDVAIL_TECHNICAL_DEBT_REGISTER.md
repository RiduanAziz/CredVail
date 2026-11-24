# CREDVAIL Technical Debt & Codebase Maintenance Register

**Document ID:** CRV-AUDIT-03-TECHNICAL-DEBT-REGISTER  
**Date:** 2026-11-24  
**Audit Scope:** Codebase Maintainability, Architecture Consistency, Tooling Gaps, and Refactoring Debt  
**Status:** ACTIVE REGISTER  

---

## 1. Technical Debt Classification

Technical debt is classified across four operational dimensions:
1. **Architectural Debt:** Structural patterns that complicate scalability or introduce failure modes.
2. **Tooling & CI/CD Debt:** Incomplete automated pipelines, missing developer tooling, or cross-platform execution issues.
3. **Standards Drift:** Implementations built against draft or legacy specifications requiring modernization.
4. **Code Quality & Testing Debt:** Duplicated mocks, in-memory state leakage, or incomplete test harness integration.

---

## 2. Technical Debt Register

| Debt ID | Category | Item Description | Affected Components | Maintenance Cost & Risk | Recommended Remediation | Priority |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **DEBT-01** | Architecture | **Dual-Mode Repository Implementations.** Repositories (`CredentialRepository`, `BatchRepository`, `TenantRepository`, etc.) maintain parallel in-memory `Map` implementations alongside Prisma queries. | `src/lib/repositories/` (all files) | High: Code bloat, doubled testing footprint, and risk of behavior divergence between dev/test and production. | Adopt repository interface pattern (`ICredentialRepository`) with dedicated `Prisma*` and `InMemory*` classes, injected via dependency injection or factory. | **P1** |
| **DEBT-02** | CI/CD | **Fragmented CI Quality Gates.** `.github/workflows/postgres-claim-concurrency.yml` only runs PostgreSQL concurrency tests. Full `npm test`, TypeScript check, unit test suite, and production build are not wired into a single mandatory PR gate. | `.github/workflows/` | High: Broken builds or type errors can be merged to `main` without triggering CI failure. | Create a unified `ci.yml` workflow with parallel jobs: (1) Lint & Typecheck, (2) Unit Tests, (3) Live PostgreSQL Integration, (4) Production Build. | **P0** |
| **DEBT-03** | Tooling | **Foundry / Forge Missing in Windows Environment.** `contracts/` includes `CredvailRegistry.sol` and `CredvailRegistry.t.sol` configured with Foundry, but Windows developer machines without Linux subsystem lack native `forge` binary. | `contracts/`, `foundry.toml` | Medium: Local developers cannot run smart contract tests without spinning up Docker or WSL. | Add Docker-based contract test script (`npm run test:contracts`) or automated Foundry installation instructions for Windows. | **P2** |
| **DEBT-04** | Testing | **Blocked Benchmark Harness.** Legacy benchmark runner in `scripts/run-benchmarks.mjs` relied on hardcoded gas estimates and simulated in-memory state, and is currently blocked. | `scripts/run-benchmarks.mjs`, `test/benchmark/` | Medium: Cannot empirically validate thesis metrics M1–M7 against real Ethereum Sepolia transactions. | Implement a live measurement harness recording actual Sepolia gas usage, CSV-to-PDF generation latency, and real database query execution times. | **P1** |
| **DEBT-05** | Standards Drift | **Legacy StatusList2021 Payload Format.** The revocation engine uses the 2021 draft status list format instead of the finalized W3C Bitstring Status List v1.0 standard. | `src/lib/services/status-list-service.ts`, `src/app/api/v1/tenants/[slug]/status/` | Medium: Format incompatibility with external W3C 2.0 credential validators. | Refactor bit-indexing, MSB ordering, gzip encoding, and JSON-LD context to conform strictly to W3C Bitstring Status List v1.0. | **P1** |
| **DEBT-06** | Testing | **Browser WebCrypto & IndexedDB Polyfill Gap.** `BrowserWalletEngine` relies on browser `crypto.subtle` and `window.indexedDB`. Node.js test suites cannot execute pure client wallet tests without mock environments. | `src/lib/wallet/browser-wallet.ts`, `test/unit/wallet-vault.test.ts` | Medium: Potential for client-side regression in non-browser environments. | Add headless Playwright browser unit tests to validate SubtleCrypto non-extractable key generation and structured cloning in Chromium/WebKit. | **P2** |
| **DEBT-07** | Framework | **Next.js 15 Async Params Standard.** Next.js 15 App Router expects dynamic route parameters (`params`) to be awaited as a Promise. Most route handlers handle this, but older handlers need consistency review. | `src/app/api/v1/tenants/[slug]/`, `src/app/verify/[id]/` | Low: Console deprecation warnings during server execution. | Audit all dynamic route handlers and ensure `const { id } = await params;` syntax is consistently used. | **P3** |

---

## 3. Debt Reduction Roadmap

1. **Sprint 1 (P0):** Establish unified CI workflow (`DEBT-02`) so every subsequent cleanup is enforced.
2. **Sprint 2 (P1):** Consolidate repository interfaces (`DEBT-01`) and update Status List to W3C Bitstring v1.0 (`DEBT-05`).
3. **Sprint 3 (P2):** Modernize benchmark suite (`DEBT-04`) and add Playwright browser wallet test harness (`DEBT-06`).
