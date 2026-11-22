import * as THREE from "three";
import { ResourceManager } from "./ResourceManager";

export class CredentialTextureGenerator {
  public static createCertificateTexture(resourceManager: ResourceManager): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 2048;
    canvas.height = 2760;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      const fallbackTexture = new THREE.CanvasTexture(canvas);
      return resourceManager.trackTexture(fallbackTexture);
    }

    // 1. Premium Satin Porcelain Background
    const bgGradient = ctx.createLinearGradient(0, 0, 2048, 2760);
    bgGradient.addColorStop(0, "#FFFFFF");
    bgGradient.addColorStop(0.3, "#FAFBFD");
    bgGradient.addColorStop(0.7, "#F6F8FC");
    bgGradient.addColorStop(1, "#EDF2F9");
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, 2048, 2760);

    // 2. Anti-Counterfeiting Wavy Guilloche Watermark (Mathematical curves)
    ctx.save();
    const drawWaveWatermark = (yBase: number, amp: number, freq: number, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let x = 80; x <= 1968; x += 8) {
        const y = yBase + Math.sin(x * freq) * amp + Math.cos(x * freq * 0.5) * (amp * 0.4);
        if (x === 80) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    for (let y = 380; y <= 2450; y += 42) {
      const amp = 14 + 10 * Math.sin(y * 0.008);
      const freq = 0.012 + 0.004 * Math.cos(y * 0.005);
      drawWaveWatermark(y, amp, freq, "rgba(30, 58, 138, 0.032)");
    }

    // Concentric Rosette in Background Center
    const drawRosette = (cx: number, cy: number, r: number, petals: number, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let theta = 0; theta <= Math.PI * 8; theta += 0.015) {
        const rad = r + 38 * Math.sin(petals * theta);
        const x = cx + rad * Math.cos(theta);
        const y = cy + rad * Math.sin(theta);
        if (theta === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    drawRosette(1024, 1350, 480, 14, "rgba(37, 99, 235, 0.038)");
    drawRosette(1024, 1350, 320, 10, "rgba(79, 70, 229, 0.032)");
    ctx.restore();

    // 3. Double-Line Navy Certificate Border with Ornamental Corner Insets (Ref 01)
    const drawCornerBorder = (inset: number, width: number, cornerSize: number, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      const x1 = inset;
      const y1 = inset;
      const x2 = 2048 - inset;
      const y2 = 2760 - inset;
      const c = cornerSize;

      ctx.beginPath();
      // Top line with notched corners
      ctx.moveTo(x1 + c, y1);
      ctx.lineTo(x2 - c, y1);
      ctx.lineTo(x2 - c, y1 + c);
      ctx.lineTo(x2, y1 + c);

      // Right line
      ctx.lineTo(x2, y2 - c);
      ctx.lineTo(x2 - c, y2 - c);
      ctx.lineTo(x2 - c, y2);

      // Bottom line
      ctx.lineTo(x1 + c, y2);
      ctx.lineTo(x1 + c, y2 - c);
      ctx.lineTo(x1, y2 - c);

      // Left line
      ctx.lineTo(x1, y1 + c);
      ctx.lineTo(x1 + c, y1 + c);
      ctx.closePath();
      ctx.stroke();
    };

    // Outer primary border
    drawCornerBorder(64, 4.5, 54, "#0F1D38");
    // Inner secondary accent border
    drawCornerBorder(88, 1.8, 38, "rgba(30, 58, 138, 0.65)");

    // Corner decorative rosettes
    const corners = [
      [92, 92],
      [1956, 92],
      [92, 2668],
      [1956, 2668],
    ];
    ctx.fillStyle = "#0F1D38";
    for (const [cx, cy] of corners) {
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. Strict Specification Prototype Notice (Content Integrity)
    ctx.fillStyle = "rgba(15, 29, 56, 0.45)";
    ctx.font = "bold 15px ui-monospace, Menlo, monospace";
    const disclaimer = "ILLUSTRATIVE DEMONSTRATION ARTIFACT • W3C VERIFIABLE CREDENTIALS 2.0 REFERENCE MODEL • ";
    ctx.fillText(disclaimer.repeat(3), 110, 80);
    ctx.fillText(disclaimer.repeat(3), 110, 2674);

    // 5. Institutional Header & Crest
    // Header Crest Shield
    ctx.fillStyle = "#0F1D38";
    ctx.beginPath();
    ctx.roundRect(964, 170, 120, 120, 24);
    ctx.fill();

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "900 68px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("C", 1024, 255);

    // Organization Typography
    ctx.fillStyle = "#0F1D38";
    ctx.font = "800 38px Inter, sans-serif";
    ctx.letterSpacing = "0.15em";
    ctx.fillText("CREDVAIL TRUST NETWORK", 1024, 345);

    ctx.fillStyle = "#64748B";
    ctx.font = "600 20px Inter, sans-serif";
    ctx.letterSpacing = "0.08em";
    ctx.fillText("GLOBAL DIGITAL CREDENTIAL INFRASTRUCTURE • W3C VC 2.0", 1024, 382);

    // Divider Line with diamond center
    ctx.strokeStyle = "rgba(15, 29, 56, 0.15)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(340, 420);
    ctx.lineTo(1708, 420);
    ctx.stroke();

    ctx.fillStyle = "#2563EB";
    ctx.beginPath();
    ctx.arc(1024, 420, 6, 0, Math.PI * 2);
    ctx.fill();

    // 6. Main Credential Title
    ctx.fillStyle = "#2563EB";
    ctx.font = "bold 22px ui-monospace, Menlo, monospace";
    ctx.letterSpacing = "0.25em";
    ctx.fillText("OFFICIAL ATTESTATION OF CREDENTIAL", 1024, 520);

    ctx.fillStyle = "#0F1D38";
    ctx.font = "900 64px Inter, sans-serif";
    ctx.letterSpacing = "-0.02em";
    ctx.fillText("CERTIFICATE OF ACCREDITATION", 1024, 610);

    ctx.fillStyle = "#475569";
    ctx.font = "500 24px Inter, sans-serif";
    ctx.fillText("Cryptographic Single-Owner Verification & Integrity Standard", 1024, 665);

    // 7. Recipient & Grant Block
    ctx.fillStyle = "#64748B";
    ctx.font = "italic 26px Georgia, serif";
    ctx.fillText("This institutional credential is authenticated and conferred unto", 1024, 820);

    ctx.fillStyle = "#0F1D38";
    ctx.font = "900 52px Inter, sans-serif";
    ctx.fillText("ENTERPRISE INSTITUTIONAL HOLDER", 1024, 905);

    // Underline beneath recipient
    ctx.strokeStyle = "rgba(37, 99, 235, 0.4)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(420, 935);
    ctx.lineTo(1628, 935);
    ctx.stroke();

    // Narrative body
    ctx.fillStyle = "#475569";
    ctx.font = "400 24px Inter, sans-serif";
    ctx.textAlign = "center";
    const bodyText1 = "Having established durable cryptographic key ownership and satisfied all verification criteria";
    const bodyText2 = "prescribed under the CredVail Single-Owner Transaction Protocol and W3C Status List Architecture.";
    ctx.fillText(bodyText1, 1024, 1010);
    ctx.fillText(bodyText2, 1024, 1050);

    // 8. Cryptographic Claims Table / Grid
    const gridY = 1170;
    ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
    ctx.beginPath();
    ctx.roundRect(240, gridY, 1568, 440, 20);
    ctx.fill();
    ctx.strokeStyle = "rgba(15, 29, 56, 0.12)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Claim Row items
    const claims = [
      ["CREDENTIAL URN", "urn:credvail:vc:institution:accreditation:2026:v2"],
      ["ISSUER AUTHORITY", "did:web:credvail.org (Epoch 01 Key 0x03a7...99b2)"],
      ["ALGORITHM STANDARD", "ECDSA NIST P-256 (JsonWebSignature2020) + RFC 8785 JCS"],
      ["MERKLE INCLUSION ROOT", "0x89e24b01dca488114f2e960337c78091abff67018d9f... (Sepolia)"],
      ["REVOCATION ADDRESS", "W3C StatusList2021 (Bit 0x0041, MSB-First Compressed)"],
    ];

    ctx.textAlign = "left";
    let claimRowY = gridY + 68;
    for (const [label, val] of claims) {
      ctx.fillStyle = "#64748B";
      ctx.font = "bold 18px ui-monospace, Menlo, monospace";
      ctx.fillText(label, 280, claimRowY);

      ctx.fillStyle = "#0F1D38";
      ctx.font = "600 20px ui-monospace, Menlo, monospace";
      ctx.fillText(val, 620, claimRowY);

      // Light separator
      ctx.strokeStyle = "rgba(15, 29, 56, 0.06)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(280, claimRowY + 18);
      ctx.lineTo(1768, claimRowY + 18);
      ctx.stroke();

      claimRowY += 72;
    }

    // 9. Footer Signatures & QR Representation
    // Left: QR Code Verification Badge
    const qrX = 260;
    const qrY = 1750;
    const qrSize = 220;

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(qrX, qrY, qrSize, qrSize);
    ctx.strokeStyle = "rgba(15, 29, 56, 0.18)";
    ctx.lineWidth = 2;
    ctx.strokeRect(qrX, qrY, qrSize, qrSize);

    // Draw stylized QR matrix
    ctx.fillStyle = "#0F1D38";
    const blockSize = 11;
    // Finder patterns
    const drawFinder = (fx: number, fy: number) => {
      ctx.fillRect(fx, fy, 55, 55);
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(fx + 11, fy + 11, 33, 33);
      ctx.fillStyle = "#0F1D38";
      ctx.fillRect(fx + 18, fy + 18, 19, 19);
    };
    drawFinder(qrX + 16, qrY + 16);
    drawFinder(qrX + qrSize - 71, qrY + 16);
    drawFinder(qrX + 16, qrY + qrSize - 71);

    // Pseudorandom pseudo-data matrix for realistic aesthetic
    let seed = 42;
    const rnd = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (let x = qrX + 16; x < qrX + qrSize - 16; x += blockSize) {
      for (let y = qrY + 16; y < qrY + qrSize - 16; y += blockSize) {
        if (
          (x < qrX + 80 && y < qrY + 80) ||
          (x > qrX + qrSize - 80 && y < qrY + 80) ||
          (x < qrX + 80 && y > qrY + qrSize - 80)
        ) {
          continue; // skip finders
        }
        if (rnd() > 0.48) {
          ctx.fillRect(x, y, blockSize - 2, blockSize - 2);
        }
      }
    }

    // QR Label
    ctx.fillStyle = "#64748B";
    ctx.font = "bold 15px ui-monospace, Menlo, monospace";
    ctx.textAlign = "left";
    ctx.fillText("SCAN TO VERIFY PROOF", qrX, qrY + qrSize + 28);
    ctx.font = "14px ui-monospace, Menlo, monospace";
    ctx.fillText("ON-CHAIN PARITY ASSURED", qrX, qrY + qrSize + 48);

    // Middle: Cryptographic Signature & Attestation
    const sigX = 860;
    const sigY = 1860;
    ctx.strokeStyle = "#1E3A8A";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(sigX - 160, sigY);
    // Stylized signature wave
    ctx.bezierCurveTo(sigX - 80, sigY - 45, sigX - 40, sigY + 25, sigX, sigY - 20);
    ctx.bezierCurveTo(sigX + 40, sigY - 60, sigX + 100, sigY + 30, sigX + 160, sigY);
    ctx.bezierCurveTo(sigX + 200, sigY - 20, sigX + 240, sigY - 10, sigX + 280, sigY);
    ctx.stroke();

    ctx.strokeStyle = "rgba(15, 29, 56, 0.3)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sigX - 180, sigY + 25);
    ctx.lineTo(sigX + 300, sigY + 25);
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.fillStyle = "#0F1D38";
    ctx.font = "bold 20px Inter, sans-serif";
    ctx.fillText("Cryptographic Key Custodian", sigX + 60, sigY + 55);

    ctx.fillStyle = "#64748B";
    ctx.font = "16px Inter, sans-serif";
    ctx.fillText("Executive Registrar of Cryptographic Trust", sigX + 60, sigY + 80);

    // Bottom Security Ribbon Thread
    ctx.fillStyle = "#0F1D38";
    ctx.font = "bold 15px ui-monospace, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.fillText("AUTHENTICITY SEAL • CRYPTOGRAPHIC PROOF VERIFIED VIA ECDSA P-256", 1024, 2520);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = 8;

    return resourceManager.trackTexture(texture);
  }
}
