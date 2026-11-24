import * as THREE from "three";
import { ResourceManager } from "./ResourceManager";

export class CredentialTextureGenerator {
  public static createPaperBumpTexture(
    size = 512,
    resourceManager?: ResourceManager
  ): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    if (ctx) {
      const img = ctx.createImageData(size, size);
      const data = img.data;

      // Deterministic fine archival cotton paper grain
      let seed = 4219;
      const rand = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      };

      for (let i = 0; i < data.length; i += 4) {
        const v = 122 + Math.floor((rand() - 0.5) * 26);
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 4);
    tex.needsUpdate = true;
    if (resourceManager) resourceManager.trackTexture(tex);
    return tex;
  }

  private static drawOrnamentalFrame(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    pad: number,
    strokeColor: string
  ): void {
    const x = pad;
    const y = pad;
    const fw = w - pad * 2;
    const fh = h - pad * 2;
    const arcR = w * 0.036;

    // Outer solid institutional rule with inverted corner arcs
    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = w * 0.0042;
    ctx.beginPath();
    ctx.moveTo(x + arcR, y);
    ctx.lineTo(x + fw - arcR, y);
    ctx.arc(x + fw, y, arcR, Math.PI, Math.PI * 0.5, true);
    ctx.lineTo(x + fw, y + fh - arcR);
    ctx.arc(x + fw, y + fh, arcR, Math.PI * 1.5, Math.PI, true);
    ctx.lineTo(x + arcR, y + fh);
    ctx.arc(x, y + fh, arcR, 0, Math.PI * 1.5, true);
    ctx.lineTo(x, y + arcR);
    ctx.arc(x, y, arcR, Math.PI * 0.5, 0, true);
    ctx.closePath();
    ctx.stroke();

    // Inner hairline rule
    const innerOffset = w * 0.013;
    const ix = x + innerOffset;
    const iy = y + innerOffset;
    const ifw = fw - innerOffset * 2;
    const ifh = fh - innerOffset * 2;
    const iArc = arcR * 0.78;

    ctx.strokeStyle = "rgba(27, 58, 107, 0.52)";
    ctx.lineWidth = w * 0.0017;
    ctx.beginPath();
    ctx.moveTo(ix + iArc, iy);
    ctx.lineTo(ix + ifw - iArc, iy);
    ctx.arc(ix + ifw, iy, iArc, Math.PI, Math.PI * 0.5, true);
    ctx.lineTo(ix + ifw, iy + ifh - iArc);
    ctx.arc(ix + ifw, iy + ifh, iArc, Math.PI * 1.5, Math.PI, true);
    ctx.lineTo(ix + iArc, iy + ifh);
    ctx.arc(ix, iy + ifh, iArc, 0, Math.PI * 1.5, true);
    ctx.lineTo(ix, iy + iArc);
    ctx.arc(ix, iy, iArc, Math.PI * 0.5, 0, true);
    ctx.closePath();
    ctx.stroke();

    // Subtle corner diamond pins
    const pinOffset = pad + arcR * 0.42;
    const corners = [
      [pinOffset, pinOffset],
      [w - pinOffset, pinOffset],
      [pinOffset, h - pinOffset],
      [w - pinOffset, h - pinOffset],
    ];
    ctx.fillStyle = strokeColor;
    for (const [cx, cy] of corners) {
      ctx.beginPath();
      ctx.arc(cx, cy, w * 0.003, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private static drawGuillocheWaves(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number
  ): void {
    ctx.save();
    // Clip safely inside inner document margin
    const m = w * 0.095;
    ctx.beginPath();
    ctx.rect(m, h * 0.54, w - m * 2, h * 0.38);
    ctx.clip();

    const strands = 16;
    for (let s = 0; s < strands; s++) {
      const progress = s / (strands - 1);
      ctx.beginPath();
      const baseY = h * (0.64 + progress * 0.24);
      const amp1 = h * (0.022 + Math.sin(progress * Math.PI) * 0.018);
      const amp2 = h * 0.012;
      const phase = progress * 1.9;

      for (let px = m; px <= w - m; px += 8) {
        const nx = (px - m) / (w - m * 2);
        const py =
          baseY +
          Math.sin(nx * Math.PI * 2.2 + phase) * amp1 +
          Math.cos(nx * Math.PI * 4.4 - phase * 0.7) * amp2;
        if (px === m) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle =
        s % 3 === 0 ? "rgba(79, 70, 229, 0.09)" : "rgba(27, 58, 107, 0.11)";
      ctx.lineWidth = w * 0.0011;
      ctx.stroke();
    }
    ctx.restore();
  }

  private static drawIllustrativeQR(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number
  ): void {
    const modules = 21;
    const pad = size * 0.08;
    const inner = size - pad * 2;
    const cell = inner / modules;

    // Crisp white housing
    ctx.save();
    ctx.fillStyle = "#FFFFFF";
    ctx.strokeStyle = "#CBD5E1";
    ctx.lineWidth = size * 0.015;
    ctx.fillRect(x, y, size, size);
    ctx.strokeRect(x, y, size, size);

    const drawFinder = (gx: number, gy: number) => {
      ctx.fillStyle = "#0B172A";
      ctx.fillRect(x + pad + gx * cell, y + pad + gy * cell, 7 * cell, 7 * cell);
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(x + pad + (gx + 1) * cell, y + pad + (gy + 1) * cell, 5 * cell, 5 * cell);
      ctx.fillStyle = "#0B172A";
      ctx.fillRect(x + pad + (gx + 2) * cell, y + pad + (gy + 2) * cell, 3 * cell, 3 * cell);
    };

    drawFinder(0, 0);
    drawFinder(14, 0);
    drawFinder(0, 14);

    // Deterministic data modules (illustrative visual matrix)
    ctx.fillStyle = "#0B172A";
    for (let r = 0; r < modules; r++) {
      for (let c = 0; c < modules; c++) {
        const inTopLeft = r < 8 && c < 8;
        const inTopRight = r < 8 && c > 12;
        const inBottomLeft = r > 12 && c < 8;
        if (inTopLeft || inTopRight || inBottomLeft) continue;

        if (r === 6 || c === 6) {
          if ((r + c) % 2 === 0) {
            ctx.fillRect(x + pad + c * cell, y + pad + r * cell, cell * 0.96, cell * 0.96);
          }
          continue;
        }

        const hash = Math.sin(r * 19.37 + c * 41.13 + 7.1) * 43758.5453;
        if (hash - Math.floor(hash) > 0.48) {
          ctx.fillRect(x + pad + c * cell, y + pad + r * cell, cell * 0.96, cell * 0.96);
        }
      }
    }
    ctx.restore();
  }

  public static createFrontTexture(
    isMobile: boolean,
    resourceManager?: ResourceManager
  ): THREE.CanvasTexture {
    const w = isMobile ? 1024 : 1536;
    const h = isMobile ? 1365 : 2048;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      const tex = new THREE.CanvasTexture(canvas);
      if (resourceManager) resourceManager.trackTexture(tex);
      return tex;
    }

    // 1. Warm archival porcelain paper base with restrained studio vignette
    const grad = ctx.createRadialGradient(
      w * 0.5,
      h * 0.36,
      w * 0.08,
      w * 0.5,
      h * 0.5,
      h * 0.72
    );
    grad.addColorStop(0, "#FFFFFF");
    grad.addColorStop(0.68, "#FAFBFD");
    grad.addColorStop(1, "#F1F5FA");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // 2. Subtle archival paper flecks
    ctx.fillStyle = "rgba(15, 23, 42, 0.018)";
    let s = 9187;
    for (let i = 0; i < 1800; i++) {
      s = (s * 48271) % 2147483647;
      const rx = (s / 2147483647) * w;
      s = (s * 48271) % 2147483647;
      const ry = (s / 2147483647) * h;
      ctx.fillRect(rx, ry, 1.5, 1.5);
    }

    // 3. Subtle geometric institutional watermark crest behind center
    ctx.save();
    ctx.translate(w * 0.5, h * 0.44);
    ctx.strokeStyle = "rgba(27, 58, 107, 0.045)";
    ctx.lineWidth = w * 0.0022;
    for (let r = 0; r < 3; r++) {
      ctx.beginPath();
      ctx.arc(0, 0, w * (0.14 + r * 0.045), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // 4. Sweeping guilloché wave lines across lower document
    this.drawGuillocheWaves(ctx, w, h);

    // 5. Classic double-lined navy ornamental frame with inverted corner arcs
    this.drawOrnamentalFrame(ctx, w, h, w * 0.068, "#1B3A6B");

    // 6. Micro-text security perimeter rule (top & bottom)
    ctx.save();
    ctx.fillStyle = "rgba(27, 58, 107, 0.42)";
    ctx.font = `500 ${Math.round(w * 0.0092)}px "JetBrains Mono", monospace`;
    ctx.textAlign = "center";
    const microLine =
      "CREDVAIL VERIFIABLE INFRASTRUCTURE  •  ILLUSTRATIVE DEMONSTRATION  •  TAMPER-EVIDENT RECORD";
    ctx.fillText(microLine, w * 0.5, h * 0.062);
    ctx.fillText(microLine, w * 0.5, h * 0.946);
    ctx.restore();

    // 7. Prominent, clear ILLUSTRATIVE DEMONSTRATION pill badge (Strict Content Integrity)
    const pillW = w * 0.38;
    const pillH = h * 0.024;
    const pillX = (w - pillW) * 0.5;
    const pillY = h * 0.112;
    ctx.save();
    ctx.fillStyle = "#EEF2FF";
    ctx.strokeStyle = "#C7D2FE";
    ctx.lineWidth = w * 0.0016;
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillW, pillH, pillH * 0.5);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#312E81";
    ctx.font = `600 ${Math.round(w * 0.0145)}px "JetBrains Mono", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("ILLUSTRATIVE DEMONSTRATION", w * 0.5, pillY + pillH * 0.52);
    ctx.restore();

    // 8. Institutional Shield Mark & Registry Header
    ctx.save();
    const emblemY = h * 0.185;
    const es = w * 0.032;
    ctx.strokeStyle = "#1B3A6B";
    ctx.fillStyle = "#1B3A6B";
    ctx.lineWidth = w * 0.0032;
    ctx.beginPath();
    ctx.moveTo(w * 0.5, emblemY - es);
    ctx.lineTo(w * 0.5 + es * 0.85, emblemY - es * 0.62);
    ctx.lineTo(w * 0.5 + es * 0.85, emblemY + es * 0.12);
    ctx.quadraticCurveTo(w * 0.5 + es * 0.85, emblemY + es * 0.78, w * 0.5, emblemY + es * 1.05);
    ctx.quadraticCurveTo(w * 0.5 - es * 0.85, emblemY + es * 0.78, w * 0.5 - es * 0.85, emblemY + es * 0.12);
    ctx.lineTo(w * 0.5 - es * 0.85, emblemY - es * 0.62);
    ctx.closePath();
    ctx.stroke();

    // Inner checkmark
    ctx.beginPath();
    ctx.moveTo(w * 0.5 - es * 0.34, emblemY + es * 0.04);
    ctx.lineTo(w * 0.5 - es * 0.08, emblemY + es * 0.32);
    ctx.lineTo(w * 0.5 + es * 0.4, emblemY - es * 0.24);
    ctx.strokeStyle = "#4F46E5";
    ctx.lineWidth = w * 0.0036;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.restore();

    ctx.textAlign = "center";
    ctx.fillStyle = "#1B3A6B";
    ctx.font = `700 ${Math.round(w * 0.022)}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText("CREDVAIL INSTITUTIONAL REGISTRY", w * 0.5, h * 0.248);

    ctx.fillStyle = "#64748B";
    ctx.font = `500 ${Math.round(w * 0.0145)}px "JetBrains Mono", monospace`;
    ctx.fillText("SAMPLE VERIFIABLE CREDENTIAL", w * 0.5, h * 0.273);

    // Hairline divider
    ctx.strokeStyle = "rgba(27, 58, 107, 0.28)";
    ctx.lineWidth = w * 0.0014;
    ctx.beginPath();
    ctx.moveTo(w * 0.32, h * 0.295);
    ctx.lineTo(w * 0.68, h * 0.295);
    ctx.stroke();

    // 9. Certificate Title (Editorial Serif)
    ctx.fillStyle = "#0B172A";
    ctx.font = `600 ${Math.round(w * 0.058)}px "Cormorant Garamond", Georgia, serif`;
    ctx.fillText("Certificate of", w * 0.5, h * 0.352);
    ctx.fillText("Professional Distinction", w * 0.5, h * 0.398);

    // 10. Recipient Block
    ctx.fillStyle = "#64748B";
    ctx.font = `500 ${Math.round(w * 0.017)}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText("AWARDED TO", w * 0.5, h * 0.452);

    ctx.fillStyle = "#0B172A";
    ctx.font = `600 ${Math.round(w * 0.068)}px "Cormorant Garamond", Georgia, serif`;
    ctx.fillText("Eleanor M. Vance", w * 0.5, h * 0.508);

    ctx.fillStyle = "#64748B";
    ctx.font = `400 ${Math.round(w * 0.015)}px "JetBrains Mono", monospace`;
    ctx.fillText("(Sample Recipient — Illustrative Entry)", w * 0.5, h * 0.534);

    // Thin recipient underline
    ctx.strokeStyle = "rgba(27, 58, 107, 0.22)";
    ctx.beginPath();
    ctx.moveTo(w * 0.24, h * 0.553);
    ctx.lineTo(w * 0.76, h * 0.553);
    ctx.stroke();

    // 11. Program Description
    ctx.fillStyle = "#334155";
    ctx.font = `400 ${Math.round(w * 0.0225)}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText("For demonstrating mastery in Digital Trust Architecture", w * 0.5, h * 0.594);
    ctx.fillText("& Cryptographic Governance under open institutional standards.", w * 0.5, h * 0.621);

    // 12. Lower-Left Authorization, Signature & Illustrative QR Area
    const leftX = w * 0.135;

    // Stylized calligraphic vector signature (illustrative)
    ctx.save();
    ctx.strokeStyle = "#132440";
    ctx.lineWidth = w * 0.0032;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(leftX + w * 0.01, h * 0.728);
    ctx.bezierCurveTo(leftX + w * 0.04, h * 0.688, leftX + w * 0.07, h * 0.742, leftX + w * 0.105, h * 0.708);
    ctx.bezierCurveTo(leftX + w * 0.135, h * 0.684, leftX + w * 0.155, h * 0.735, leftX + w * 0.195, h * 0.715);
    ctx.bezierCurveTo(leftX + w * 0.225, h * 0.702, leftX + w * 0.255, h * 0.724, leftX + w * 0.285, h * 0.706);
    ctx.stroke();

    // Signature underline
    ctx.strokeStyle = "#94A3B8";
    ctx.lineWidth = w * 0.0016;
    ctx.beginPath();
    ctx.moveTo(leftX, h * 0.742);
    ctx.lineTo(leftX + w * 0.30, h * 0.742);
    ctx.stroke();

    ctx.textAlign = "left";
    ctx.fillStyle = "#0B172A";
    ctx.font = `600 ${Math.round(w * 0.0165)}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText("Registrar Authorization (Illustrative)", leftX, h * 0.761);
    ctx.fillStyle = "#64748B";
    ctx.font = `400 ${Math.round(w * 0.0135)}px "JetBrains Mono", monospace`;
    ctx.fillText("OFFICE OF DIGITAL STANDARDS", leftX, h * 0.779);
    ctx.restore();

    // Illustrative QR Code + Metadata
    const qrSize = w * 0.138;
    const qrY = h * 0.802;
    this.drawIllustrativeQR(ctx, leftX, qrY, qrSize);

    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = "#475569";
    ctx.font = `600 ${Math.round(w * 0.0115)}px "JetBrains Mono", monospace`;
    ctx.fillText("SCAN DEMO", leftX + qrSize * 0.5, qrY + qrSize + h * 0.016);

    ctx.textAlign = "left";
    const metaX = leftX + qrSize + w * 0.028;
    ctx.fillStyle = "#64748B";
    ctx.font = `500 ${Math.round(w * 0.0125)}px "JetBrains Mono", monospace`;
    ctx.fillText("CREDENTIAL IDENTIFIER", metaX, qrY + h * 0.018);

    ctx.fillStyle = "#0B172A";
    ctx.font = `600 ${Math.round(w * 0.0165)}px "JetBrains Mono", monospace`;
    ctx.fillText("CV-DEMO-2026-08491", metaX, qrY + h * 0.037);

    ctx.fillStyle = "#64748B";
    ctx.font = `500 ${Math.round(w * 0.0125)}px "JetBrains Mono", monospace`;
    ctx.fillText("ISSUED: NOVEMBER 2026", metaX, qrY + h * 0.062);

    ctx.fillStyle = "#1E40AF";
    ctx.font = `600 ${Math.round(w * 0.0125)}px "JetBrains Mono", monospace`;
    ctx.fillText("SCHEMA: W3C VCDM 2.0", metaX, qrY + h * 0.084);

    ctx.fillStyle = "#94A3B8";
    ctx.font = `400 ${Math.round(w * 0.011)}px "JetBrains Mono", monospace`;
    ctx.fillText("DEMO VISUAL ONLY — NOT SCANNABLE", metaX, qrY + h * 0.104);
    ctx.restore();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    if (resourceManager) resourceManager.trackTexture(texture);
    return texture;
  }

  public static createReverseTexture(
    isMobile: boolean,
    resourceManager?: ResourceManager
  ): THREE.CanvasTexture {
    const w = isMobile ? 768 : 1024;
    const h = isMobile ? 1024 : 1365;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      const tex = new THREE.CanvasTexture(canvas);
      if (resourceManager) resourceManager.trackTexture(tex);
      return tex;
    }

    // Architectural soft porcelain-slate backing
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#F8FAFC");
    grad.addColorStop(1, "#EBF1F8");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Subtle guilloché security lattice
    ctx.save();
    ctx.strokeStyle = "rgba(27, 58, 107, 0.06)";
    ctx.lineWidth = 1;
    const step = w * 0.045;
    for (let y = step; y < h; y += step) {
      ctx.beginPath();
      for (let x = 0; x <= w; x += 12) {
        const wave = Math.sin((x / w) * Math.PI * 6 + y * 0.015) * (step * 0.25);
        if (x === 0) ctx.moveTo(x, y + wave);
        else ctx.lineTo(x, y + wave);
      }
      ctx.stroke();
    }
    ctx.restore();

    this.drawOrnamentalFrame(ctx, w, h, w * 0.072, "rgba(27, 58, 107, 0.65)");

    // Center institutional crest & reverse security notes
    ctx.textAlign = "center";
    ctx.fillStyle = "#1B3A6B";
    ctx.font = `700 ${Math.round(w * 0.03)}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText("CREDVAIL", w * 0.5, h * 0.34);

    ctx.fillStyle = "#475569";
    ctx.font = `500 ${Math.round(w * 0.016)}px "JetBrains Mono", monospace`;
    ctx.fillText("CRYPTOGRAPHIC VERIFICATION ARCHITECTURE", w * 0.5, h * 0.378);

    ctx.strokeStyle = "rgba(27, 58, 107, 0.24)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(w * 0.28, h * 0.408);
    ctx.lineTo(w * 0.72, h * 0.408);
    ctx.stroke();

    // Technical specification rows
    const specs = [
      ["DATA MODEL", "W3C Verifiable Credentials v2.0"],
      ["PROOF MECHANISM", "Tamper-Evident Asymmetric Signature"],
      ["STATUS PROTOCOL", "Bitstring Status List v1.0"],
      ["SAMPLE REFERENCE", "CV-DEMO-2026-08491"],
    ];

    ctx.textAlign = "left";
    let rowY = h * 0.47;
    for (const [label, value] of specs) {
      ctx.fillStyle = "#64748B";
      ctx.font = `500 ${Math.round(w * 0.014)}px "JetBrains Mono", monospace`;
      ctx.fillText(label, w * 0.17, rowY);

      ctx.fillStyle = "#0B172A";
      ctx.font = `600 ${Math.round(w * 0.019)}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillText(value, w * 0.17, rowY + h * 0.025);

      ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(w * 0.17, rowY + h * 0.044);
      ctx.lineTo(w * 0.83, rowY + h * 0.044);
      ctx.stroke();
      rowY += h * 0.078;
    }

    // Bottom demonstration notice
    ctx.textAlign = "center";
    ctx.fillStyle = "#312E81";
    ctx.font = `600 ${Math.round(w * 0.016)}px "JetBrains Mono", monospace`;
    ctx.fillText("ILLUSTRATIVE DEMONSTRATION", w * 0.5, h * 0.845);

    ctx.fillStyle = "#64748B";
    ctx.font = `400 ${Math.round(w * 0.014)}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText("Synthetic visual prototype for platform evaluation only.", w * 0.5, h * 0.874);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    if (resourceManager) resourceManager.trackTexture(texture);
    return texture;
  }
}
