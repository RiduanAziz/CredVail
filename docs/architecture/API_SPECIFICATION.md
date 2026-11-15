# CREDVAIL — API Architecture & Endpoint Specification

**Project Title:** Blockchain-Verified, Privacy-Preserving Digital Credential Infrastructure  
**Document:** REST API Contract & Route Specification  
**Document Version:** 1.0.0  
**Base URL:** `/api/v1`  
**Phase:** Phase 0 (Technical Planning)  

---

## 1. General Principles & Standards

### 1.1 Content Negotiation & Formatting
- All request and response bodies use `Content-Type: application/json` unless otherwise specified (e.g. multipart for spreadsheet uploads, application/pdf for binary certificate streaming, application/zip for bulk archive downloads).
- All timestamps follow **ISO 8601** format in UTC: `YYYY-MM-DDTHH:mm:ss.sssZ`.
- All blockchain hashes and addresses are `0x`-prefixed lowercase hex strings.

### 1.2 Unified Response Envelopes
Every API endpoint returns a deterministic JSON envelope:

#### Success Envelope (`200 OK`, `201 Created`):
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 142
  }
}
```

#### Error Envelope (`400`, `401`, `403`, `404`, `409`, `422`, `429`, `500`):
```json
{
  "success": false,
  "error": {
    "code": "INVALID_SIGNATURE",
    "message": "Cryptographic signature validation failed against the active issuer public key.",
    "details": [
      {
        "field": "proof.jws",
        "issue": "Verification method key mismatch"
      }
    ]
  }
}
```

---

## 2. Authentication & Tenant Context Middleware

All private endpoints require an active session:
- **Cookie Session:** `credvail_session=<token>` (HttpOnly, Secure, SameSite=Strict).
- **Bearer Token:** `Authorization: Bearer <token>` for programmatic API clients.
- **Tenant Context Header:** `X-Tenant-Slug: <tenant-slug>` identifies the active institutional workspace.

---

## 3. Endpoints Taxonomy

### 3.1 Authentication & Profile (`/api/v1/auth`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/register` | Public | Register initial platform user with Argon2id password hash. |
| `POST` | `/api/v1/auth/login` | Public | Authenticate user credentials and issue encrypted session. |
| `POST` | `/api/v1/auth/logout` | Authenticated | Invalidate active session cookie / token. |
| `GET` | `/api/v1/auth/me` | Authenticated | Return profile, platform role, and tenant memberships. |
| `POST` | `/api/v1/auth/change-password` | Authenticated | Verify existing password and update with Argon2id. |

### 3.2 Tenant Management (`/api/v1/tenants`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/tenants` | Authenticated | Register new institutional tenant (user becomes `ORG_OWNER`). |
| `GET` | `/api/v1/tenants/:slug` | Member | Retrieve institutional profile, branding, and verification status. |
| `PATCH`| `/api/v1/tenants/:slug` | Org Owner / Admin | Update institutional metadata, theme colors, and logo. |
| `GET` | `/api/v1/tenants/:slug/members` | Member | List institutional staff members with assigned roles. |
| `POST` | `/api/v1/tenants/:slug/members/invite`| Admin | Send invitation email to staff member with specific role. |
| `PATCH`| `/api/v1/tenants/:slug/members/:userId`| Admin | Update member role (`ISSUER`, `DESIGNER`, `READ_ONLY`). |
| `DELETE`|`/api/v1/tenants/:slug/members/:userId`| Admin | Revoke institutional membership. |

### 3.3 Certificate Template Designer (`/api/v1/tenants/:slug/templates`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/tenants/:slug/templates` | Member | List all templates owned by tenant. |
| `POST` | `/api/v1/tenants/:slug/templates` | Designer / Admin | Create new certificate template with layout coordinates. |
| `GET` | `/api/v1/tenants/:slug/templates/:id` | Member | Fetch template layout JSON, dimensions, and placeholders. |
| `PUT` | `/api/v1/tenants/:slug/templates/:id` | Designer / Admin | Update template design, typography, assets, and placement. |
| `DELETE`|`/api/v1/tenants/:slug/templates/:id`| Designer / Admin | Delete unused template (blocked if linked to issued batches). |
| `POST` | `/api/v1/tenants/:slug/templates/:id/preview`| Member | Generate real-time vector PDF preview with dummy data. |

### 3.4 Spreadsheet Ingestion & Bulk Generation (`/api/v1/tenants/:slug/batches`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/tenants/:slug/batches/upload` | Issuer / Admin | Upload CSV/XLSX file; sanitize formula injection; parse headers. |
| `POST` | `/api/v1/tenants/:slug/batches/validate`| Issuer / Admin | Map spreadsheet columns to template fields; return row diagnostics. |
| `POST` | `/api/v1/tenants/:slug/batches/process` | Issuer / Admin | Trigger atomic batch generation (PDFs, VCs, Merkle tree). |
| `GET` | `/api/v1/tenants/:slug/batches` | Member | List historical issuance batches with statuses and roots. |
| `GET` | `/api/v1/tenants/:slug/batches/:id` | Member | Get batch summary, leaf count, Merkle root, and tx hash. |
| `GET` | `/api/v1/tenants/:slug/batches/:id/download-zip`| Member | Stream compressed ZIP archive of all generated PDF certificates. |

### 3.5 Credential Management & Revocation (`/api/v1/tenants/:slug/credentials`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/tenants/:slug/credentials` | Member | Paginated list of certificates with search, filtering, and status. |
| `GET` | `/api/v1/tenants/:slug/credentials/:id` | Member | Credential record detail, unblinded claims, and Merkle proof. |
| `GET` | `/api/v1/tenants/:slug/credentials/:id/pdf` | Member / Holder | Download individual high-resolution print-ready certificate PDF. |
| `POST` | `/api/v1/tenants/:slug/credentials/:id/revoke`| Issuer / Admin | Revoke credential; flip bit in bitstring; trigger snapshot update. |
| `POST` | `/api/v1/tenants/:slug/credentials/:id/reissue`| Issuer / Admin | Issue corrected replacement credential while retaining lineage. |

### 3.6 Issuer Cryptographic Key Governance (`/api/v1/tenants/:slug/keys`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/tenants/:slug/keys` | Admin | List key epochs, public fingerprints, and validity windows. |
| `POST` | `/api/v1/tenants/:slug/keys/rotate` | Org Owner | Generate new ECDSA key pair, increment epoch, anchor on-chain. |
| `POST` | `/api/v1/tenants/:slug/keys/compromise`| Org Owner | Flag compromised key epoch; trigger emergency invalidation. |
| `GET` | `/.well-known/did.json` | Public | Platform-level W3C DID document. |
| `GET` | `/tenants/:slug/.well-known/did.json`| Public | Tenant-level W3C DID Document resolving issuer keys. |

### 3.7 Public Verification & Presentation (`/api/v1/verify`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/verify/lookup/:id` | Public | Static lookup from certificate QR code (returns verified claims & status). |
| `POST` | `/api/v1/verify/challenge` | Public | Request fresh cryptographic nonce with 5-minute TTL. |
| `POST` | `/api/v1/verify/presentation` | Public | Verify selective-disclosure presentation against nonce, Merkle root & status list. |
| `GET` | `/api/v1/status-list/:tenantSlug/:epoch`| Public | Retrieve W3C Bitstring Status List JSON-LD document. |

### 3.8 Analytics & Audit Logs (`/api/v1/tenants/:slug/analytics`)

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/tenants/:slug/analytics/overview` | Member | Total issued, active, revoked, verification attempts, success rate. |
| `GET` | `/api/v1/tenants/:slug/audit-logs` | Admin | Cryptographic audit trail of key rotations, issuances, and revocations. |
