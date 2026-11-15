import { keccak256, toHex, stringToBytes } from "viem";

/**
 * Deterministically canonicalizes a JSON value according to RFC 8785 principles.
 * Ensures consistent serialization regardless of key ordering in JavaScript objects.
 */
export function canonicalizeJson(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return `[${obj.map((item) => canonicalizeJson(item)).join(",")}]`;
  }

  const sortedKeys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = sortedKeys.map((key) => {
    const val = (obj as Record<string, unknown>)[key];
    return `${JSON.stringify(key)}:${canonicalizeJson(val)}`;
  });

  return `{${pairs.join(",")}}`;
}

/**
 * Computes deterministic Keccak-256 hash of a string or canonical object.
 */
export function computeKeccak256(input: string | Record<string, unknown>): `0x${string}` {
  const serialized = typeof input === "string" ? input : canonicalizeJson(input);
  return keccak256(stringToBytes(serialized));
}
