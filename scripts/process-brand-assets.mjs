/**
 * CREDVAIL Brand Asset Processor
 * 
 * Ingests raw brand identity JPG assets from assets/
 * Detects exact bounding boxes, crops letterboxing,
 * applies anti-aliased transparency blending for light/dark variants,
 * and generates web-optimized production assets (PNGs, favicons, app icons).
 */

import sharp from "sharp";
import fs from "fs";
import path from "path";

const ASSETS_DIR = "assets";
const PUBLIC_BRAND_DIR = "public/brand";
const PUBLIC_DIR = "public";
const APP_DIR = "src/app";

// Helper: Ensure directories exist
function ensureDirs() {
  [PUBLIC_BRAND_DIR, PUBLIC_DIR, APP_DIR].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

// Helper: Make white or light background transparent with smooth edge antialiasing
async function makeLightBgTransparent(imageBuffer, threshold = 248, softness = 16) {
  const img = sharp(imageBuffer).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const minVal = Math.min(r, g, b);

    if (minVal >= threshold) {
      data[i + 3] = 0;
    } else if (minVal > threshold - softness) {
      const factor = (threshold - minVal) / softness;
      data[i + 3] = Math.round(255 * factor);
    }
  }

  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

// Helper: Make dark background transparent with smooth edge antialiasing
async function makeDarkBgTransparent(imageBuffer, bgR = 18, bgG = 33, bgB = 64, threshold = 25, softness = 20) {
  const img = sharp(imageBuffer).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const dist = Math.sqrt((r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2);

    if (dist <= threshold) {
      data[i + 3] = 0;
    } else if (dist < threshold + softness) {
      const factor = (dist - threshold) / softness;
      data[i + 3] = Math.round(255 * factor);
    }
  }

  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

// Helper: Build standard Windows ICO container with embedded PNG
function createIcoFromPng(pngBuffer, width = 32, height = 32) {
  const icoHeader = Buffer.alloc(6);
  icoHeader.writeUInt16LE(0, 0); // Reserved (0)
  icoHeader.writeUInt16LE(1, 2); // Type 1 = ICO
  icoHeader.writeUInt16LE(1, 4); // 1 Image

  const icoEntry = Buffer.alloc(16);
  icoEntry.writeUInt8(width === 256 ? 0 : width, 0);   // Width
  icoEntry.writeUInt8(height === 256 ? 0 : height, 1); // Height
  icoEntry.writeUInt8(0, 2);                           // Color palette (0 = no palette)
  icoEntry.writeUInt8(0, 3);                           // Reserved
  icoEntry.writeUInt16LE(1, 4);                        // Color planes (1)
  icoEntry.writeUInt16LE(32, 6);                       // Bits per pixel (32 bpp RGBA)
  icoEntry.writeUInt32LE(pngBuffer.length, 8);         // Image size in bytes
  icoEntry.writeUInt32LE(22, 12);                      // Offset of image data (6 + 16 = 22)

  return Buffer.concat([icoHeader, icoEntry, pngBuffer]);
}

async function main() {
  console.log("==> Processing CREDVAIL brand assets...");
  ensureDirs();

  // 1. Standalone Brand Symbol (bbox: 896, 276, 960, 980)
  console.log("Processing Standalone Brand Symbol...");
  const rawSymbolCrop = await sharp(path.join(ASSETS_DIR, "Standalone Brand Symbol.jpg"))
    .extract({ left: 896, top: 276, width: 960, height: 980 })
    .toBuffer();
  const symbolTransparent = await makeLightBgTransparent(rawSymbolCrop, 250, 15);
  fs.writeFileSync(path.join(PUBLIC_BRAND_DIR, "brand-symbol.png"), symbolTransparent);
  fs.writeFileSync(path.join(PUBLIC_DIR, "brand-symbol.png"), symbolTransparent);

  // Scaled brand symbols
  const symbol512 = await sharp(symbolTransparent).resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  fs.writeFileSync(path.join(PUBLIC_BRAND_DIR, "brand-symbol-512.png"), symbol512);

  const symbol128 = await sharp(symbolTransparent).resize(128, 128, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  fs.writeFileSync(path.join(PUBLIC_BRAND_DIR, "brand-symbol-128.png"), symbol128);

  const symbol64 = await sharp(symbolTransparent).resize(64, 64, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  fs.writeFileSync(path.join(PUBLIC_BRAND_DIR, "brand-symbol-64.png"), symbol64);

  const symbol32 = await sharp(symbolTransparent).resize(32, 32, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  fs.writeFileSync(path.join(PUBLIC_BRAND_DIR, "brand-symbol-32.png"), symbol32);

  // 2. Compact App Icon (bbox: 908, 320, 936, 936)
  console.log("Processing Compact App Icon...");
  const rawAppIcon = await sharp(path.join(ASSETS_DIR, "Compact App Icon.jpg"))
    .extract({ left: 908, top: 320, width: 936, height: 936 })
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(PUBLIC_BRAND_DIR, "app-icon.png"), rawAppIcon);

  const appIcon512 = await sharp(rawAppIcon).resize(512, 512).png().toBuffer();
  fs.writeFileSync(path.join(PUBLIC_BRAND_DIR, "app-icon-512.png"), appIcon512);
  fs.writeFileSync(path.join(PUBLIC_DIR, "icon.png"), appIcon512);
  fs.writeFileSync(path.join(APP_DIR, "icon.png"), appIcon512);

  const appIcon180 = await sharp(rawAppIcon).resize(180, 180).png().toBuffer();
  fs.writeFileSync(path.join(PUBLIC_BRAND_DIR, "apple-touch-icon.png"), appIcon180);
  fs.writeFileSync(path.join(PUBLIC_DIR, "apple-touch-icon.png"), appIcon180);
  fs.writeFileSync(path.join(APP_DIR, "apple-icon.png"), appIcon180);

  // Favicons
  const favicon32Png = await sharp(rawAppIcon).resize(32, 32).png().toBuffer();
  fs.writeFileSync(path.join(PUBLIC_BRAND_DIR, "favicon.png"), favicon32Png);
  fs.writeFileSync(path.join(PUBLIC_DIR, "favicon.png"), favicon32Png);

  const icoBuffer = createIcoFromPng(favicon32Png, 32, 32);
  fs.writeFileSync(path.join(PUBLIC_BRAND_DIR, "favicon.ico"), icoBuffer);
  fs.writeFileSync(path.join(PUBLIC_DIR, "favicon.ico"), icoBuffer);
  fs.writeFileSync(path.join(APP_DIR, "favicon.ico"), icoBuffer);

  // 3. Horizontal Logo (bbox: 308, 488, 2104, 556)
  console.log("Processing Horizontal Logo...");
  const rawHorizontal = await sharp(path.join(ASSETS_DIR, "Horizontal Logo.jpg"))
    .extract({ left: 308, top: 488, width: 2104, height: 556 })
    .toBuffer();
  const horizontalTransparent = await makeLightBgTransparent(rawHorizontal, 250, 15);
  fs.writeFileSync(path.join(PUBLIC_BRAND_DIR, "logo-horizontal.png"), horizontalTransparent);
  fs.writeFileSync(path.join(PUBLIC_DIR, "logo.png"), horizontalTransparent);

  const horizontalSm = await sharp(horizontalTransparent).resize({ width: 600 }).png().toBuffer();
  fs.writeFileSync(path.join(PUBLIC_BRAND_DIR, "logo-horizontal-sm.png"), horizontalSm);

  // 4. Primary Stacked Logo (bbox: 664, 308, 1424, 920)
  console.log("Processing Primary Logo...");
  const rawPrimary = await sharp(path.join(ASSETS_DIR, "Primary Logo.jpg"))
    .extract({ left: 664, top: 308, width: 1424, height: 920 })
    .toBuffer();
  const primaryTransparent = await makeLightBgTransparent(rawPrimary, 250, 15);
  fs.writeFileSync(path.join(PUBLIC_BRAND_DIR, "logo-primary.png"), primaryTransparent);

  const primarySm = await sharp(primaryTransparent).resize({ width: 500 }).png().toBuffer();
  fs.writeFileSync(path.join(PUBLIC_BRAND_DIR, "logo-primary-sm.png"), primarySm);

  // 5. Dark Background Application (bbox: 876, 432, 1000, 652)
  console.log("Processing Dark Background Application...");
  const rawDark = await sharp(path.join(ASSETS_DIR, "Dark Background Application.jpg"))
    .extract({ left: 876, top: 432, width: 1000, height: 652 })
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(PUBLIC_BRAND_DIR, "logo-dark.png"), rawDark);
  fs.writeFileSync(path.join(PUBLIC_DIR, "logo-dark.png"), rawDark);

  // 6. Monochrome White Version (bbox: 664, 308, 1424, 920)
  console.log("Processing Monochrome White Version...");
  const rawMonoWhite = await sharp(path.join(ASSETS_DIR, "Monochrome White Version.jpg"))
    .extract({ left: 664, top: 308, width: 1424, height: 920 })
    .toBuffer();
  const monoWhiteTransparent = await makeDarkBgTransparent(rawMonoWhite, 18, 33, 64, 25, 20);
  fs.writeFileSync(path.join(PUBLIC_BRAND_DIR, "logo-white.png"), monoWhiteTransparent);

  // 7. Monochrome Black Version (bbox: 664, 312, 1424, 916)
  console.log("Processing Monochrome Black Version...");
  const rawMonoBlack = await sharp(path.join(ASSETS_DIR, "Monochrome Black Version.jpg"))
    .extract({ left: 664, top: 312, width: 1424, height: 916 })
    .toBuffer();
  const monoBlackTransparent = await makeLightBgTransparent(rawMonoBlack, 250, 15);
  fs.writeFileSync(path.join(PUBLIC_BRAND_DIR, "logo-black.png"), monoBlackTransparent);

  console.log("==> All CREDVAIL brand assets generated successfully!");
}

main().catch((err) => {
  console.error("Asset processing failed:", err);
  process.exit(1);
});
