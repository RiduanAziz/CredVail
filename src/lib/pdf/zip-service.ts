/**
 * CREDVAIL Bulk Archive Compression Service
 * 
 * Packages generated PDF certificates into compressed, standards-compliant
 * ZIP archives using fflate.
 */

import { zipSync } from "fflate";

export interface ZipFileInput {
  filename: string;
  data: Uint8Array | Buffer;
}

export class ZipService {
  /**
   * Compresses multiple PDF files into a single binary ZIP archive buffer.
   */
  static createBatchArchive(files: ZipFileInput[]): Uint8Array {
    if (!files || files.length === 0) {
      throw new Error("Cannot create empty ZIP archive: at least one file is required.");
    }

    const zipFiles: Record<string, Uint8Array> = {};

    for (const file of files) {
      // Sanitize filename to prevent directory traversal or invalid ZIP paths
      const safeFilename = file.filename
        .replace(/[/\\?%*:|"<>]/g, "_")
        .trim();

      const u8Data = file.data instanceof Uint8Array
        ? file.data
        : new Uint8Array(file.data);

      zipFiles[safeFilename] = u8Data;
    }

    // High compression level (level 6 standard deflate)
    const compressed = zipSync(zipFiles, { level: 6 });
    return compressed;
  }
}
