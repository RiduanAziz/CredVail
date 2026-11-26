# CREDVAIL Feature Acceptance Report: Registration System Remediation & Dual Account Onboarding

**Report Date:** 2026-11-26  
**Branch:** `main`  
**Status:** Implemented & Verified (Application, Unit, Integration, Build, Live SSR/HTTP E2E: **PASS**; Live PostgreSQL DB Execution & Chrome DevTools UI Automation: **BLOCKED** by local environment infrastructure)

---

## 1. Executive Summary

CREDVAIL's registration pipeline was remediated from a fragile, non-atomic two-request client flow (`POST /api/v1/auth/register` followed by `POST /api/v1/tenants`) into a single-transaction, email-verified dual-onboarding architecture sharing one unified `User` identity model:

1. **Account Selection (`/register`):** Dedicated selection hub linking cleanly to institutional registration (`/register/institution`), public holder wallet registration (`/register/wallet`), and existing-account sign-in (`/login`).
2. **Institutional Onboarding (`/register/institution`):** Three-step enterprise registration wizard (**Step 1: Account Administrator**, **Step 2: Institution Information**, **Step 3: Review and Submit**) that validates each step, preserves form state across Back/Section Edit navigation, checks authority & legal consents, and submits one atomic request (`POST /api/v1/auth/register/institution`).
3. **Personal Wallet Onboarding (`/register/wallet`):** Streamlined individual registration (`POST /api/v1/auth/register/wallet`) with zero tenant overhead and browser-side IndexedDB holder vault readiness upon email verification.
4. **Atomic Persistence & Security Hardening:**
   - Single Prisma `$transaction` (plus rollback-guarded development in-memory store fallback) creating `User`, `Tenant` (always `PENDING`), `TenantMembership` (`ORG_OWNER`), and `EmailVerificationToken` together.
   - Zero session cookie (`credvail_session`) issuance prior to email verification across `/api/v1/auth/register`, `/api/v1/auth/register/wallet`, and `/api/v1/auth/register/institution`.
   - Login fail-closed enforcement returning HTTP `403` (`EMAIL_NOT_VERIFIED`) until the user completes single-use SHA-256 verification at `/verify-email` (`POST /api/v1/auth/verify-email`).
   - Password policy updated to **NIST SP 800-63B-4** guidance (Unicode NFKC normalization, 15–128 characters, spaces & international scripts supported, no arbitrary character-class rules, common/repetitive & email-substring rejection, Argon2id hashing) with client-safe separation (`src/lib/auth/password-policy.ts`) so `@node-rs/argon2` stays strictly server-only.

---

## 2. Root Causes Identified & Eliminated

| Defect | Root Cause | Remediation |
| :--- | :--- | :--- |
| Partial / orphaned institutional accounts | `register/page.tsx` previously called `POST /api/v1/auth/register` then `POST /api/v1/tenants` sequentially | Consolidated into `RegistrationService.registerInstitution()` with single-request `POST /api/v1/auth/register/institution` wrapped in a Prisma `$transaction` and rollback cleanup |
| Unverified accounts granted active sessions | Registration routes previously issued/implied immediate progression without requiring confirmed email ownership | Removed session cookie issuance from all registration endpoints; added `EmailVerificationToken` + `/verify-email` + `403 EMAIL_NOT_VERIFIED` login gate |
| Client bundle build failure with `@node-rs/argon2` | Client Components imported Zod schemas/helpers from `src/lib/auth/password.ts`, dragging native `@node-rs/argon2` into webpack browser chunks | Split isomorphic policy into `src/lib/auth/password-policy.ts` and kept Argon2id hashing/verification server-only in `src/lib/auth/password.ts` |
| Rigid institutional metadata & required website | Schema and settings required `websiteUrl` and lacked structured institution type, registration ID/authority, country, and address fields | Extended Prisma `Tenant` & `User` schema, made `websiteUrl` optional/nullable across `TenantRepository`, `TenantService`, and `[slug]/settings`, and added `OrganizationType` enum |

---

## 3. Architecture & Implemented Files

### Database Schema & Migrations
- `prisma/schema.prisma` — Added `enum OrganizationType`, extended `User` (`preferredDisplayName`, `jobTitle`, `phoneNumber`, `termsAcceptedAt`, `privacyAcceptedAt`, `termsVersion`, `privacyVersion`, `marketingOptIn`, `emailVerificationTokens`), extended `Tenant` (nullable `websiteUrl`, `organizationType`, `organizationTypeOther`, `countryCode`, `registrationNumber`, `registrationAuthority`, `addressLine1`, `addressLine2`, `city`, `region`, `postalCode`, `contactPhone`, `adminContactPosition`, `authorizedToRegisterAt`), and added `model EmailVerificationToken`.
- `prisma/migrations/20261126000000_dual_onboarding/migration.sql` — Additive idempotent PostgreSQL DDL migration.

### Authentication, Validation, Email & Domain Services
- `src/lib/auth/password-policy.ts` — Client-safe NIST SP 800-63B-4 policy (`PASSWORD_MIN_LENGTH = 15`, `PASSWORD_MAX_LENGTH = 128`, `normalizePasswordInput`, `passwordSchema`, `evaluatePasswordStrength`, `isPasswordTooSimilarToEmail`).
- `src/lib/auth/password.ts` — Server-only Argon2id hashing/verification re-exporting `password-policy.ts`.
- `src/lib/validation/registration.ts` — Shared Zod schemas (`ORGANIZATION_TYPES`, `ORGANIZATION_TYPE_VALUES`, `ISO_COUNTRIES`, `adminStepSchema`, `institutionStepSchema`, `reviewConsentSchema`, `institutionRegistrationSchema`, `walletRegistrationSchema`).
- `src/lib/repositories/email-verification-repository.ts` — SHA-256 hashed single-use token store (`credvail_evf_...` tokens, atomic consumption, prior-token invalidation).
- `src/lib/email/verification-mailer.ts` — Multi-provider verification mailer (`resend`, `webhook`, `mock`, `dev-preview`) plus outbox & failure-simulation helpers.
- `src/lib/services/registration-service.ts` — `RegistrationService` (`registerWallet`, `registerInstitution`, `verifyEmail`, `resendVerification`, `getPostLoginRedirectPath`, `PrivilegeEscalationError`, `SlugConflictError`).
- `src/lib/services/auth-service.ts` — Unverified login gate (`EmailNotVerifiedError`), extended user profile DTO, and `redirectPath` resolution.
- `src/lib/services/tenant-service.ts`, `src/lib/repositories/tenant-repository.ts`, `src/lib/repositories/user-repository.ts` — Expanded institutional & user metadata support with nullable `websiteUrl`.
- `src/lib/services/api-rate-limiter.ts` — Added `AUTH_REGISTER_INSTITUTION`, `AUTH_REGISTER_WALLET`, `AUTH_VERIFY_EMAIL`, and `AUTH_RESEND_VERIFICATION` rate limit profiles.
- `.env.example` — Documented `EMAIL_PROVIDER`, `EMAIL_FROM`, `RESEND_API_KEY`, `EMAIL_WEBHOOK_URL`, and `EMAIL_WEBHOOK_BEARER_TOKEN`.

### API Endpoints
- `src/app/api/v1/auth/register/route.ts` (never issues unverified session cookie)
- `src/app/api/v1/auth/register/wallet/route.ts`
- `src/app/api/v1/auth/register/institution/route.ts`
- `src/app/api/v1/auth/verify-email/route.ts`
- `src/app/api/v1/auth/resend-verification/route.ts`
- `src/app/api/v1/auth/login/route.ts` (`403 EMAIL_NOT_VERIFIED` + `Cache-Control: no-store`)
- `src/app/api/v1/tenants/[slug]/route.ts` & `src/app/api/v1/auth/me/route.ts`

### Frontend Routes & Components
- `src/components/auth/PasswordStrengthField.tsx` — Accessible strength bar, visibility toggle, and match feedback.
- `src/app/(auth)/register/page.tsx` — Dual onboarding selection page.
- `src/app/(auth)/register/institution/page.tsx` — 3-step institutional wizard with country-adaptive address labels and single-request atomic submit.
- `src/app/(auth)/register/wallet/page.tsx` — Streamlined personal wallet onboarding.
- `src/app/(auth)/verify-email/page.tsx` — Token verification landing page, `BrowserWalletEngine` initialization, and resend flow.
- `src/app/(auth)/login/page.tsx` — Inline unverified email recovery UX and `redirectPath` routing (`/wallet`, `/${slug}`, `/admin`).
- `src/app/(dashboard)/[slug]/page.tsx` & `src/app/(dashboard)/[slug]/settings/page.tsx` — Nullable `websiteUrl` guard and institutional classification/location profile rendering.
- `src/components/layout/Navbar.tsx` & `src/components/layout/Footer.tsx` — Public route layout awareness for `/verify-email`.

---

## 4. Verification Matrix & Results

| Check | Command / Target | Outcome | Scope & Notes |
| :--- | :--- | :--- | :--- |
| Prisma Schema Validation & Client Generation | `npx prisma validate; npx prisma generate` | **PASS** | Schema valid; Prisma Client regenerated cleanly |
| TypeScript Static Typecheck | `npx tsc --noEmit` | **PASS** | Exit code `0` across entire codebase and test suite after final edit |
| Vitest Unit Test Suite | `npx vitest run test/unit` | **PASS** | `52` test files passed (`415` tests passed, `0` failed), including `test/unit/dual-registration.test.ts` (`9/9`) and `test/unit/auth-argon2.test.ts` (`3/3`) |
| Vitest Integration Suite (Non-PG) | `npx vitest run test/integration --exclude "test/integration/postgres-*.test.ts"` | **PASS** | `11` test files passed (`19` tests passed, `0` failed) |
| Node Verification Suite | `npm test` | **PASS** | `120` tests passed, `0` failed across phases `0`–`13` and `verify-vfx-02` |
| Next.js Production Build | `npm run build` | **PASS** | Compiled cleanly in `66s`; generated `38/38` static pages plus dynamic API routes including `/register`, `/register/institution`, `/register/wallet`, `/verify-email`, and `/login` |
| Live SSR & HTTP E2E Against Dev Server | `http://localhost:3002` via Node `fetch` harness | **PASS** | Verified SSR HTTP `200` on `/register`, `/register/wallet`, `/register/institution`, `/verify-email`, `/login`; wallet registration `201` with no cookie; unverified login rejected (`403 EMAIL_NOT_VERIFIED`); single-use verification `200` + `credvail_session` cookie + `/wallet` routing; token replay rejected (`400`); `/api/v1/auth/me` verified (`200`); atomic institutional registration `201` (`PENDING`) + `/api/v1/tenants/[slug]` institutional metadata persisted (`200`) |
| Live PostgreSQL Integration Test (`postgres-dual-registration.test.ts`) | `REQUIRE_POSTGRES_INTEGRATION=true` against `localhost:5432` | **BLOCKED** | No PostgreSQL instance is running on `localhost:5432` in this local environment; test suite is skipped by default unless `REQUIRE_POSTGRES_INTEGRATION="true"` with a live PostgreSQL server |
| Live Chrome DevTools Browser UI Automation | `browser` subagent (`chrome_devtools`) on `http://localhost:3002` | **BLOCKED** | Chrome remote debugging was unavailable (`DevToolsActivePort` not found / `chrome://inspect/#remote-debugging` not enabled) |

---

## 5. Remaining Environment Prerequisites for Production / Full Live DB Rollout

1. **Apply Migration in PostgreSQL Environments:** Run `npx prisma migrate deploy` (or `prisma/migrations/20261126000000_dual_onboarding/migration.sql`) against a live PostgreSQL database before deploying.
2. **Execute Skipped PostgreSQL Suite in CI / Staging with DB:**
   ```bash
   REQUIRE_POSTGRES_INTEGRATION=true npx vitest run test/integration/postgres-dual-registration.test.ts
   ```
3. **Configure Production Email Provider:** Set `EMAIL_PROVIDER=resend` (with `RESEND_API_KEY` and verified `EMAIL_FROM`) or `EMAIL_PROVIDER=webhook` (with `EMAIL_WEBHOOK_URL` and `EMAIL_WEBHOOK_BEARER_TOKEN`) in production environment variables.
