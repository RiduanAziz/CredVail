import { describe, it, expect } from "vitest";
import { cn, formatBytes, generateRandomHex } from "../../src/lib/utils";
import { buttonVariants } from "../../src/components/ui/button";
import { badgeVariants } from "../../src/components/ui/badge";

describe("Design System & Utility Layer", () => {
  it("should merge tailwind classes properly using cn()", () => {
    const result = cn("px-2 py-1", "px-4", { "bg-red-500": true, "bg-blue-500": false });
    expect(result).toContain("px-4");
    expect(result).not.toContain("px-2");
    expect(result).toContain("bg-red-500");
  });

  it("should format bytes into human readable formats", () => {
    expect(formatBytes(0)).toBe("0 Bytes");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1048576)).toBe("1 MB");
  });

  it("should generate cryptographically secure random hex strings", () => {
    const hex1 = generateRandomHex(16);
    const hex2 = generateRandomHex(16);
    expect(hex1).toHaveLength(32);
    expect(hex2).toHaveLength(32);
    expect(hex1).not.toBe(hex2);
  });

  it("should define all required verification status badge variants", () => {
    const verifiedBadge = badgeVariants({ variant: "verified" });
    const revokedBadge = badgeVariants({ variant: "revoked" });
    const warningBadge = badgeVariants({ variant: "warning" });
    const epochBadge = badgeVariants({ variant: "epoch" });

    expect(verifiedBadge).toContain("emerald");
    expect(revokedBadge).toContain("red");
    expect(warningBadge).toContain("amber");
    expect(epochBadge).toContain("indigo");
  });
});
