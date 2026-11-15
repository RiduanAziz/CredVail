/**
 * CREDVAIL QR Code Generation Service
 * 
 * Generates high-resolution vector and raster QR codes containing
 * canonical cryptographic verification URLs for digital credentials.
 */

import QRCode from "qrcode";
import type { QrCodeConfig } from "../../types/template.ts";

export interface GeneratedQrResult {
  dataUrl: string;
  pngBuffer: Buffer;
  verificationUrl: string;
  size: number;
}

export class QrService {
  /**
   * Generates a QR code in both DataURL and PNG Buffer formats.
   */
  static async generateVerificationQr(
    verificationUrl: string,
    config?: Partial<QrCodeConfig>
  ): Promise<GeneratedQrResult> {
    const errorCorrectionLevel = config?.errorCorrectionLevel || "M";
    const margin = config?.includeMargin ? 1 : 0;
    const size = config?.size || 180;
    const darkColor = config?.color?.dark || "#0f172a";
    const lightColor = config?.color?.light || "#ffffff";

    const options: QRCode.QRCodeToDataURLOptions = {
      errorCorrectionLevel,
      margin,
      width: size,
      color: {
        dark: darkColor,
        light: lightColor,
      },
    };

    // Generate Base64 Data URL (for Web UI previews)
    const dataUrl = await QRCode.toDataURL(verificationUrl, options);

    // Generate PNG Buffer (for embedding into PDF documents)
    const pngBuffer = await QRCode.toBuffer(verificationUrl, {
      ...options,
      type: "png",
    });

    return {
      dataUrl,
      pngBuffer,
      verificationUrl,
      size,
    };
  }

  /**
   * Generates SVG string for vector rendering if needed.
   */
  static async generateSvg(
    verificationUrl: string,
    config?: Partial<QrCodeConfig>
  ): Promise<string> {
    const errorCorrectionLevel = config?.errorCorrectionLevel || "M";
    const margin = config?.includeMargin ? 1 : 0;
    const size = config?.size || 180;

    return QRCode.toString(verificationUrl, {
      type: "svg",
      errorCorrectionLevel,
      margin,
      width: size,
      color: {
        dark: config?.color?.dark || "#0f172a",
        light: config?.color?.light || "#ffffff",
      },
    });
  }
}
