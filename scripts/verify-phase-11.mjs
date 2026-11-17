/**
 * CREDVAIL Phase 11 Security Gate
 *
 * The custom salted-JSON disclosure implementation has been disabled because
 * it is not an interoperable W3C ecdsa-sd-2023 implementation. These checks
 * ensure the application fails closed until a standards implementation lands.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

test("1. Holder wallet and selective-disclosure architecture files exist", () => {
  const requiredFiles = [
    "src/lib/crypto/selective-disclosure.ts",
    "src/lib/wallet/wallet-service.ts",
    "src/app/api/v1/wallet/claim/route.ts",
    "src/app/api/v1/wallet/credentials/route.ts",
    "src/app/api/v1/wallet/present/route.ts",
    "src/app/wallet/page.tsx",
  ];
  for (const relPath of requiredFiles) {
    assert.ok(fs.existsSync(path.join(rootDir, relPath)), `Missing required file: ${relPath}`);
  }
});

test("2. Legacy custom disclosure issuance is explicitly disabled", async () => {
  const { SelectiveDisclosureEngine } = await import("../src/lib/crypto/selective-disclosure.ts");
  assert.throws(
    () => SelectiveDisclosureEngine.createDisclosurePackage({ grade: "A" }),
    /maintained W3C ecdsa-sd-2023 cryptosuite/i
  );
  assert.throws(
    () => SelectiveDisclosureEngine.attachSelectiveDisclosures({} as any, {}),
    /supported W3C Data Integrity cryptosuite/i
  );
  assert.throws(
    () => SelectiveDisclosureEngine.createSelectivePresentation({} as any),
    /not interoperable or independently verifiable/i
  );
});

test("3. Legacy selective-disclosure verification can never report success", async () => {
  const { SelectiveDisclosureEngine } = await import("../src/lib/crypto/selective-disclosure.ts");
  const result = SelectiveDisclosureEngine.verifySelectivePresentation({} as any, "unused");
  assert.equal(result.isValid, false);
  assert.equal(result.issuerSignatureValid, false);
  assert.equal(result.holderProofValid, false);
  assert.deepEqual(result.disclosedClaims, {});
});

test("4. Presentation verification requires a challenge and holder proof", async () => {
  const { VerificationService } = await import("../src/lib/services/verification-service.ts");
  const challenge = VerificationService.createChallengeNonce(300, "https://verifier.example.test");
  const result = await VerificationService.verifyPresentation({
    type: ["VerifiablePresentation"],
    verifiableCredential: [],
  }, challenge.nonce);

  assert.equal(result.isValid, false);
  assert.equal(result.status, "INVALID");
  assert.equal(
    result.checks.find((item) => item.code === "CHALLENGE_NONCE_VERIFICATION")?.passed,
    false
  );
  assert.equal(
    result.checks.find((item) => item.code === "HOLDER_PRESENTATION_SIGNATURE")?.passed,
    false
  );
});

test("5. Challenge nonces are one-use and audience-bound", async () => {
  const { VerificationService } = await import("../src/lib/services/verification-service.ts");
  const audience = "https://verifier.example.test";
  const challenge = VerificationService.createChallengeNonce(300, audience);

  assert.equal(challenge.audience, audience);
  assert.equal(VerificationService.consumeChallengeNonce(challenge.nonce), true);
  assert.equal(VerificationService.consumeChallengeNonce(challenge.nonce), false);
});
