import { describe, it, expect } from "vitest";
import { PdfGenerator, hexToRgb, replacePlaceholders } from "@/lib/pdf/pdf-generator";
import { CertificateTemplateRecord } from "@/types/template";
import { TEMPLATE_PRESETS } from "@/lib/templates/presets";

describe("Phase 6: PdfGenerator Unit Tests", () => {
  const mockTemplate: CertificateTemplateRecord = {
    id: "tmpl_test_1",
    tenantId: "tenant_apex",
    title: "Course Completion Certificate",
    description: "Standard course completion template",
    category: "COURSE_COMPLETION",
    dimensions: {
      width: 1120,
      height: 792,
      orientation: "LANDSCAPE",
      unit: "PX",
    },
    layoutConfig: TEMPLATE_PRESETS.COURSE_COMPLETION.layoutConfig,
    backgroundImageUrl: null,
    isDefault: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockClaims: Record<string, string> = {
    recipient_name: "Dr. Ada Lovelace",
    recipient_email: "ada.lovelace@analytical.org",
    certificate_number: "APEX-2026-000042",
    course_name: "Analytical Engine Cryptography",
    organization_name: "Apex Institute of Science",
    issue_date: "November 15, 2026",
    completionDate: "November 1, 2026",
    grade: "Distinction with Honors",
    instructor_name: "Prof. Charles Babbage",
    verification_url: "https://credvail.com/verify/APEX-2026-000042",
  };

  it("converts hex colors to normalized pdf-lib RGB correctly", () => {
    const white = hexToRgb("#ffffff");
    expect(white.red).toBeCloseTo(1, 2);
    expect(white.green).toBeCloseTo(1, 2);
    expect(white.blue).toBeCloseTo(1, 2);

    const black = hexToRgb("#000000");
    expect(black.red).toBeCloseTo(0, 2);
    expect(black.green).toBeCloseTo(0, 2);
    expect(black.blue).toBeCloseTo(0, 2);

    const gold = hexToRgb("#d97706");
    expect(gold.red).toBeCloseTo(217 / 255, 2);
    expect(gold.green).toBeCloseTo(119 / 255, 2);
    expect(gold.blue).toBeCloseTo(6 / 255, 2);

    // Fallback for invalid hex
    const invalid = hexToRgb("not-a-color");
    expect(invalid).toBeDefined();
  });

  it("replaces single and double-brace placeholders in template text", () => {
    const text = "This is to certify that {{recipient_name}} has completed {{course_name}} with {{grade}}.";
    const resolved = replacePlaceholders(text, mockClaims);
    expect(resolved).toBe(
      "This is to certify that Dr. Ada Lovelace has completed Analytical Engine Cryptography with Distinction with Honors."
    );
  });

  it("generates a valid print-ready vector PDF buffer starting with standard %PDF header", async () => {
    const pdfBytes = await PdfGenerator.generateCertificate({
      template: mockTemplate,
      claims: mockClaims,
      verificationUrl: "https://credvail.com/verify/APEX-2026-000042",
      tenantName: "Apex Institute",
    });

    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(1000);

    // Check PDF magic bytes (%PDF-)
    const header = Buffer.from(pdfBytes.slice(0, 5)).toString("ascii");
    expect(header).toBe("%PDF-");
  });

  it("supports all border styles: classic, modern, ornate, minimal", async () => {
    const styles = ["classic", "modern", "ornate", "minimal"] as const;

    for (const style of styles) {
      const t = {
        ...mockTemplate,
        layoutConfig: {
          ...mockTemplate.layoutConfig,
          border: {
            ...mockTemplate.layoutConfig.border,
            style,
          },
        },
      };

      const bytes = await PdfGenerator.generateCertificate({
        template: t,
        claims: mockClaims,
        verificationUrl: "https://credvail.com/verify/test",
        tenantName: "Apex Institute",
      });

      expect(bytes.length).toBeGreaterThan(1000);
      const header = Buffer.from(bytes.slice(0, 5)).toString("ascii");
      expect(header).toBe("%PDF-");
    }
  });
});
