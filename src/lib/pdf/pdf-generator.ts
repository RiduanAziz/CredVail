/**
 * CREDVAIL Pixel-Perfect Vector PDF Generator
 * 
 * Generates print-ready high-resolution vector PDF certificates
 * using pdf-lib with dynamic typography, decorative borders,
 * embedded QR codes, institutional signatures, and brand assets.
 */

import { PDFDocument, rgb, StandardFonts, type PDFFont, type RGB } from "pdf-lib";
import type { CertificateTemplateRecord, TemplateLayoutConfig, BorderConfig } from "../../types/template.ts";
import { QrService } from "./qr-service.ts";

export interface GeneratePdfOptions {
  template: CertificateTemplateRecord;
  claims: Record<string, string>;
  verificationUrl: string;
  tenantName: string;
  tenantLogoUrl?: string | null;
  qrPngBuffer?: Buffer;
}

/**
 * Parses hex color strings (e.g. #0f172a, #d97706, #fff) into pdf-lib RGB.
 */
export function hexToRgb(hex?: string): RGB {
  if (!hex || typeof hex !== "string") {
    return rgb(0.1, 0.1, 0.1);
  }

  let clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    clean = clean.split("").map((c) => c + c).join("");
  }

  if (clean.length !== 6) {
    return rgb(0.1, 0.1, 0.1);
  }

  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;

  return rgb(
    isNaN(r) ? 0 : Math.max(0, Math.min(1, r)),
    isNaN(g) ? 0 : Math.max(0, Math.min(1, g)),
    isNaN(b) ? 0 : Math.max(0, Math.min(1, b))
  );
}

/**
 * Replaces placeholders in text with actual claim values.
 */
export function replacePlaceholders(text: string, claims: Record<string, string>): string {
  if (!text) return "";
  let resolved = text;
  for (const [key, val] of Object.entries(claims)) {
    // Match either {{key}} or just key
    const pattern = key.startsWith("{{") ? key : `{{${key}}}`;
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    resolved = resolved.replace(new RegExp(escaped, "g"), val || "");
  }
  return resolved;
}

export class PdfGenerator {
  /**
   * Generates a single print-ready certificate PDF document as a Uint8Array buffer.
   */
  static async generateCertificate(options: GeneratePdfOptions): Promise<Uint8Array> {
    const { template, claims, verificationUrl, tenantName, tenantLogoUrl } = options;
    const layout = template.layoutConfig;

    const doc = await PDFDocument.create();

    // Configure Page Dimensions
    const width = template.dimensions?.width || 1120;
    const height = template.dimensions?.height || 792;
    const page = doc.addPage([width, height]);

    // Embed Standard Vector Fonts
    const helvetica = await doc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);
    const helveticaOblique = await doc.embedFont(StandardFonts.HelveticaOblique);
    const timesRoman = await doc.embedFont(StandardFonts.TimesRoman);
    const timesRomanBold = await doc.embedFont(StandardFonts.TimesRomanBold);
    const timesRomanItalic = await doc.embedFont(StandardFonts.TimesRomanItalic);
    const courier = await doc.embedFont(StandardFonts.Courier);
    const courierBold = await doc.embedFont(StandardFonts.CourierBold);

    // Font Resolver Helper
    const resolveFont = (fontFamily?: string, fontWeight?: string, fontStyle?: string): PDFFont => {
      const family = (fontFamily || "Inter").toLowerCase();
      const isBold = fontWeight === "bold" || fontWeight === "semibold";
      const isItalic = fontStyle === "italic";

      if (family.includes("times") || family.includes("serif") || family.includes("cinzel") || family.includes("playfair")) {
        if (isBold) return timesRomanBold;
        if (isItalic) return timesRomanItalic;
        return timesRoman;
      }

      if (family.includes("courier") || family.includes("mono")) {
        if (isBold) return courierBold;
        return courier;
      }

      if (isBold) return helveticaBold;
      if (isItalic) return helveticaOblique;
      return helvetica;
    };

    // 1. Draw Background
    const bgColor = hexToRgb(layout.backgroundColor || "#ffffff");
    page.drawRectangle({
      x: 0,
      y: 0,
      width,
      height,
      color: bgColor,
    });

    // 2. Draw Decorative Borders
    this.drawBorder(page, width, height, layout.border);

    // 3. Render Institutional Logo if provided
    const logoDataUrl = layout.logo?.url || tenantLogoUrl;
    if (logoDataUrl && logoDataUrl.startsWith("data:image/")) {
      try {
        const base64Data = logoDataUrl.split(",")[1];
        if (base64Data) {
          const imageBuffer = Buffer.from(base64Data, "base64");
          let logoImage;
          if (logoDataUrl.includes("image/jpeg") || logoDataUrl.includes("image/jpg")) {
            logoImage = await doc.embedJpg(imageBuffer);
          } else {
            logoImage = await doc.embedPng(imageBuffer);
          }

          const logoW = layout.logo.width || 80;
          const logoH = layout.logo.height || 80;
          const logoX = (layout.logo.x / 100) * width - logoW / 2;
          const logoY = height - (layout.logo.y / 100) * height - logoH / 2;

          page.drawImage(logoImage, {
            x: Math.max(0, logoX),
            y: Math.max(0, logoY),
            width: logoW,
            height: logoH,
          });
        }
      } catch (err) {
        // Logo embedding failure must not prevent PDF generation
        console.warn("[PdfGenerator] Failed to embed logo image:", err);
      }
    }

    // 4. Render Dynamic Template Fields
    if (layout.fields && Array.isArray(layout.fields)) {
      for (const field of layout.fields) {
        const rawText = field.placeholder || field.defaultValue || "";
        const renderedText = replacePlaceholders(rawText, claims);
        if (!renderedText) continue;

        const font = resolveFont(field.fontFamily, field.fontWeight, field.fontStyle);
        const fontSize = field.fontSize || 16;
        const textColor = hexToRgb(field.color || "#0f172a");

        const textWidth = font.widthOfTextAtSize(renderedText, fontSize);
        const textHeight = font.heightAtSize(fontSize);

        // Convert percentage coordinates (top-left origin) to PDF points (bottom-left origin)
        let xPt = (field.x / 100) * width;
        const yPt = height - (field.y / 100) * height - textHeight / 2;

        if (field.align === "center") {
          xPt -= textWidth / 2;
        } else if (field.align === "right") {
          xPt -= textWidth;
        }

        page.drawText(renderedText, {
          x: Math.max(10, xPt),
          y: Math.max(10, yPt),
          size: fontSize,
          font,
          color: textColor,
        });
      }
    }

    // 5. Render Institutional Signatures
    if (layout.signatures && Array.isArray(layout.signatures)) {
      for (const sig of layout.signatures) {
        const sigW = (sig.width / 100) * width || 160;
        const sigX = (sig.x / 100) * width - sigW / 2;
        const sigY = height - (sig.y / 100) * height;

        // Draw Signature Line
        page.drawLine({
          start: { x: sigX, y: sigY },
          end: { x: sigX + sigW, y: sigY },
          thickness: 1,
          color: hexToRgb("#64748b"),
        });

        // Draw Signatory Image if available
        if (sig.signatureImageUrl && sig.signatureImageUrl.startsWith("data:image/")) {
          try {
            const sigBase64 = sig.signatureImageUrl.split(",")[1];
            if (sigBase64) {
              const sigImgBuffer = Buffer.from(sigBase64, "base64");
              const sigImage = await doc.embedPng(sigImgBuffer);
              page.drawImage(sigImage, {
                x: sigX + 10,
                y: sigY + 4,
                width: sigW - 20,
                height: 38,
              });
            }
          } catch {
            // Non-fatal signature image error
          }
        }

        // Draw Signatory Name
        const resolvedName = replacePlaceholders(sig.signatoryName, claims);
        const nameWidth = helveticaBold.widthOfTextAtSize(resolvedName, 11);
        page.drawText(resolvedName, {
          x: sigX + sigW / 2 - nameWidth / 2,
          y: sigY - 14,
          size: 11,
          font: helveticaBold,
          color: hexToRgb("#0f172a"),
        });

        // Draw Signatory Title
        const resolvedTitle = replacePlaceholders(sig.title, claims);
        const titleWidth = helvetica.widthOfTextAtSize(resolvedTitle, 9);
        page.drawText(resolvedTitle, {
          x: sigX + sigW / 2 - titleWidth / 2,
          y: sigY - 26,
          size: 9,
          font: helvetica,
          color: hexToRgb("#64748b"),
        });
      }
    }

    // 6. Render Cryptographic Verification QR Code
    let qrPngBuffer = options.qrPngBuffer;
    if (!qrPngBuffer) {
      const qrResult = await QrService.generateVerificationQr(verificationUrl, layout.qrCode);
      qrPngBuffer = qrResult.pngBuffer;
    }

    if (qrPngBuffer) {
      try {
        const qrImage = await doc.embedPng(qrPngBuffer);
        const qrSize = layout.qrCode?.size || 96;
        const qrX = (layout.qrCode.x / 100) * width - qrSize / 2;
        const qrY = height - (layout.qrCode.y / 100) * height - qrSize / 2;

        // Draw subtle background frame around QR code for contrast
        page.drawRectangle({
          x: qrX - 4,
          y: qrY - 4,
          width: qrSize + 8,
          height: qrSize + 8,
          color: rgb(1, 1, 1),
          borderColor: hexToRgb("#e2e8f0"),
          borderWidth: 1,
        });

        page.drawImage(qrImage, {
          x: qrX,
          y: qrY,
          width: qrSize,
          height: qrSize,
        });

        // Verification caption under QR code
        const caption = "Scan to verify on-chain";
        const capWidth = helvetica.widthOfTextAtSize(caption, 7);
        page.drawText(caption, {
          x: qrX + qrSize / 2 - capWidth / 2,
          y: qrY - 12,
          size: 7,
          font: helvetica,
          color: hexToRgb("#64748b"),
        });
      } catch (err) {
        console.error("[PdfGenerator] Failed to embed QR code:", err);
      }
    }

    // 7. Set PDF Document Metadata
    const certNumber = claims["{{certificate_number}}"] || claims["certificate_number"] || "CERTIFICATE";
    doc.setTitle(`Certificate of Completion — ${certNumber}`);
    doc.setAuthor(tenantName || "CREDVAIL Issuing Authority");
    doc.setSubject(`Cryptographically Verified Digital Credential — ${certNumber}`);
    doc.setCreator("CREDVAIL Digital Credential Infrastructure");
    doc.setProducer("CREDVAIL PDF Engine v1.0 (pdf-lib)");
    doc.setCreationDate(new Date());

    return doc.save();
  }

  /**
   * Draws decorative borders according to the style configuration.
   */
  private static drawBorder(
    page: any,
    width: number,
    height: number,
    border: BorderConfig
  ) {
    if (!border || border.style === "none") return;

    const primaryColor = hexToRgb(border.color || "#0f172a");
    const accentColor = hexToRgb(border.secondaryColor || "#d97706");
    const borderWidth = border.width || 3;

    if (border.style === "classic" || border.style === "ornate") {
      // Outer primary boundary
      page.drawRectangle({
        x: 28,
        y: 28,
        width: width - 56,
        height: height - 56,
        borderColor: primaryColor,
        borderWidth,
      });

      // Inner gold/accent boundary
      page.drawRectangle({
        x: 36,
        y: 36,
        width: width - 72,
        height: height - 72,
        borderColor: accentColor,
        borderWidth: 1,
      });

      // Corner accent flourishes for ornate/classic style
      const cornerSize = 14;
      const corners = [
        { x: 42, y: 42 },
        { x: width - 42 - cornerSize, y: 42 },
        { x: 42, y: height - 42 - cornerSize },
        { x: width - 42 - cornerSize, y: height - 42 - cornerSize },
      ];

      for (const c of corners) {
        page.drawRectangle({
          x: c.x,
          y: c.y,
          width: cornerSize,
          height: cornerSize,
          borderColor: accentColor,
          borderWidth: 1,
        });
      }
    } else if (border.style === "modern") {
      // Top modern accent bar
      page.drawRectangle({
        x: 0,
        y: height - 12,
        width,
        height: 12,
        color: primaryColor,
      });

      // Gold thin ribbon below top bar
      page.drawRectangle({
        x: 0,
        y: height - 16,
        width,
        height: 4,
        color: accentColor,
      });

      // Bottom border frame
      page.drawRectangle({
        x: 28,
        y: 28,
        width: width - 56,
        height: height - 56,
        borderColor: primaryColor,
        borderWidth: 1.5,
      });
    } else if (border.style === "minimal") {
      // Sleek single border with generous inset
      page.drawRectangle({
        x: 36,
        y: 36,
        width: width - 72,
        height: height - 72,
        borderColor: primaryColor,
        borderWidth: 1.5,
      });
    }
  }
}
