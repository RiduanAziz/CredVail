import { describe, it, expect } from "vitest";
import {
  TEMPLATE_PRESETS,
  STANDARD_PLACEHOLDERS,
  DEFAULT_PAGE_DIMENSIONS,
} from "@/lib/templates/presets";
import { TemplateCategory } from "@/types/template";

describe("Certificate Template Presets & Placeholders", () => {
  const expectedCategories: TemplateCategory[] = [
    "COURSE_COMPLETION",
    "EVENT_PARTICIPATION",
    "INTERNSHIP_COMPLETION",
    "TRAINING_COMPLETION",
    "ACHIEVEMENT",
    "APPRECIATION",
    "MEMBERSHIP",
    "WORKSHOP_ATTENDANCE",
    "COMPETITION_PARTICIPATION",
    "CUSTOM",
  ];

  it("should provide factory presets for all 10 required certificate categories", () => {
    for (const cat of expectedCategories) {
      const preset = TEMPLATE_PRESETS[cat];
      expect(preset).toBeDefined();
      expect(preset.category).toBe(cat);
      expect(typeof preset.title).toBe("string");
      expect(typeof preset.description).toBe("string");
      expect(preset.layoutConfig).toBeDefined();
    }
  });

  it("each preset must contain valid landscape page dimensions and border configuration", () => {
    expect(DEFAULT_PAGE_DIMENSIONS.width).toBe(1120);
    expect(DEFAULT_PAGE_DIMENSIONS.height).toBe(792);
    expect(DEFAULT_PAGE_DIMENSIONS.orientation).toBe("LANDSCAPE");

    for (const cat of expectedCategories) {
      const layout = TEMPLATE_PRESETS[cat].layoutConfig;
      expect(layout.border).toBeDefined();
      expect(layout.border.width).toBeGreaterThanOrEqual(1);
      expect(layout.border.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(layout.backgroundColor).toBeDefined();
    }
  });

  it("each preset must contain all required dynamic placeholders", () => {
    const requiredPlaceholders = [
      "{{recipient_name}}",
      "{{certificate_number}}",
      "{{course_name}}",
      "{{organization_name}}",
      "{{verification_url}}",
    ];

    for (const cat of expectedCategories) {
      const layout = TEMPLATE_PRESETS[cat].layoutConfig;
      const allTextInFields = layout.fields.map((f) => f.placeholder).join(" ");

      for (const ph of requiredPlaceholders) {
        expect(allTextInFields).toContain(ph);
      }
    }
  });

  it("each preset must include configured QR positioning and signatures", () => {
    for (const cat of expectedCategories) {
      const layout = TEMPLATE_PRESETS[cat].layoutConfig;

      // QR Code check
      expect(layout.qrCode).toBeDefined();
      expect(layout.qrCode.x).toBeGreaterThan(0);
      expect(layout.qrCode.x).toBeLessThanOrEqual(100);
      expect(layout.qrCode.y).toBeGreaterThan(0);
      expect(layout.qrCode.y).toBeLessThanOrEqual(100);
      expect(layout.qrCode.size).toBeGreaterThanOrEqual(64);

      // Signatures check
      expect(layout.signatures).toBeDefined();
      expect(layout.signatures.length).toBeGreaterThanOrEqual(2);
      for (const sig of layout.signatures) {
        expect(sig.title).toBeDefined();
        expect(sig.signatoryName).toBeDefined();
        expect(sig.x).toBeGreaterThan(0);
        expect(sig.y).toBeGreaterThan(0);
      }
    }
  });

  it("STANDARD_PLACEHOLDERS dictionary must contain all 9 required master prompt variables", () => {
    const masterVariables = [
      "{{recipient_name}}",
      "{{certificate_number}}",
      "{{course_name}}",
      "{{organization_name}}",
      "{{issue_date}}",
      "{{completion_date}}",
      "{{grade}}",
      "{{instructor_name}}",
      "{{verification_url}}",
    ];

    const definedKeys = STANDARD_PLACEHOLDERS.map((p) => p.key);
    for (const v of masterVariables) {
      expect(definedKeys).toContain(v);
    }
  });
});
