# CREDVAIL Security Remediation Status

## Branch

`security/hardening-selective-disclosure`

Base branch: `main`

This branch is a security-hardening change set. It does not represent a completed production security audit.

## Changes in this remediation slice

### 1. Selective-disclosure fail-closed gate

The previous custom salted-JSON/Base64URL disclosure mechanism was not an implementation of the W3C `ecdsa-sd-2023` cryptosuite. It also lacked independent issuer-proof and Merkle-proof validation for derived presentations.

The following legacy paths are now disabled:

- Custom disclosure-package generation.
- Attaching custom disclosure commitments to credentials.
- Generating presentations with the custom token format.
- Verifying the custom token format as a valid selective-disclosure presentation.

The wallet no longer creates custom disclosure tokens when a credential is claimed. A derived presentation is rejected until a supported W3C cryptosuite is integrated.

Recommended implementation candidate: Digital Bazaar's `@digitalbazaar/ecdsa-sd-2023-cryptosuite`, used with its Data Integrity and VC libraries. Integration must include issuer base-proof creation and verification, holder-side derived-proof generation, derived-proof verification, DID/key resolution, and interoperability tests. Merely adding the package is not sufficient.

### 2. Presentation verification now fails closed

A presentation must now include:

- A server-issued, unexpired challenge.
- The exact challenge in the holder proof.
- The exact verifier audience in the holder proof.
- A resolvable `did:key` holder identifier.
- A verification method bound to that holder DID.
- A valid holder signature.

The challenge is consumed only after the holder proof and challenge/audience binding pass. Replays are rejected.

The challenge endpoint now requires an HTTPS origin as the audience. HTTP is permitted only for localhost development. The wallet requests a challenge bound to its actual origin and uses that returned audience when constructing the presentation.

### 3. Benchmark runner blocked

The previous runner used simulated in-memory blockchain state, hard-coded gas assumptions, and local credential-signature/Merkle microbenchmarks in place of end-to-end measurements.

It is now blocked pending a replacement harness that records:

- Actual Ethereum transaction receipts and gas used.
- Full CSV/XLSX-to-PDF certificate-generation throughput.
- End-to-end public verification latency, including database and real RPC calls.
- Real revocation snapshot publication and recognition latency.
- Independently executed adversarial test cases.

Existing benchmark artifacts must be treated as historical development diagnostics, not final thesis evidence.

## Tests added or revised

- Legacy disclosure generation must throw instead of minting custom tokens.
- Legacy disclosure verification must never return valid.
- Wallet claiming must not create custom disclosure tokens.
- Wallet presentation generation must remain disabled until a W3C cryptosuite is integrated.
- Presentation verification requires an unexpired, audience-bound challenge and a valid holder signature.
- Missing proof and replay attempts must be rejected.
- Phase 11 and Phase 13 verification scripts now test the disabled/fail-closed state rather than claiming custom selective disclosure is standards-compliant.

## Runtime verification status

**Not executed in this environment.**

An attempt to clone the branch from GitHub failed because the execution environment could not resolve `github.com`. Therefore no claim is made that `npm ci`, TypeScript compilation, Vitest, Node test scripts, Foundry tests, or browser tests pass.

Run these checks in a local clone or CI before merging:

```bash
npm ci
npx prisma validate
npx tsc --noEmit
npm run test:vitest
npm test
forge test
npm run build
```

The repository currently has no GitHub Actions workflow configured, so these checks need a CI workflow or a documented local run.

## Open P0/P1 work not solved by this branch

1. **Browser wallet architecture:** the current wallet service still stores holder identities and credential vaults in server-process memory. Implement independent browser-generated holder keys and IndexedDB storage, with WebCrypto signing and an explicit recovery model.
2. **Credential claim ownership:** an email string match is not proof of mailbox control. Use single-use claim invitations or a verified email challenge.
3. **Challenge persistence:** the challenge cache remains process-local. Replace it with shared persistent storage and atomic one-time consumption before multi-instance deployment.
4. **Issuer key encryption:** issuer private-key encryption currently uses a fallback derived from the session secret rather than the configured independent `KMS_MASTER_KEY`. Implement independent envelope encryption and fail closed on missing production secrets.
5. **Database persistence:** repositories can silently fall back to in-memory storage on configuration or database failures. Production mode must require PostgreSQL and surface persistence failures.
6. **Blockchain simulation:** simulated mode remains part of the blockchain service. Real Sepolia mode must be explicitly configured, verified against chain ID and deployed contract bytecode, and visibly distinguished from simulation.
7. **Status snapshot verification:** freshness evaluation must require the on-chain digest to exist and match the exact status snapshot before returning `VALID_CURRENT`.
8. **Public data minimization:** public verification responses must not expose recipient email or unnecessary personal claims.
9. **W3C credential proof conformance:** the current VC signing implementation must be replaced or aligned with a supported W3C Data Integrity proof suite. A plain ECDSA signature encoded as a `JsonWebSignature2020` proof must not be described as standards-conformant without conformance testing.
10. **Standards profile:** use W3C Bitstring Status List v1.0 rather than describing the legacy StatusList2021 structure as equivalent.

## Merge criteria

Do not merge this branch until:

- All checks above have been executed in a reproducible environment.
- TypeScript compilation and application build pass.
- No presentation without a valid holder proof and audience-bound challenge can be accepted.
- Selective disclosure remains disabled until the real cryptosuite integration and independent interoperability/security tests pass.
- The benchmark runner cannot produce thesis results from simulated blockchain state or hard-coded gas numbers.
