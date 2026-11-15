import { describe, it, expect } from "vitest";
import { canonicalizeJson, computeKeccak256 } from "../../src/lib/crypto/canonical";

describe("JSON Canonicalization (RFC 8785)", () => {
  it("should produce identical canonical strings regardless of property insertion order", () => {
    const objA = {
      course: "Computer Science",
      grade: "A+",
      name: "Alice Smith",
      id: "CREDVAIL-2026-000001",
    };

    const objB = {
      id: "CREDVAIL-2026-000001",
      name: "Alice Smith",
      grade: "A+",
      course: "Computer Science",
    };

    expect(canonicalizeJson(objA)).toBe(canonicalizeJson(objB));
    expect(computeKeccak256(objA)).toBe(computeKeccak256(objB));
  });

  it("should canonicalize nested objects deterministically", () => {
    const nestedA = {
      recipient: { name: "Bob", email: "bob@example.com" },
      metadata: { issueDate: "2026-11-15", epoch: 1 },
    };

    const nestedB = {
      metadata: { epoch: 1, issueDate: "2026-11-15" },
      recipient: { email: "bob@example.com", name: "Bob" },
    };

    expect(canonicalizeJson(nestedA)).toBe(canonicalizeJson(nestedB));
    expect(computeKeccak256(nestedA)).toBe(computeKeccak256(nestedB));
  });
});
