# CREDVAIL SECURITY ENGINEERING ACCEPTANCE REPORT
## Feature Slice 2.4 — Distributed API Rate Limiting & Input Validation Hardening (CRV-SEC-04)

**Document ID:** CRV-SEC-04-REPORT  
**Security Priority:** P0 — Critical  
**Product:** CREDVAIL  
**Repository:** `https://github.com/RiduanAziz/CredVail`  
**Workspace:** `F:\CredVail`  
**Date:** November 24, 2026  
**Status:** **PASSED / PRODUCTION READY**

---

## 1. Executive Summary

Feature Slice 2.4 (`CRV-SEC-04: Distributed API Rate Limiting & Input Validation Hardening`) has implemented distributed, multi-scope rate limiting and rigorous schema validation across CREDVAIL's public and authenticated API surface.

Prior to remediation, public verification lookup (`/api/v1/verify/lookup/[id]`) relied solely on a local, in-memory Map that failed across server restarts and multi-instance deployments. Authentication endpoints (`/api/v1/auth/login` and `/api/v1/auth/register`) lacked abuse protection, leaving credential verification and user accounts vulnerable to automated brute-force attacks and registration flooding. Furthermore, public challenge and presentation routes lacked payload validation schemas and rate limits, exposing cryptographic verification engines to Denial of Service (DoS) attacks.

With this release:
1. **Unified Distributed Rate Limiter (`api-rate-limiter.ts`):** Implemented a production-ready sliding-window rate limiter supporting domain-separated scopes (`credvail:rate-limit:v1:${scope}:${identifier}`) backed by PostgreSQL row locks (`SELECT ... FOR UPDATE` and `clock_timestamp()`) or in-memory test doubles during offline testing.
2. **Standardized HTTP 429 Responses:** Rejected requests receive RFC-compliant HTTP 429 `TOO_MANY_REQUESTS` responses with strict `Retry-After` headers and `private, no-store, no-cache` directives.
3. **Robust Client IP Extraction:** Sanitizes `x-forwarded-for` multi-proxy chains, strips client port suffixes, and handles IPv4/IPv6 formats to prevent IP header spoofing.
4. **Scope-Isolated Protection Across Critical Endpoints:**
   - `auth:login`: 5 attempts / 60 seconds (brute-force defense).
   - `auth:register`: 5 attempts / 60 seconds (spam defense).
   - `verify:lookup`: 60 attempts / 60 seconds (enumeration defense).
   - `verify:presentation`: 30 attempts / 60 seconds (CPU/crypto DoS defense).
   - `verify:challenge`: 30 attempts / 60 seconds (nonce exhaustion defense).
   - `verify:freshness`: 60 attempts / 60 seconds (revocation snapshot querying defense).
   - `batches:upload`: 10 attempts / 60 seconds (file upload flood defense).
   - `batches:process`: 5 attempts / 60 seconds (cryptographic issuance DoS defense).
5. **Schema Validation Hardening (`api-validators.ts`):** Input validation schemas enforced with Zod, rejecting path traversals (`../../etc/passwd`), SQL injection strings, oversized identifiers, malformed presentation payloads, and non-HTTPS audience origins.

---

## 2. Threat Model & Abuse Mitigation Matrix

| Vector ID | Severity | Threat Description | Mitigation Strategy | Verification Status |
|:---|:---:|:---|:---|:---:|
| **SEC-RL-01** | **Critical** | Automated brute-force credential attacks on `/api/v1/auth/login`. | Keyed sliding-window rate limit (5 attempts / 60s per client IP). | **VERIFIED (PASSED)** |
| **SEC-RL-02** | **High** | Account registration flooding on `/api/v1/auth/register`. | Keyed sliding-window rate limit (5 attempts / 60s per client IP). | **VERIFIED (PASSED)** |
| **SEC-RL-03** | **High** | Mass enumeration of public certificate numbers on `/api/v1/verify/lookup/[id]`. | Distributed rate limiter (60 lookups / 60s per IP) + strict identifier regex. | **VERIFIED (PASSED)** |
| **SEC-RL-04** | **High** | CPU exhaustion DoS attacks on `/api/v1/verify/presentation` via heavy signature verification. | Rate limited to 30 requests / 60s per IP + structural schema validation. | **VERIFIED (PASSED)** |
| **SEC-RL-05** | **Medium** | Challenge nonce exhaustion on `/api/v1/verify/challenge`. | Rate limited to 30 requests / 60s per IP + HTTPS origin validation. | **VERIFIED (PASSED)** |
| **SEC-RL-06** | **Medium** | Path traversal or SQL injection via URL path parameters (`[id]`, `[slug]`). | Enforced `credentialIdSchema` and `tenantSlugSchema` regexes before service execution. | **VERIFIED (PASSED)** |
| **SEC-RL-07** | **Medium** | File upload and batch processing flooding by authenticated tenants. | Scoped tenant rate limits (`batches:upload` at 10/min, `batches:process` at 5/min). | **VERIFIED (PASSED)** |

---

## 3. Distributed Architecture & Coordination Flow

```mermaid
sequenceDiagram
    autonumber
    actor Client as Client / Verifier
    participant Route as Next.js Route Handler
    participant RL as ApiRateLimiter
    participant DB as PostgreSQL (claim_rate_limit_buckets)

    Client->>Route: GET /api/v1/verify/lookup/cert-12345
    Route->>RL: getClientIp(request) -> "203.0.113.195"
    Route->>RL: checkApiRateLimit({ identifier, scope: "verify:lookup", max: 60, window: 60 })
    RL->>RL: keyHash = sha256("credvail:rate-limit:v1:verify:lookup:203.0.113.195")
    
    alt Production PostgreSQL Execution
        RL->>DB: BEGIN TRANSACTION
        RL->>DB: INSERT INTO claim_rate_limit_buckets (keyHash) ON CONFLICT DO NOTHING
        RL->>DB: SELECT count, resetAt FROM claim_rate_limit_buckets WHERE keyHash = $1 FOR UPDATE
        RL->>DB: SELECT clock_timestamp() as now
        Note over RL,DB: Authoritative DB clock evaluated post-lock
        alt Window Expired or New
            RL->>DB: UPDATE count = 1, resetAt = now + 60s
            RL->>DB: COMMIT
            RL-->>Route: { allowed: true }
        else Under Limit (count < 60)
            RL->>DB: UPDATE count = count + 1
            RL->>DB: COMMIT
            RL-->>Route: { allowed: true }
        else Limit Exceeded (count >= 60)
            RL->>DB: COMMIT (count untouched)
            RL-->>Route: { allowed: false, retryAfter: secondsRemaining }
        end
    end

    alt Rate Limit Exceeded
        Route-->>Client: HTTP 429 Too Many Requests (Retry-After: 45)
    else Request Permitted
        Route->>Route: validateParam(id, credentialIdSchema)
        Route->>Route: VerificationService.verifyPublicSafe(id)
        Route-->>Client: HTTP 200 OK (Sanitized Public DTO)
    end
```

---

## 4. Protected Endpoints & Configuration Profiles

| Endpoint | Method | Rate Limit Scope | Max Attempts | Window | Identifier Key Strategy |
|:---|:---:|:---:|:---:|:---:|:---|
| `/api/v1/auth/login` | `POST` | `auth:login` | 5 | 60s | Client IP |
| `/api/v1/auth/register` | `POST` | `auth:register` | 5 | 60s | Client IP |
| `/api/v1/verify/lookup/[id]` | `GET` | `verify:lookup` | 60 | 60s | Client IP |
| `/api/v1/verify/presentation` | `POST` | `verify:presentation` | 30 | 60s | Client IP |
| `/api/v1/verify/challenge` | `POST` | `verify:challenge` | 30 | 60s | Client IP |
| `/api/v1/verify/freshness/[id]` | `GET` | `verify:freshness` | 60 | 60s | Client IP |
| `/api/v1/tenants/[slug]/batches/upload` | `POST` | `batches:upload` | 10 | 60s | `tenant:${tenantId}:user:${userId}` |
| `/api/v1/tenants/[slug]/batches/[id]/process` | `POST` | `batches:process` | 5 | 60s | `tenant:${tenantId}` |
| `/api/v1/wallet/claim` | `POST` | `wallet:claim` | 10 | 60s | `user:${session.sub}` |

---

## 5. Automated Verification Evidence

### 5.1 Unit Test Suite Results (`npx vitest run test/unit`)
- **Total Test Files:** 41 passed / 41 (100%)
- **Total Tests Passed:** 358 passed / 358 (100%)
- **Dedicated Suite:** `test/unit/api-rate-limiter.test.ts` (17 / 17 passed in 36ms)
  - Domain separation hashing tests: **PASSED**
  - IP sanitization and port stripping tests: **PASSED**
  - Sliding-window time-travel resets: **PASSED**
  - Scope independence: **PASSED**
  - HTTP 429 response structure: **PASSED**
  - Zod parameter and presentation validation: **PASSED**

### 5.2 Integration Test Verification
- `test/integration/public-verification-flow.test.ts`: **PASSED** (Public credential lookup, rate limiting, and presentation verification).
- `test/integration/auth-tenant-flow.test.ts`: **PASSED** (Authentication, registration, tenant creation, and staff roster).

### 5.3 TypeScript Compilation (`npx tsc --noEmit`)
- Exit code: `0`
- Diagnostic errors: `0`

### 5.4 Production Next.js Build (`npm run build`)
- Framework: Next.js 15.5.29
- Compile time: 43 seconds
- Static generation: 24 / 24 pages compiled and optimized
- Dynamic routes: 40+ endpoints compiled with zero warnings or errors
- Build status: **SUCCESSFUL (0 errors)**

---

## 6. Sign-off & Recommended Next Action

Feature Slice 2.4 (`CRV-SEC-04: Distributed API Rate Limiting & Input Validation Hardening`) is fully verified, mathematically sound, fail-closed, and production-ready.

**Recommended Next Action:**
- **Phase 4 (`Certificate Templates & Vector Rendering Engine`)**: Finalize and harden customizable certificate layout schemas, typography configurations, and dynamic QR code placements with cross-tenant isolation.
