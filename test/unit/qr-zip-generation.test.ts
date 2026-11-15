import { describe, it, expect } from "vitest";
import { QrService } from "@/lib/pdf/qr-service";
import { ZipService } from "@/lib/pdf/zip-service";
import { unzipSync } from "fflate";

describe("Phase 6: QR & ZIP Generation Unit Tests", () => {
  it("generates QR codes in Data URL format and PNG Buffer format", async () => {
    const url = "https://credvail.com/verify/test-cred-123456";
    const result = await QrService.generateVerificationQr(url, {
      size: 150,
      errorCorrectionLevel: "M",
    });

    expect(result.verificationUrl).toBe(url);
    expect(result.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
    expect(result.pngBuffer).toBeInstanceOf(Buffer);
    expect(result.pngBuffer.length).toBeGreaterThan(100);

    // PNG signature check: 0x89 0x50 0x4E 0x47
    expect(result.pngBuffer[0]).toBe(0x89);
    expect(result.pngBuffer[1]).toBe(0x50);
    expect(result.pngBuffer[2]).toBe(0x4e);
    expect(result.pngBuffer[3]).toBe(0x47);
  });

  it("generates valid SVG representation of QR codes", async () => {
    const url = "https://credvail.com/verify/test-cred-123456";
    const svg = await QrService.generateSvg(url);

    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.includes("</svg>")).toBe(true);
  });

  it("compresses multiple PDF files into a valid ZIP archive", () => {
    const pdf1 = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x35]);
    const pdf2 = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

    const zipBytes = ZipService.createBatchArchive([
      { filename: "CERT-001_Alice.pdf", data: pdf1 },
      { filename: "CERT-002_Bob.pdf", data: pdf2 },
    ]);

    expect(zipBytes).toBeInstanceOf(Uint8Array);
    expect(zipBytes.length).toBeGreaterThan(50);

    // ZIP magic bytes: 'PK\x03\x04'
    expect(zipBytes[0]).toBe(0x50);
    expect(zipBytes[1]).toBe(0x4b);
    expect(zipBytes[2]).toBe(0x03);
    expect(zipBytes[3]).toBe(0x04);

    // Verify unzipping restores original files
    const unzipped = unzipSync(zipBytes);
    expect(Object.keys(unzipped)).toContain("CERT-001_Alice.pdf");
    expect(Object.keys(unzipped)).toContain("CERT-002_Bob.pdf");
    expect(Buffer.from(unzipped["CERT-001_Alice.pdf"]).toString()).toBe("%PDF-1.5");
  });

  it("throws an error when attempting to create an empty ZIP archive", () => {
    expect(() => ZipService.createBatchArchive([])).toThrow("at least one file is required");
  });
});
