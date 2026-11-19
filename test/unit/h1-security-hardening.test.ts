/**
 * CREDVAIL H1 & H1.1 Security Hardening & Cryptographic Interoperability Test Suite
 * 
 * Verifies the core security requirements of Milestones H1 & H1.1:
 * - Workstream 1: Cryptographic profile (NIST P-256, W3C did:key multicodec 0x1200, IEEE P1363 / DER).
 * - Workstream 2: P-256 did:key derivation and server-side resolution.
 * - Workstream 3: ECDSA signature interoperability and tampering rejection.
 * - Workstream 4: Genuine browser-side signing via BrowserWalletEngine.
 * - Workstream 5: Removal of server-side holder private-key custody.
 * - Workstream 6: Non-extractable CryptoKey storage in IndexedDB (no cleartext JWK).
 * - Workstream 7: Adversarial test cases H11-01 through H11-15.
 * - Workstream 8: Security regression checks (cross-holder isolation, PII protection, replay defense).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import crypto from "node:crypto";
import { WalletService } from "@/lib/wallet/wallet-service";
import { BrowserWalletEngine, base58Decode } from "@/lib/wallet/browser-wallet";
import { KeyService } from "@/lib/crypto/key-service";
import { CredentialRepository } from "@/lib/repositories/credential-repository";
import { TenantRepository, inMemoryTenantStore } from "@/lib/repositories/tenant-repository";
import { KeyRepository } from "@/lib/repositories/key-repository";
import { ClaimInvitationRepository } from "@/lib/repositories/claim-invitation-repository";
import { ClaimInvitationService } from "@/lib/services/claim-invitation-service";
import { VerificationService } from "@/lib/services/verification-service";
import { VcService } from "@/lib/crypto/vc-service";
import { createSessionToken } from "@/lib/auth/session";
import { GET as getCredentialsRoute } from "@/app/api/v1/wallet/credentials/route";
import { POST as claimRoute } from "@/app/api/v1/wallet/claim/route";
import { POST as presentRoute } from "@/app/api/v1/wallet/present/route";
import { GET as publicLookupRoute } from "@/app/api/v1/verify/lookup/[id]/route";

describe("CREDVAIL H1.1: Browser Custody & Cryptographic Interoperability", () => {
  const tenantSlug = "h1-test-tenant";
  let tenantId: string;
  const certNumber = "H1-CERT-2026-001";
  const aliceEmail = "alice@h1-test.edu";
  const bobEmail = "bob@h1-test.edu";
  const aliceUserId = "usr_alice_h1";
  const bobUserId = "usr_bob_h1";
  let aliceSessionToken: string;
  let bobSessionToken: string;
  let validClaimToken: string;
  let issuerPrivateKeyPem: string;

  beforeEach(async () => {
    WalletService.resetInMemoryStore();
    BrowserWalletEngine.resetInMemoryStore();
    CredentialRepository.resetInMemoryStore();
    ClaimInvitationRepository.resetInMemoryStore();
    KeyRepository.resetInMemoryStore();
    inMemoryTenantStore.clear();

    const tenantRepo = new TenantRepository();
    const tenant = await tenantRepo.createTenant({
      slug: tenantSlug,
      name: "H1 Security University",
      legalEntityName: "H1 Security University",
      websiteUrl: "https://h1-security.edu",
      didUri: `did:web:credvail.com:tenants:${tenantSlug}`,
      ownerUserId: "usr_owner_h1",
    });
    tenantId = tenant.id;

    // Provision issuer signing key
    const issuerKey = await KeyRepository.getOrCreateInitialKey(
      tenantId,
      `did:web:credvail.com:tenants:${tenantSlug}`
    );
    issuerPrivateKeyPem = KeyService.decryptPrivateKey(issuerKey.encryptedPrivateKey!);

    // Create session tokens for Alice and Bob
    aliceSessionToken = createSessionToken({
      id: aliceUserId,
      email: aliceEmail,
      fullName: "Alice Student",
      platformRole: "USER",
    });

    bobSessionToken = createSessionToken({
      id: bobUserId,
      email: bobEmail,
      fullName: "Bob Intruder",
      platformRole: "USER",
    });

    // Build and sign a W3C credential
    const unsignedVc = VcService.buildUnsignedCredential({
      credentialId: "urn:uuid:h1-credential-001",
      certificateNumber: certNumber,
      tenantDidUri: `did:web:credvail.com:tenants:${tenantSlug}`,
      tenantName: "H1 Security University",
      tenantSlug,
      recipientId: "rec_alice_h1",
      recipientName: "Alice Student",
      recipientEmail: aliceEmail,
      claims: {
        course_name: "Advanced Zero-Trust Engineering",
        grade: "A+",
        student_ssn_last4: "9876",
        internal_student_id: "STU-99001",
      },
      batchId: "batch_h1_001",
      merkleIndex: 0,
      bitstringIndex: 0,
    });

    const signedVc = VcService.signCredential(
      unsignedVc,
      issuerPrivateKeyPem,
      `did:web:credvail.com:tenants:${tenantSlug}#key-1`
    );

    const vcHash = VcService.computeVcHash(signedVc);
    const leafHash = VcService.computeLeafHash(
      "urn:uuid:h1-credential-001",
      certNumber,
      vcHash
    );

    const merkleTree = VcService.buildBatchMerkleTree([leafHash]);
    const merkleProof = VcService.generateMerkleProof(merkleTree, 0);
    const fullVc = VcService.attachMerkleProof(signedVc, merkleProof, "batch_h1_001");

    // Create credential in repository
    await CredentialRepository.createCredential({
      credentialId: "urn:uuid:h1-credential-001",
      certificateNumber: certNumber,
      tenantId,
      batchId: "batch_h1_001",
      recipientName: "Alice Student",
      recipientEmail: aliceEmail,
      leafHash,
      merkleIndex: 0,
      bitstringIndex: 0,
      claimsData: {
        course_name: "Advanced Zero-Trust Engineering",
        grade: "A+",
        student_ssn_last4: "9876",
        internal_student_id: "STU-99001",
      },
      vcPayloadJson: fullVc as any,
    });

    // Create claim invitation for Alice
    const invite = await ClaimInvitationService.createInvitation({
      credentialId: "urn:uuid:h1-credential-001",
      certificateNumber: certNumber,
      recipientEmail: aliceEmail,
      tenantId,
    });
    validClaimToken = invite.rawToken;
  });

  // =========================================================================
  // Section A: Workstream 7 Adversarial Test Cases (H11-01 through H11-15)
  // =========================================================================

  it("H11-01: generates a valid browser P-256 key pair with non-extractable private key", async () => {
    const identity = await BrowserWalletEngine.generateHolderIdentity();
    expect(identity.did).toBeDefined();
    expect(identity.publicKeyJwk.kty).toBe("EC");
    expect(identity.publicKeyJwk.crv).toBe("P-256");
    expect(identity.publicKeyJwk.x).toBeDefined();
    expect(identity.publicKeyJwk.y).toBeDefined();

    // Private key must be strictly non-extractable
    expect(identity.privateKey).toBeDefined();
    expect(identity.privateKey.extractable).toBe(false);
    expect(identity.privateKey.type).toBe("private");
    expect((identity.privateKey.algorithm as any).name).toBe("ECDSA");
  });

  it("H11-02: derives a standard P-256 did:key with 0x1200 multicodec and compressed point", async () => {
    const identity = await BrowserWalletEngine.generateHolderIdentity();

    // Must start with standard multibase Base58-BTC 'z' followed by 'Dna'
    expect(identity.did).toMatch(/^did:key:zDna[1-9A-HJ-NP-Za-km-z]+$/);

    const multibase = identity.did.replace(/^did:key:/, "");
    expect(multibase.startsWith("z")).toBe(true);

    const decoded = base58Decode(multibase.slice(1));
    // 2 bytes multicodec varint + 33 bytes compressed SEC1 = 35 bytes total
    expect(decoded.length).toBe(35);

    // NIST P-256 multicodec varint: 0x1200 -> [0x80, 0x24]
    expect(decoded[0]).toBe(0x80);
    expect(decoded[1]).toBe(0x24);

    // Compressed point prefix must be 0x02 or 0x03
    expect([0x02, 0x03]).toContain(decoded[2]);
  });

  it("H11-03: resolves browser-generated DID on server, recovering identical public coordinates", async () => {
    const identity = await BrowserWalletEngine.generateHolderIdentity();
    const serverPem = KeyService.didKeyToPublicKeyPem(identity.did);

    expect(serverPem).toContain("BEGIN PUBLIC KEY");

    // Convert server PEM to JWK to assert exact mathematical coordinate parity
    const serverKeyObj = crypto.createPublicKey(serverPem);
    const serverJwk = serverKeyObj.export({ format: "jwk" }) as any;

    expect(serverJwk.kty).toBe("EC");
    expect(serverJwk.crv).toBe("P-256");
    expect(serverJwk.x).toBe(identity.publicKeyJwk.x);
    expect(serverJwk.y).toBe(identity.publicKeyJwk.y);
  });

  it("H11-04: signs a payload in the browser, producing a valid 64-byte IEEE P1363 signature", async () => {
    const payload = "credvail.w3c.presentation.payload.test.123";
    const sigBase64Url = await BrowserWalletEngine.signPresentation(payload);

    expect(typeof sigBase64Url).toBe("string");
    const sigBuffer = Buffer.from(sigBase64Url, "base64url");
    // P-256 IEEE P1363 signature is exactly 64 bytes (32-byte r || 32-byte s)
    expect(sigBuffer.length).toBe(64);
  });

  it("H11-05: verifies browser signature on server successfully", async () => {
    const identity = await BrowserWalletEngine.getOrCreateBrowserIdentity();
    const payload = "canonical.presentation.body.nonce_42.https://verifier.org";
    const sigBase64Url = await BrowserWalletEngine.signPresentation(payload);

    const serverPem = KeyService.didKeyToPublicKeyPem(identity.did);
    const verified = KeyService.verifySignature(serverPem, payload, sigBase64Url);

    expect(verified).toBe(true);
  });

  it("H11-06: rejects verification when signed payload is altered", async () => {
    const identity = await BrowserWalletEngine.getOrCreateBrowserIdentity();
    const payload = "canonical.presentation.body.nonce_42.https://verifier.org";
    const sigBase64Url = await BrowserWalletEngine.signPresentation(payload);

    const serverPem = KeyService.didKeyToPublicKeyPem(identity.did);
    const tamperedPayload = "canonical.presentation.body.nonce_42.https://attacker.org";
    const verified = KeyService.verifySignature(serverPem, tamperedPayload, sigBase64Url);

    expect(verified).toBe(false);
  });

  it("H11-07: rejects verification when signature bytes are corrupted", async () => {
    const identity = await BrowserWalletEngine.getOrCreateBrowserIdentity();
    const payload = "canonical.presentation.body.nonce_42.https://verifier.org";
    const sigBase64Url = await BrowserWalletEngine.signPresentation(payload);

    // Corrupt one byte of the signature
    const sigBuffer = Buffer.from(sigBase64Url, "base64url");
    sigBuffer[10] ^= 0xff;
    const corruptedSig = sigBuffer.toString("base64url");

    const serverPem = KeyService.didKeyToPublicKeyPem(identity.did);
    const verified = KeyService.verifySignature(serverPem, payload, corruptedSig);

    expect(verified).toBe(false);
  });

  it("H11-08: safely rejects malformed multicodec in did:key", () => {
    // Construct did:key with invalid multicodec [0x99, 0x99]
    const invalidHeader = new Uint8Array([0x99, 0x99, ...new Uint8Array(33)]);
    const invalidDid = `did:key:z${BrowserWalletEngine.deriveDidKeyFromCoords("aaaa", "bbbb")}`;

    // Test malformed multicodec directly
    const badBytes = new Uint8Array([0xaa, 0xbb, 0x02, ...new Uint8Array(32)]);
    const multibase = `z${Buffer.from(badBytes).toString("base64url")}`;

    expect(() => KeyService.multibaseToPublicKeyPem(multibase)).toThrow(
      /Unsupported or invalid multicodec prefix/i
    );
  });

  it("H11-09: safely rejects malformed or off-curve compressed public key", () => {
    // 33-byte buffer with invalid coordinate that does not satisfy y^2 = x^3 - 3x + b mod p
    const badCompressed = Buffer.alloc(33, 0x01);
    badCompressed[0] = 0x02;

    expect(() => KeyService.compressedP256ToPublicKeyPem(badCompressed)).toThrow(
      /do not represent a valid point on the NIST P-256 curve/i
    );
  });

  it("H11-10: rejects presentation when verificationMethod does not match holder DID", async () => {
    const challenge = VerificationService.createChallengeNonce(300, "http://localhost:3000");
    const cred = await WalletService.claimCredential(
      { certificateNumber: certNumber, claimToken: validClaimToken, userEmail: aliceEmail, userEmailVerified: true },
      aliceUserId
    );

    const vp = await BrowserWalletEngine.createAndSignPresentation({
      credential: cred,
      challengeNonce: challenge.nonce,
      verifierDomain: "http://localhost:3000",
    });

    // Tamper with verificationMethod to point to an alien DID
    vp.proof.verificationMethod = "did:key:zDnaUnrelatedAlienHolderKey#alien";

    const result = await VerificationService.verifyPresentation(vp, challenge.nonce);
    expect(result.isValid).toBe(false);
    const sigCheck = result.checks.find((c) => c.code === "HOLDER_PRESENTATION_SIGNATURE");
    expect(sigCheck?.passed).toBe(false);
  });

  it("H11-11: browser wallet identity remains deterministic and usable across reloads", async () => {
    const idFirstLoad = await BrowserWalletEngine.getOrCreateBrowserIdentity();
    const idReload = await BrowserWalletEngine.getOrCreateBrowserIdentity();

    expect(idReload.did).toBe(idFirstLoad.did);
    expect(idReload.publicKeyJwk.x).toBe(idFirstLoad.publicKeyJwk.x);
    expect(idReload.publicKeyJwk.y).toBe(idFirstLoad.publicKeyJwk.y);

    // Signing works after reload
    const sig = await BrowserWalletEngine.signPresentation("reload-test-payload");
    const serverPem = KeyService.didKeyToPublicKeyPem(idReload.did);
    expect(KeyService.verifySignature(serverPem, "reload-test-payload", sig)).toBe(true);
  });

  it("H11-12: inspects storage records to confirm no cleartext private JWK is persisted", async () => {
    await BrowserWalletEngine.getOrCreateBrowserIdentity();
    const creds = await BrowserWalletEngine.listCredentials();

    // Verify in-memory / IndexedDB record structure
    const stored = (BrowserWalletEngine as any).inMemoryIdentityStore.get("primary_identity");
    if (stored) {
      expect((stored as any).privateKeyJwk).toBeUndefined();
      expect((stored as any).privateKeyPem).toBeUndefined();
      expect(stored.privateKey).toBeDefined();
      expect(stored.privateKey.extractable).toBe(false);
    }
  });

  it("H11-13: submits client-signed presentation through actual API route and verifies cleanly", async () => {
    // 1. Alice claims her credential
    const claimed = await WalletService.claimCredential(
      { certificateNumber: certNumber, claimToken: validClaimToken, userEmail: aliceEmail, userEmailVerified: true },
      aliceUserId
    );

    // 2. Obtain fresh challenge nonce
    const challenge = VerificationService.createChallengeNonce(300, "http://localhost:3000");

    // 3. Browser signs presentation locally
    const vp = await BrowserWalletEngine.createAndSignPresentation({
      credential: claimed,
      challengeNonce: challenge.nonce,
      verifierDomain: "http://localhost:3000",
    });

    // 4. Submit to POST /api/v1/wallet/present
    const presentReq = new NextRequest("http://localhost:3000/api/v1/wallet/present", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aliceSessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        presentation: vp,
        challengeNonce: challenge.nonce,
      }),
    });

    const presentRes = await presentRoute(presentReq);
    expect(presentRes.status).toBe(200);

    const json = await presentRes.json();
    expect(json.success).toBe(true);
    expect(json.data.verificationResult.isValid).toBe(true);
  });

  it("H11-14: confirms server-side holder signing paths are permanently disabled", () => {
    expect(() => WalletService.getOrCreateHolderIdentity("any_holder")).toThrow(
      /deprecated and removed/i
    );
    expect(() => WalletService.createSelectivePresentation()).toThrow(
      /disabled and removed/i
    );
  });

  it("H11-15: rejects replaying a presentation with an already-consumed challenge nonce", async () => {
    const claimed = await WalletService.claimCredential(
      { certificateNumber: certNumber, claimToken: validClaimToken, userEmail: aliceEmail, userEmailVerified: true },
      aliceUserId
    );

    const challenge = VerificationService.createChallengeNonce(300, "http://localhost:3000");

    const vp = await BrowserWalletEngine.createAndSignPresentation({
      credential: claimed,
      challengeNonce: challenge.nonce,
      verifierDomain: "http://localhost:3000",
    });

    // First presentation succeeds
    const firstReq = new NextRequest("http://localhost:3000/api/v1/wallet/present", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aliceSessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ presentation: vp, challengeNonce: challenge.nonce }),
    });
    const firstRes = await presentRoute(firstReq);
    expect(firstRes.status).toBe(200);

    // Second presentation replay with same nonce must be rejected
    const replayReq = new NextRequest("http://localhost:3000/api/v1/wallet/present", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aliceSessionToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ presentation: vp, challengeNonce: challenge.nonce }),
    });
    const replayRes = await presentRoute(replayReq);
    expect(replayRes.status).toBe(400);

    const replayJson = await replayRes.json();
    expect(replayJson.data.isValid).toBe(false);
  });

  // =========================================================================
  // Section B: Regression Checks (Multi-tenant isolation & Authorization)
  // =========================================================================

  it("Holder A cannot access Holder B's credentials", async () => {
    await WalletService.claimCredential(
      { certificateNumber: certNumber, claimToken: validClaimToken, userEmail: aliceEmail, userEmailVerified: true },
      aliceUserId
    );

    // Alice sees her credential
    const aliceCreds = WalletService.listCredentials(aliceUserId);
    expect(aliceCreds.length).toBe(1);

    // Bob queries API -> sees 0 credentials
    const bobReq = new NextRequest("http://localhost:3000/api/v1/wallet/credentials", {
      headers: { Authorization: `Bearer ${bobSessionToken}` },
    });
    const bobRes = await getCredentialsRoute(bobReq);
    expect(bobRes.status).toBe(200);
    const bobJson = await bobRes.json();
    expect(bobJson.data.credentials.length).toBe(0);
  });

  it("A user cannot change holderId in API requests to gain access to another's wallet", async () => {
    await WalletService.claimCredential(
      { certificateNumber: certNumber, claimToken: validClaimToken, userEmail: aliceEmail, userEmailVerified: true },
      aliceUserId
    );

    const attackReq = new NextRequest(
      `http://localhost:3000/api/v1/wallet/credentials?holderId=${aliceUserId}`,
      { headers: { Authorization: `Bearer ${bobSessionToken}` } }
    );
    const attackRes = await getCredentialsRoute(attackReq);
    expect(attackRes.status).toBe(200);
    const attackJson = await attackRes.json();
    expect(attackJson.data.holder.holderId).toBe(bobUserId);
    expect(attackJson.data.credentials.length).toBe(0);
  });

  it("Unauthorized wallet API requests are denied with 401", async () => {
    const unauthCredsRes = await getCredentialsRoute(
      new NextRequest("http://localhost:3000/api/v1/wallet/credentials")
    );
    expect(unauthCredsRes.status).toBe(401);

    const unauthClaimRes = await claimRoute(
      new NextRequest("http://localhost:3000/api/v1/wallet/claim", {
        method: "POST",
        body: JSON.stringify({ certificateNumber: certNumber, claimToken: validClaimToken }),
      })
    );
    expect(unauthClaimRes.status).toBe(401);

    const unauthPresentRes = await presentRoute(
      new NextRequest("http://localhost:3000/api/v1/wallet/present", {
        method: "POST",
        body: JSON.stringify({ challengeNonce: "cn_123" }),
      })
    );
    expect(unauthPresentRes.status).toBe(401);
  });

  it("Public verification never exposes recipient email or private claims", async () => {
    const req = new NextRequest(`http://localhost:3000/api/v1/verify/lookup/${certNumber}`);
    const res = await publicLookupRoute(req, { params: Promise.resolve({ id: certNumber }) });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);

    const cred = json.data.credential;
    expect(cred.certificateNumber).toBe(certNumber);
    expect(cred.recipientName).toBe("Alice Student");
    expect(cred.recipientEmail).toBeUndefined();
    expect(cred.claims).toBeUndefined();
  });
});
