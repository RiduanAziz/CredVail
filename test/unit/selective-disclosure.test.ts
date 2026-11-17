import { describe, it, expect } from "vitest";
import { SelectiveDisclosureEngine } from "@/lib/crypto/selective-disclosure";

describe("Selective disclosure security gate", () => {
  it("does not mint custom salted-JSON disclosure packages", () => {
    expect(() =>
      SelectiveDisclosureEngine.createDisclosurePackage({
        fullName: "Example Holder",
        grade: "A",
      })
    ).toThrow(/maintained W3C ecdsa-sd-2023 cryptosuite/i);
  });

  it("does not attach a non-standard disclosure structure to a credential", () => {
    expect(() =>
      SelectiveDisclosureEngine.attachSelectiveDisclosures({} as any, { grade: "A" })
    ).toThrow(/supported W3C Data Integrity cryptosuite/i);
  });

  it("does not generate a presentation using the legacy custom token format", () => {
    expect(() =>
      SelectiveDisclosureEngine.createSelectivePresentation({} as any)
    ).toThrow(/not interoperable or independently verifiable/i);
  });

  it("never reports a legacy custom disclosure presentation as valid", () => {
    const result = SelectiveDisclosureEngine.verifySelectivePresentation(
      {} as any,
      "unused"
    );

    expect(result.isValid).toBe(false);
    expect(result.issuerSignatureValid).toBe(false);
    expect(result.holderProofValid).toBe(false);
    expect(result.disclosedClaims).toEqual({});
  });
});
