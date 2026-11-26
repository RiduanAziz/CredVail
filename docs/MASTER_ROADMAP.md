# CREDVAIL
## Master Software Engineering Implementation Plan & Product Development Roadmap

**Product:** CREDVAIL  
**Category:** Multi-Tenant Digital Credential Infrastructure SaaS  
**Development Approach:** Security-First, API-Driven, Feature-by-Feature Vertical Slices  
**Primary Architecture:** Modular Monolith with Clearly Separated Domain Services  
**Frontend:** Next.js, React, TypeScript, Tailwind CSS  
**Backend:** Next.js Route Handlers, Service and Repository Architecture  
**Database:** PostgreSQL, Prisma  
**Cryptography:** W3C Verifiable Credentials, DID, digital signatures, cryptographic hashes  
**Blockchain:** Ethereum-compatible network integration  
**Document Processing:** PDF generation, QR codes, CSV/XLSX import  
**Target Users:** Universities, educational institutions, training centers, professional organizations, enterprises, and clubs

---

# 1. Product Vision

CREDVAIL aims to provide a complete digital credential infrastructure through which organizations can issue trustworthy credentials and recipients can independently demonstrate their achievements.

The platform should replace fragmented certificate workflows involving manually generated PDFs, spreadsheets, email attachments, paper certificates, and manual verification.

Its long-term architecture should support:

- Multi-organization credential management.
- Institution-controlled issuer identities.
- Customizable certificate templates.
- Individual and bulk credential issuance.
- Secure credential claiming.
- Single-owner credential authorization.
- Personal digital credential wallets.
- Independent public verification.
- Cryptographic integrity evidence.
- Credential revocation and lifecycle management.
- Optional blockchain anchoring.
- Privacy-preserving credential presentations.
- Institutional analytics and operational reporting.
- Standards-based credential interoperability.

---

# 2. Product Architecture

## 2.1 Logical architecture

The recommended architecture is a modular monolith initially, not an unnecessarily distributed microservice system.

```text
                    CREDVAIL PLATFORM
                            |
          +-----------------+------------------+
          |                 |                  |
     Public Website    Issuer Dashboard   Holder Wallet
          |                 |                  |
          +-----------------+------------------+
                            |
                       API Layer
                            |
        +-------------------+-------------------+
        |                   |                   |
   Authentication      Tenant & RBAC      Credential APIs
        |                   |                   |
        +-------------------+-------------------+
                            |
                      DOMAIN SERVICES
                            |
     +----------------------+----------------------+
     |           |          |          |            |
  Template   Recipient   Issuance    Claiming   Verification
  Service    Service     Service     Service     Service
     |           |          |          |            |
     +-----------+----------+----------+------------+
                            |
                  CRYPTOGRAPHIC SERVICES
                            |
       +--------------------+---------------------+
       |                    |                     |
   Issuer Keys          VC Signing           Status Engine
       |                    |                     |
       +--------------------+---------------------+
                            |
                   INTEGRATION SERVICES
                            |
        +-------------------+--------------------+
        |                   |                    |
   PostgreSQL         Blockchain Network    Notifications
        |                   |                    |
        +-------------------+--------------------+
                            |
                   AUDIT & OBSERVABILITY
```

This architecture should maintain clear module boundaries without requiring each module to run as a separately deployed service.

## 2.2 Core domain modules

| Module | Responsibility |
|---|---|
| Identity | User accounts, sessions, authentication, recovery |
| Organization | Tenant registration, profiles, memberships |
| Authorization | Organization roles, permissions, access policies |
| Issuer Identity | Institutional DID and issuer key lifecycle |
| Template | Certificate templates, fields, versions |
| Recipient | Recipient records and spreadsheet import |
| Issuance | Individual and bulk credential issuance |
| Document | PDF generation, rendering, QR generation |
| Credential | Credential structure, signing, identifiers |
| Claim | Invitations, claimant authentication, ownership |
| Wallet | Holder identity, credential storage, presentation |
| Verification | Public verification and evidence evaluation |
| Revocation | Status lists, revocation, snapshots |
| Blockchain | Merkle anchoring and transaction monitoring |
| Audit | Security events, activity history, compliance evidence |
| Analytics | Issuance, claims, verification and organizational metrics |
| Platform | Global administration and SaaS operations |

---

# 3. Development Principles

All future implementation should follow these principles.

### Principle 1 — Security before convenience

No feature should weaken tenant isolation, credential ownership, issuer authorization, or cryptographic integrity for implementation convenience.

### Principle 2 — One feature at a time

Every feature must be developed as a complete vertical slice.

The process is:

1. Inspect the current implementation.
2. Identify existing functionality and defects.
3. Define exact scope.
4. Define business rules and security invariants.
5. Implement the feature.
6. Test its database and API behavior.
7. Test its UI and user workflow.
8. Perform an independent security and regression review.
9. Produce an evidence-based acceptance report.
10. Stop and identify the next feature.

Do not begin the next feature while the current feature has unresolved acceptance defects.

### Principle 3 — Fail closed

Missing database persistence, invalid signatures, unavailable verification evidence, and missing production secrets must never result in false success.

### Principle 4 — Evidence-based completion

A feature is not completed merely because its interface exists or its test script reports success.

Every feature requires implementation evidence and appropriate tests.

### Principle 5 — Standards must be demonstrated

Do not label a credential, signature, presentation, DID, or selective-disclosure implementation standards-compliant without appropriate conformance and interoperability testing.

---

# 4. Implementation Roadmap

## PHASE 0 — Project Baseline and Engineering Governance

**Priority:** Foundational

**Objective:** Establish an accurate and maintainable record of the existing implementation before adding more functionality.

### Work items

- [ ] Inspect the entire repository.
- [ ] Inventory existing pages, components, API endpoints, and services.
- [ ] Inventory Prisma models, relationships, indexes, and migrations.
- [ ] Inventory cryptographic and blockchain modules.
- [ ] Inventory automated tests and scripts.
- [ ] Identify implemented, partially implemented, simulated, disabled, and missing features.
- [ ] Reconcile the README roadmap with the actual codebase.
- [ ] Build a requirements-to-implementation traceability matrix.
- [ ] Define security and release acceptance gates.
- [ ] Establish a single feature acceptance report template.

### Deliverables

- Repository architecture report.
- Existing-feature inventory.
- Functional requirements traceability matrix.
- Technical debt register.
- Production-readiness issue register.
- Updated development roadmap.

**Exit criteria:** The team can accurately distinguish working features from prototypes and incomplete implementations.

---

## PHASE 1 — Engineering Infrastructure and CI Quality Gates

**Priority:** P0

**Objective:** Make every subsequent code change reproducibly testable.

### Work items

- [x] Standardize supported Node.js and npm versions.
- [x] Ensure deterministic dependency installation.
- [x] Validate Prisma schemas and migrations in CI.
- [x] Add TypeScript validation to CI.
- [x] Add unit-test execution to CI.
- [x] Add PostgreSQL integration-test execution to CI.
- [x] Add production-build verification to CI.
- [ ] Add browser E2E execution to CI.
- [ ] Add Foundry tests for smart contracts where applicable.
- [x] Add dependency and secret scanning.
- [ ] Configure branch protection and required checks.
- [ ] Store test execution reports as CI artifacts.

### CI quality gates

| Gate | Required result |
|---|---|
| Dependency installation | Successful |
| Prisma validation | Successful |
| TypeScript | Zero errors |
| Unit tests | All required tests pass |
| Integration tests | Live database execution, no unexplained skips |
| E2E tests | Critical journeys pass |
| Production build | Successful |
| Contract tests | Applicable tests pass |
| Security scanning | No unaccepted critical findings |

**Exit criteria:** A code change cannot be accepted without passing the applicable automated gates.

---

## PHASE 2 — Production Security and Persistence Hardening

**Priority:** P0 — Critical

**Objective:** Establish the security and reliability foundation before commercial deployment.

This phase should be implemented as several independent vertical slices.

### 2.1 Production secrets management

- [x] Remove default production session secrets.
- [x] Require strong production configuration.
- [x] Separate session signing and issuer-key encryption secrets.
- [x] Introduce a supported KMS or envelope-encryption architecture.
- [x] Implement encryption-key rotation.
- [x] Validate configuration at application startup.
- [x] Ensure secrets are never logged or exposed to clients.

### 2.2 Database persistence and failure handling

- [x] Remove silent in-memory repository fallback in production.
- [x] Require configured PostgreSQL in production.
- [x] Ensure repository errors are surfaced as sanitized application errors.
- [x] Validate database initialization and migration behavior.
- [x] Repair invalid cryptographic-key hydration.
- [x] Verify transaction boundaries.
- [x] Verify rollback behavior.
- [ ] Test application restart and multi-instance persistence.

### 2.3 Distributed challenge and replay protection

- [x] Store challenge records in shared persistent storage.
- [x] Hash sensitive challenge values before persistence.
- [x] Bind challenges to an intended audience.
- [x] Enforce expiration.
- [x] Implement atomic one-time consumption.
- [x] Prevent replay across application instances.
- [x] Test concurrent consumers.

### 2.4 Credential claim authorization

- [x] Require proof of control of the intended recipient identity.
- [x] Use verified-email challenges or secure single-use invitations.
- [x] Enforce the database single-owner invariant.
- [x] Prevent consumed invitation reassignment.
- [x] Preserve ownership records.
- [x] Test concurrent claim races against live PostgreSQL.

### 2.5 Blockchain fail-closed behavior

- [x] Separate production blockchain configuration from test simulation.
- [x] Require an explicit live-network configuration.
- [x] Validate the selected chain ID.
- [ ] Verify deployed contract bytecode.
- [ ] Validate RPC connectivity.
- [ ] Verify transaction receipts.
- [ ] Distinguish simulation results from real chain evidence.
- [ ] Prevent simulated state from being presented as production evidence.

### 2.6 Credential proof conformance

- [ ] Define the supported VC cryptographic profile.
- [ ] Integrate an appropriate maintained proof-suite implementation.
- [ ] Validate issuer identity and verification method.
- [ ] Validate signature serialization.
- [ ] Validate proof creation and verification independently.
- [ ] Add interoperability fixtures.
- [ ] Stop claiming standards compliance until validation is complete.

### 2.7 Public verification data minimization

- [ ] Review every public verification response.
- [ ] Remove unnecessary recipient PII.
- [ ] Apply field-level disclosure rules.
- [ ] Test unauthenticated access boundaries.
- [ ] Review error messages and information leakage.

**Exit criteria:** No known unresolved critical persistence, ownership, secret-management, or verification-integrity blocker remains in the accepted scope.

---

## PHASE 3 — Authentication, Organizations and Multi-Tenant RBAC

**Priority:** P0

**Objective:** Establish an institutionally governed SaaS environment.

### 3.1 Authentication

- [x] User registration.
- [x] Login and logout.
- [x] Secure session management.
- [x] Password security.
- [x] Account recovery.
- [x] Session revocation.
- [x] Authentication abuse protection.

### 3.2 Organization onboarding

- [ ] Organization registration.
- [ ] Organization profile management.
- [ ] Institution logo and branding.
- [ ] Organization status management.
- [ ] Organization approval workflow where required.
- [ ] Organization workspace initialization.
- [ ] Organization invitation workflow.

### 3.3 Organization membership

- [ ] Invite organization members.
- [ ] Accept and reject invitations.
- [ ] Remove members.
- [ ] Suspend members.
- [ ] Transfer ownership under an authorized process.
- [ ] Preserve administrative audit history.

### 3.4 Role-based access control

Recommended initial roles:

| Role | Main permissions |
|---|---|
| ORG_OWNER | Complete organization governance |
| INSTITUTION_ADMIN | Organization administration |
| CERTIFICATE_ISSUER | Credential creation and issuance |
| TEMPLATE_DESIGNER | Template creation and management |
| READ_ONLY_STAFF | Read-only access to permitted records |
| SUPER_ADMIN | Platform-level administration |

### Security acceptance

- [ ] Every tenant-owned record is tenant-scoped.
- [ ] Cross-tenant ID substitution is rejected.
- [ ] API permissions are enforced on the server.
- [ ] UI visibility is not used as an authorization control.
- [ ] Role changes are audited.
- [ ] Tests cover cross-tenant access and privilege escalation.

**Exit criteria:** Multiple organizations can safely use the same application without accessing one another's records or operations.

---

## PHASE 4 — Issuer Identity and Cryptographic Key Management

**Priority:** P0

**Objective:** Establish trust in the institution issuing the credential.

### Work items

- [ ] Create issuer identity lifecycle.
- [ ] Configure institutional DID.
- [ ] Implement issuer verification method management.
- [ ] Generate issuer cryptographic keys securely.
- [ ] Store private keys using independent encryption keys.
- [ ] Implement key-version tracking.
- [ ] Implement key activation and deactivation.
- [ ] Support controlled key rotation.
- [ ] Support compromised-key emergency procedures.
- [ ] Preserve historical issuer-key verification evidence.
- [ ] Publish and resolve issuer identity documents where applicable.

### Key lifecycle

```text
KEY GENERATION
      |
      v
SECURE STORAGE
      |
      v
KEY ACTIVATION
      |
      v
CREDENTIAL SIGNING
      |
      v
NORMAL ROTATION
      |
      +------> HISTORICAL VERIFICATION
      |
      v
RETIREMENT

COMPROMISE DETECTED
      |
      v
EMERGENCY DEACTIVATION
      |
      v
COMPROMISE ASSESSMENT
      |
      v
AFFECTED CREDENTIAL REVIEW
```

**Exit criteria:** Every credential issued by an institution can be associated with a verifiable issuer identity and an appropriately managed signing-key version.

---

## PHASE 5 — Certificate Template Designer

**Priority:** P0

**Objective:** Allow organizations to design professional credentials without manually editing code.

### Work items

- [ ] Template gallery.
- [ ] Create template.
- [ ] Edit template.
- [ ] Duplicate template.
- [ ] Archive template.
- [ ] Custom canvas dimensions.
- [ ] Background and border selection.
- [ ] Typography settings.
- [ ] Logo and image placement.
- [ ] Signature and seal placement.
- [ ] Dynamic field insertion.
- [ ] QR-code placement.
- [ ] Preview with sample recipient data.
- [ ] Save and publish.
- [ ] Template version management.

### Dynamic fields

Example:

```text
{{recipient.name}}
{{recipient.email}}
{{credential.title}}
{{credential.description}}
{{credential.certificateNumber}}
{{issuer.name}}
{{credential.issueDate}}
{{credential.expiryDate}}
{{credential.verificationUrl}}
```

The actual supported field schema must be validated on the server.

### Important engineering rule

A credential must retain the exact template version used at issuance.

Subsequent template modifications must never silently alter historical issued credentials or their rendered documents.

**Exit criteria:** An authorized organization member can create and publish a versioned certificate template and accurately preview its generated output.

---

## PHASE 6 — Recipient Management and Spreadsheet Import

**Priority:** P0

**Objective:** Provide reliable recipient onboarding for individual and large-scale credential issuance.

### Work items

- [ ] Manual recipient creation.
- [ ] CSV import.
- [ ] XLSX import.
- [ ] Column mapping.
- [ ] Field validation.
- [ ] Duplicate detection.
- [ ] Email validation.
- [ ] Required-field validation.
- [ ] Import preview.
- [ ] Error report.
- [ ] Row-level import results.
- [ ] Safe retry.
- [ ] Import history.
- [ ] Recipient search and filtering.
- [ ] Recipient profile management.

### Import pipeline

```text
UPLOAD
  |
  v
FILE VALIDATION
  |
  v
COLUMN MAPPING
  |
  v
DATA SANITIZATION
  |
  v
FIELD VALIDATION
  |
  v
DUPLICATE DETECTION
  |
  v
PREVIEW
  |
  v
ISSUER CONFIRMATION
  |
  v
DATABASE IMPORT
  |
  v
IMPORT REPORT
```

### Security requirements

- Prevent spreadsheet formula injection.
- Validate file type and size.
- Prevent unsafe file parsing.
- Enforce organization ownership.
- Prevent duplicate records.
- Apply safe batch processing.

**Exit criteria:** Organizations can reliably import and manage validated recipients.

---

## PHASE 7 — Credential Issuance and Document Generation

**Priority:** P0

**Objective:** Deliver the primary business functionality of CREDVAIL.

### 7.1 Individual credential issuance

- [ ] Select a published template.
- [ ] Select or register a recipient.
- [ ] Enter credential claims.
- [ ] Validate issuance permissions.
- [ ] Generate a unique identifier.
- [ ] Create the credential record.
- [ ] Render the certificate.
- [ ] Generate the associated PDF.
- [ ] Generate its valid verification QR code.
- [ ] Generate the approved cryptographic evidence.
- [ ] Record issuance audit events.

### 7.2 Batch credential issuance

- [x] Select a recipient batch.
- [x] Associate a template.
- [x] Validate every recipient.
- [x] Preview batch output.
- [x] Confirm the issuance operation.
- [x] Process records in controlled batches.
- [x] Generate individual documents.
- [x] Record individual issuance outcomes.
- [x] Support safe retry.
- [x] Report completed and failed items.

### 7.3 Asynchronous processing architecture

Use durable background processing for large batch jobs.

Recommended workflow:

```text
ISSUANCE REQUEST
       |
       v
VALIDATE REQUEST
       |
       v
CREATE BATCH
       |
       v
COMMIT DATABASE RECORDS
       |
       v
OUTBOX EVENT
       |
       v
BACKGROUND PROCESSOR
       |
       +------> RENDER PDF
       |
       +------> CREATE CRYPTOGRAPHIC EVIDENCE
       |
       +------> GENERATE QR
       |
       +------> DISTRIBUTE INVITATION
       |
       v
UPDATE BATCH STATUS
       |
       v
GENERATE COMPLETION REPORT
```

Use idempotency keys, transaction boundaries, and durable processing records to prevent duplicate issuance.

**Exit criteria:** Individual and bulk issuance produce consistent, traceable credentials and corresponding documents.

---

## PHASE 8 — Claim Invitations and Single-Owner Credential Authorization

**Priority:** P0

**Objective:** Guarantee that a credential can be claimed only through an authorized process and associated with at most one legitimate holder.

### Work items

- [ ] Generate secure invitations.
- [ ] Generate high-entropy claim tokens.
- [ ] Store only protected token representations.
- [ ] Set expiration.
- [ ] Deliver invitation.
- [ ] Validate claimant authorization.
- [ ] Validate invitation authenticity.
- [ ] Enforce single-use redemption.
- [ ] Enforce one owner per credential.
- [ ] Prevent replay.
- [ ] Prevent reassignment.
- [ ] Maintain durable ownership records.
- [ ] Provide claim-status tracking.

### Essential security invariants

1. A claim invitation must be authorized for the intended recipient.
2. Claim redemption must be atomic.
3. At most one holder can own a credential.
4. A consumed invitation cannot be redeemed again.
5. A consumed ownership record cannot be reassigned.
6. Database failure cannot produce a successful claim.
7. Concurrent redemption must produce exactly one valid winner.

**Exit criteria:** The claim workflow passes live PostgreSQL concurrency, replay, and authorization tests.

---

## PHASE 9 — Holder Wallet and Holder Identity

**Priority:** P0

**Objective:** Provide recipients with a secure personal credential wallet.

### Work items

- [ ] Wallet initialization.
- [ ] Holder identity generation.
- [ ] Holder key generation.
- [ ] Credential claim association.
- [ ] Wallet credential listing.
- [ ] Credential detail page.
- [ ] PDF download.
- [ ] Credential presentation workflow.
- [ ] Credential sharing.
- [ ] Wallet access recovery.
- [ ] Wallet synchronization.
- [ ] Wallet security settings.

### Recommended security architecture

Evaluate an architecture in which holder private keys are generated and controlled by the holder's client environment using WebCrypto and appropriate browser storage.

The platform should not casually become the custodian of holder private keys.

Define and test:

- Device loss.
- Browser storage loss.
- Key rotation.
- Recovery.
- Account takeover.
- Credential ownership recovery.
- Backup and restore.

Do not claim that browser storage alone provides durable or universal wallet recovery.

**Exit criteria:** A holder can securely access and present owned credentials across the supported wallet workflows.

---

## PHASE 10 — Public Credential Verification

**Priority:** P0

**Objective:** Enable independent verification by employers, universities, institutions, and other relying parties.

### Verification entry points

- QR scanning.
- Credential ID search.
- Public verification URL.
- Supported credential presentation.

### Verification pipeline

```text
VERIFICATION REQUEST
         |
         v
RETRIEVE CREDENTIAL
         |
         v
VALIDATE CREDENTIAL FORMAT
         |
         v
RESOLVE ISSUER IDENTITY
         |
         v
VERIFY ISSUER PROOF
         |
         v
RECALCULATE INTEGRITY HASHES
         |
         v
VALIDATE MERKLE EVIDENCE
         |
         v
CHECK CREDENTIAL STATUS
         |
         v
CHECK STATUS FRESHNESS
         |
         v
APPLY VERIFICATION POLICY
         |
         v
RETURN RESULT AND EVIDENCE
```

### Verification result semantics

The platform should support carefully defined outcomes such as:

| Result | Meaning |
|---|---|
| VALID_CURRENT | Proof, issuer, integrity, and sufficiently fresh status evidence are valid |
| REVOKED | Credential has been revoked |
| AUTHENTICITY_ONLY | Authenticity is established but current status cannot be established |
| STATUS_UNKNOWN | Status is unavailable, missing, stale, or not sufficiently anchored |
| INVALID | Credential or required proof fails validation |

Credential expiration should also be evaluated explicitly and represented consistently in the response contract.

Never return `VALID_CURRENT` when the required status snapshot or its on-chain commitment is missing or mismatched.

### Privacy

- Public information must be minimized.
- Recipient email must not be exposed unnecessarily.
- Sensitive claims must remain protected.
- Verification errors must not disclose internal secrets or private records.

**Exit criteria:** A third party can independently verify a credential without relying on a screenshot or untrusted issuer statement.

---

## PHASE 11 — Revocation, Status Lists and Credential Lifecycle

**Priority:** P0

**Objective:** Allow issued credentials to be maintained and checked throughout their lifetime.

### Work items

- [x] Define credential lifecycle states.
- [x] Implement authorized revocation.
- [x] Record revocation reason.
- [x] Maintain revocation audit events.
- [x] Implement the supported W3C status-list profile.
- [x] Publish status updates.
- [x] Maintain status snapshots.
- [x] Calculate integrity commitments.
- [x] Anchor applicable commitments.
- [x] Verify exact snapshot-to-chain consistency.
- [x] Enforce freshness policy.
- [x] Handle missing and unavailable status evidence.
- [x] Handle issuer-key compromise.
- [x] Preserve historical verification semantics.

### Lifecycle state model

```text
CREATED
   |
   v
ISSUED
   |
   v
CLAIMED
   |
   v
ACTIVE
   |
   +------> EXPIRED
   |
   +------> REVOKED
   |
   +------> SUSPENDED (if product policy supports it)
```

Actual lifecycle states must be separated from verification results. For example, a status service being unavailable should not be treated as a credential lifecycle state.

**Exit criteria:** Revoked and expired credentials cannot be incorrectly presented as currently valid, and status evidence is auditable.

---

## PHASE 12 — Blockchain Anchoring and Smart Contract Reliability

**Priority:** P1

**Objective:** Support independently verifiable integrity commitments without making the entire platform dependent on unnecessary blockchain operations.

### Work items

- [ ] Review smart contract architecture.
- [ ] Review contract access control.
- [ ] Review Merkle root anchoring.
- [ ] Review transaction replay protection.
- [ ] Review chain and network selection.
- [ ] Verify contract bytecode.
- [x] Validate transaction receipts.
- [x] Implement durable transaction monitoring.
- [x] Implement retry and failure recovery.
- [x] Store actual transaction evidence.
- [x] Verify anchored commitments.
- [ ] Test event and receipt consistency.
- [ ] Evaluate mainnet migration requirements.

### Design rule

Blockchain is an integrity and public evidence layer, not the primary storage system for private credential claims or personal data.

Use it selectively for commitments and evidence that benefit from independent public verification.

**Exit criteria:** Every reported successful anchor corresponds to a confirmed transaction on the intended network and the exact persisted commitment can be independently checked.

---

## PHASE 13 — Audit Logs, Analytics and Reporting

**Priority:** P1

**Objective:** Provide institutional transparency and platform-level operational visibility.

### Organization analytics

- [ ] Total issued credentials.
- [ ] Individual and batch issuance metrics.
- [ ] Pending invitations.
- [ ] Successful claims.
- [ ] Failed claim attempts.
- [ ] Credential status distribution.
- [ ] Revocation statistics.
- [ ] Verification activity.
- [ ] Monthly and yearly reports.

### Audit events

- [ ] User authentication events.
- [ ] Organization membership changes.
- [ ] Role changes.
- [ ] Template creation and publishing.
- [ ] Credential issuance.
- [ ] Credential claiming.
- [ ] Credential revocation.
- [ ] Issuer key changes.
- [ ] Verification activity.
- [ ] Security-related configuration changes.

### Reporting

- [x] CSV exports.
- [x] PDF reports.
- [x] Date-range filters.
- [x] Organization filters.
- [x] Permission-based access.
- [x] Report generation audit events.

**Exit criteria:** Authorized organization administrators can reconstruct relevant credential operations and review meaningful operational metrics.

---

## PHASE 14 — Privacy-Preserving Presentations and Interoperability

**Priority:** P2

**Objective:** Advance CREDVAIL from credential issuance and verification into privacy-preserving credential presentation infrastructure.

### Work items

- [ ] Finalize the supported VC data model profile.
- [ ] Implement interoperable proof suites.
- [ ] Integrate a supported selective-disclosure cryptosuite.
- [ ] Implement issuer base proofs.
- [ ] Implement holder-derived proofs.
- [ ] Implement verifier-side derived-proof checking.
- [ ] Implement secure challenge handling.
- [ ] Bind presentation audience.
- [ ] Prevent presentation replay.
- [ ] Implement selected-claim disclosure.
- [ ] Test disclosure of only permitted claims.
- [ ] Establish interoperability with independent implementations.

### Critical requirement

Custom JSON tokens or proprietary disclosure formats must not be advertised as W3C selective disclosure or zero-knowledge proofs.

A feature becomes enabled only after cryptographic correctness, standards compatibility, and security validation have been demonstrated.

**Exit criteria:** CREDVAIL can produce and verify supported presentations through an independently tested standards-compatible implementation.

---

## PHASE 15 — SaaS Commercialization and Platform Administration

**Priority:** P1 for commercial launch

**Objective:** Turn the core credential infrastructure into a sustainable SaaS product.

### Organization subscription management

- [x] Define subscription plans.
- [x] Define credential issuance quotas.
- [x] Define storage and processing limits.
- [x] Implement usage metering.
- [x] Implement subscription lifecycle.
- [ ] Implement billing integration.
- [ ] Implement invoice history.
- [x] Implement plan upgrades and downgrades.
- [x] Implement account suspension policies.
- [ ] Implement usage notifications.

### Platform administration

- [x] Organization management.
- [x] Organization verification workflow.
- [x] Account administration.
- [x] Platform configuration.
- [x] Subscription oversight.
- [x] Usage monitoring.
- [ ] Abuse monitoring.
- [x] Operational status monitoring.

**Exit criteria:** Commercial organizations can onboard, subscribe, operate within their plans, and receive transparent usage information.

---

## PHASE 16 — Production Deployment and Operational Readiness

**Priority:** P0 for production release

**Objective:** Make CREDVAIL reliable, observable, recoverable, and maintainable in a real production environment.

### Infrastructure

- [ ] Production hosting architecture.
- [ ] Database production configuration.
- [ ] Managed secret storage.
- [ ] Domain and TLS configuration.
- [ ] Deployment environments.
- [ ] Database migration process.
- [ ] Background job infrastructure.
- [ ] Storage and document delivery.
- [ ] Blockchain RPC provider configuration.
- [ ] Production network configuration.

### Observability

- [x] Centralized structured logging.
- [ ] Application error monitoring.
- [x] Request tracing.
- [ ] Database performance monitoring.
- [x] Background job monitoring.
- [x] Blockchain transaction monitoring.
- [x] Verification latency metrics.
- [x] Security event monitoring.

### Disaster recovery

- [x] Database backup policy.
- [ ] Backup restoration tests.
- [x] Document recovery.
- [x] Key backup and rotation procedures.
- [x] Recovery-point objectives.
- [x] Recovery-time objectives.
- [x] Incident response procedures.
- [x] Security incident escalation.

### Production acceptance

- [ ] Independent security assessment.
- [ ] Dependency audit.
- [x] Tenant-isolation testing.
- [x] Authorization testing.
- [x] Concurrency testing.
- [x] Performance testing.
- [ ] Browser compatibility testing.
- [ ] Accessibility review.
- [ ] Production backup restoration test.
- [x] Operational runbook.
- [ ] Release approval.

**Exit criteria:** Production deployment can be operated, monitored, recovered, and securely maintained.

---

# 5. Product Release Milestones

The roadmap should produce useful releases rather than waiting until every advanced feature is finished.

## Release A — Internal Alpha

**Purpose:** Demonstrate a complete issuer-to-holder workflow.

Included capabilities:

- Authentication.
- Organization onboarding.
- Organization roles.
- Template management.
- Recipient management.
- Individual credential issuance.
- PDF generation.
- Secure credential invitations.
- Credential claiming.
- Holder wallet.

Acceptance: An organization can issue a real test credential and a recipient can claim it.

## Release B — Functional MVP

**Purpose:** Deliver the core value of CREDVAIL to pilot organizations.

Included capabilities:

- Bulk issuance.
- Secure credential ownership.
- Public credential verification.
- Cryptographic integrity checking.
- Issuer identity verification.
- Credential revocation.
- Status-aware verification.
- Audit history.
- Organization dashboard.

Acceptance: A pilot institution can issue credentials, recipients can claim them, and third parties can verify and check their status.

## Release C — Production V1

**Purpose:** Deliver the security and reliability needed for real institutional operations.

Included capabilities:

- Independent key management.
- Fail-closed persistence.
- Production authentication and secrets.
- Standards-tested credential proofs.
- Reliable status publication and checking.
- Confirmed blockchain evidence where enabled.
- CI quality gates.
- Monitoring and recovery procedures.
- Independent security testing.
- Production deployment.

Acceptance: The platform satisfies defined production security, reliability, and operational gates.

## Release D — Advanced Infrastructure V2

**Purpose:** Expand interoperability and privacy capabilities.

Included capabilities:

- Selective disclosure.
- Advanced credential presentations.
- Cross-platform interoperability.
- External integrations.
- Enterprise administration.
- Commercial subscription capabilities.
- Advanced analytics.

Acceptance: CREDVAIL demonstrates reliable integration with independently implemented credential systems.

---

# 6. Feature Dependency Matrix

The following dependencies determine the correct implementation order.

| Feature | Required dependency |
|---|---|
| Organization workspaces | Authentication and tenant isolation |
| Organization roles | Membership model and authorization |
| Issuer identity | Organization governance and secure key management |
| Template designer | Organization permissions |
| Recipient import | Organization and recipient models |
| Credential issuance | Issuer identity, templates, recipients |
| Batch issuance | Reliable issuance pipeline and idempotency |
| Credential claims | Issued credential and claim authorization |
| Holder wallet | Holder identity and secure ownership association |
| Public verification | Credential proof and issuer resolution |
| Revocation | Credential status architecture |
| Freshness-aware verification | Status snapshots and commitment verification |
| Blockchain anchoring | Merkle evidence and live-chain reliability |
| Selective disclosure | Standards-compatible proof infrastructure |
| Analytics | Reliable domain and audit events |
| Commercial billing | Usage metering and tenant administration |

---

# 7. Cross-Cutting Non-Functional Requirements

Every feature must satisfy the relevant requirements below.

### Security

- Tenant isolation.
- Least-privilege authorization.
- Secure session handling.
- Secure cryptographic-key management.
- Input validation and output encoding.
- Rate limiting and abuse protection.
- Replay protection.
- Auditability.
- Sensitive-data minimization.

### Reliability

- Atomic database transactions.
- Idempotent operations.
- Durable background processing.
- Retry-safe job handling.
- Explicit error states.
- Fail-closed critical operations.
- Backup and restoration procedures.

### Performance

- Pagination.
- Indexed queries.
- Bounded batch processing.
- Asynchronous document generation.
- Caching where safe.
- Defined verification latency targets.
- Controlled blockchain RPC usage.

### Usability

- Responsive issuer dashboard.
- Intuitive certificate designer.
- Clear import-validation reports.
- Understandable claim process.
- Accessible holder wallet.
- Simple public verification experience.

### Maintainability

- Modular service boundaries.
- Typed API contracts.
- Centralized validation schemas.
- Consistent error handling.
- Automated tests.
- Architecture documentation.
- Feature acceptance reports.

---

# 8. Testing Strategy

Each feature must be tested at the appropriate levels.

| Test level | Main objective |
|---|---|
| Unit tests | Validate individual business rules and utilities |
| Integration tests | Validate services, repositories and external adapters |
| Database tests | Validate constraints, transactions and concurrent operations |
| API tests | Validate authentication, permissions and response contracts |
| E2E tests | Validate complete user journeys |
| Security tests | Validate authorization, replay protection and data isolation |
| Performance tests | Validate batch processing and verification workloads |
| Interoperability tests | Validate external credential and proof compatibility |
| Recovery tests | Validate restart, failure and restore behavior |

### Mandatory end-to-end journeys

**Journey 1 — Organization issuance**

Organization registration → Admin creation → Template publishing → Recipient import → Credential issuance → PDF generation.

**Journey 2 — Holder claiming**

Invitation delivery → Claimant authentication → Claim redemption → Wallet ownership → Credential access.

**Journey 3 — Independent verification**

Credential sharing → Public verification → Issuer proof validation → Integrity validation → Status validation → Verification result.

**Journey 4 — Revocation**

Credential issuance → Credential revocation → Status publication → Verification after revocation → Revoked result.

**Journey 5 — Concurrent ownership**

Two claimants attempt to claim the same credential → Exactly one authorized ownership association is committed.

---

# 9. Standard Feature Acceptance Protocol

Each implementation feature must have a separate acceptance record.

## Feature lifecycle

```text
FEATURE SELECTED
      |
      v
REPOSITORY AUDIT
      |
      v
REQUIREMENTS & ACCEPTANCE CRITERIA
      |
      v
THREAT MODEL & DATA MODEL REVIEW
      |
      v
IMPLEMENTATION
      |
      v
AUTOMATED TESTING
      |
      v
BROWSER / API / DATABASE TESTING
      |
      v
INDEPENDENT REVIEW
      |
      v
ACCEPTANCE REPORT
      |
      v
FINAL STATUS
```

Allowed final statuses:

- `PRODUCTION READY`
- `NOT PRODUCTION READY`
- `BLOCKED`

A skipped required test cannot be treated as passed.

A successful build cannot substitute for browser, security, or persistence verification.

After a feature receives `PRODUCTION READY`, stop that workstream and proceed to the next feature only after the product owner approves.

---

# 10. Engineering Prioritization

| Priority | Work category | Business impact |
|---|---|---|
| P0 | Security, tenant isolation, persistence, claim ownership, issuer trust, issuance and verification correctness | Essential for trust and launch |
| P1 | Batch processing, audit, analytics, production operations, blockchain reliability, billing | Essential for scale and commercialization |
| P2 | Selective disclosure, extended interoperability, advanced integrations and ecosystem features | Strategic expansion |

---

# 11. Definition of a Production-Ready CREDVAIL Release

A release can be considered ready only when:

1. Organizations can operate within isolated tenant workspaces.
2. Organization permissions are enforced server-side.
3. Issuer identities and private keys are properly managed.
4. Credentials are generated with a tested cryptographic profile.
5. Issued documents accurately represent credential records.
6. Credential invitations and claims enforce ownership invariants.
7. Holders can manage their credentials securely.
8. Public verification correctly validates issuer, proof, integrity, and status.
9. Revocation is reflected in verification outcomes.
10. Blockchain claims correspond to actual confirmed network evidence where applicable.
11. Public interfaces minimize personal information.
12. Required automated and manual tests have passed.
13. Production secrets and database persistence fail closed.
14. Backups, monitoring, and incident-response processes are tested.
15. The final production deployment has passed independent acceptance.
