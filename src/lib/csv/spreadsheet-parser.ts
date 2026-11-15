/**
 * CREDVAIL Spreadsheet Ingestion Engine
 * 
 * Supports:
 * - RFC 4180 compliant CSV / TSV parsing with auto-delimiter detection
 * - Native OpenXML (.xlsx) parsing using built-in node:zlib
 * - SEC-07 CSV Formula Injection (DDE) sanitization (neutralizing =, +, -, @, \t, \r)
 * - UTF-8 BOM stripping (\uFEFF)
 * - Multiline quoted fields and escaped quotes
 */

import zlib from 'node:zlib';

export interface SpreadsheetCellSecurityAlert {
  row: number;
  column: string;
  originalValue: string;
  sanitizedValue: string;
  risk: 'FORMULA_INJECTION_DDE';
}

export interface ParsedSpreadsheet {
  headers: string[];
  rows: Record<string, string>[];
  rawGrid: string[][];
  rowCount: number;
  detectedType: 'CSV' | 'XLSX';
  formulaInjections: SpreadsheetCellSecurityAlert[];
}

export interface ParseSpreadsheetOptions {
  sanitizeFormulas?: boolean;
  maxRows?: number;
  delimiter?: string;
}

/**
 * Checks if a string contains spreadsheet formula injection vectors.
 * SEC-07: Prefixes with =, +, -, @, \t, \r can trigger DDE / macro execution.
 */
export function hasFormulaInjection(value: string): boolean {
  if (typeof value !== 'string' || value.length === 0) return false;
  return /^[=+\-@\t\r]/.test(value);
}

/**
 * Sanitizes formula injection by prepending a single quote (').
 */
export function sanitizeFormulaValue(value: string): string {
  if (typeof value !== 'string') return '';
  if (hasFormulaInjection(value)) {
    return `'${value}`;
  }
  return value;
}

/**
 * Strips UTF-8 Byte Order Mark (BOM) if present.
 */
export function stripBOM(content: string): string {
  if (content.charCodeAt(0) === 0xFEFF) {
    return content.slice(1);
  }
  return content;
}

/**
 * Detects delimiter for CSV (comma, tab, semicolon, pipe).
 */
export function detectDelimiter(text: string): string {
  const sample = text.slice(0, 4096);
  const lines = sample.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return ',';

  const firstLine = lines[0];
  const counts: Record<string, number> = {
    ',': 0,
    ';': 0,
    '\t': 0,
    '|': 0,
  };

  let inQuotes = false;
  for (let i = 0; i < firstLine.length; i++) {
    const char = firstLine[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes && char in counts) {
      counts[char]++;
    }
  }

  let best = ',';
  let maxCount = -1;
  for (const [delim, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      best = delim;
    }
  }

  return maxCount > 0 ? best : ',';
}

/**
 * Pure RFC 4180 CSV / TSV Parser
 */
export function parseCSV(content: string, options: ParseSpreadsheetOptions = {}): ParsedSpreadsheet {
  const cleanContent = stripBOM(content);
  const delimiter = options.delimiter || detectDelimiter(cleanContent);
  const sanitize = options.sanitizeFormulas ?? true;
  const maxRows = options.maxRows ?? 50000;

  const rawGrid: string[][] = [];
  const formulaInjections: SpreadsheetCellSecurityAlert[] = [];

  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;
  const len = cleanContent.length;

  while (i < len) {
    const char = cleanContent[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < len && cleanContent[i + 1] === '"') {
          // Escaped quote "" -> "
          currentField += '"';
          i += 2;
          continue;
        } else {
          // End quote
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === delimiter) {
        currentRow.push(currentField);
        currentField = '';
        i++;
        continue;
      } else if (char === '\r') {
        if (i + 1 < len && cleanContent[i + 1] === '\n') {
          i++;
        }
        currentRow.push(currentField);
        currentField = '';
        if (currentRow.some((f) => f.trim().length > 0)) {
          rawGrid.push(currentRow);
          if (rawGrid.length >= maxRows + 1) break;
        }
        currentRow = [];
        i++;
        continue;
      } else if (char === '\n') {
        currentRow.push(currentField);
        currentField = '';
        if (currentRow.some((f) => f.trim().length > 0)) {
          rawGrid.push(currentRow);
          if (rawGrid.length >= maxRows + 1) break;
        }
        currentRow = [];
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  // Push final field if any
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some((f) => f.trim().length > 0)) {
      rawGrid.push(currentRow);
    }
  }

  if (rawGrid.length === 0) {
    return {
      headers: [],
      rows: [],
      rawGrid: [],
      rowCount: 0,
      detectedType: 'CSV',
      formulaInjections: [],
    };
  }

  // First non-empty row is header
  const rawHeaders = rawGrid[0];
  const headers = rawHeaders.map((h, idx) => {
    const trimmed = h.trim();
    return trimmed.length > 0 ? trimmed : `Column_${idx + 1}`;
  });

  const rows: Record<string, string>[] = [];

  for (let r = 1; r < rawGrid.length; r++) {
    const rawCells = rawGrid[r];
    const rowObj: Record<string, string> = {};

    for (let c = 0; c < headers.length; c++) {
      const colName = headers[c];
      const rawVal = (rawCells[c] || '').trim();

      if (hasFormulaInjection(rawVal)) {
        const sanitized = sanitizeFormulaValue(rawVal);
        formulaInjections.push({
          row: r + 1, // 1-based indexing for user visibility
          column: colName,
          originalValue: rawVal,
          sanitizedValue: sanitized,
          risk: 'FORMULA_INJECTION_DDE',
        });
        rowObj[colName] = sanitize ? sanitized : rawVal;
      } else {
        rowObj[colName] = rawVal;
      }
    }

    rows.push(rowObj);
  }

  return {
    headers,
    rows,
    rawGrid,
    rowCount: rows.length,
    detectedType: 'CSV',
    formulaInjections,
  };
}

/**
 * Minimal in-memory PKZIP extractor for XLSX OpenXML archives.
 * Uses node:zlib inflateRawSync.
 */
interface ZipEntry {
  filename: string;
  data: Buffer;
}

export function extractZipEntries(buffer: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  let offset = 0;
  const len = buffer.length;

  while (offset + 30 <= len) {
    // Check local file header signature 0x04034b50
    const sig = buffer.readUInt32LE(offset);
    if (sig !== 0x04034b50) {
      break; // Reached end of local files or central directory
    }

    const compressionMethod = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const filenameLen = buffer.readUInt16LE(offset + 26);
    const extraLen = buffer.readUInt16LE(offset + 28);

    const filenameStart = offset + 30;
    const filename = buffer.toString('utf8', filenameStart, filenameStart + filenameLen);

    const dataStart = filenameStart + filenameLen + extraLen;
    const compressedData = buffer.subarray(dataStart, dataStart + compressedSize);

    let decompressed: Buffer;
    if (compressionMethod === 0) {
      // Stored uncompressed
      decompressed = compressedData;
    } else if (compressionMethod === 8) {
      // Deflate
      decompressed = zlib.inflateRawSync(compressedData);
    } else {
      throw new Error(`Unsupported ZIP compression method: ${compressionMethod} in ${filename}`);
    }

    entries.set(filename, decompressed);
    offset = dataStart + compressedSize;
  }

  return entries;
}

/**
 * Decodes XML entities.
 */
function decodeXmlEntities(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * Converts Excel column letter (e.g. 'A', 'B', 'AA') to 0-based index.
 */
function colLetterToIndex(col: string): number {
  let index = 0;
  const clean = col.toUpperCase().replace(/[^A-Z]/g, '');
  for (let i = 0; i < clean.length; i++) {
    index = index * 26 + (clean.charCodeAt(i) - 64);
  }
  return index - 1;
}

/**
 * Native OpenXML (.xlsx) Parser
 */
export function parseXLSX(buffer: Buffer, options: ParseSpreadsheetOptions = {}): ParsedSpreadsheet {
  const sanitize = options.sanitizeFormulas ?? true;
  const maxRows = options.maxRows ?? 50000;

  const entries = extractZipEntries(buffer);

  // 1. Parse sharedStrings.xml if present
  const sharedStrings: string[] = [];
  const sstBuffer = entries.get('xl/sharedStrings.xml');
  if (sstBuffer) {
    const sstXml = sstBuffer.toString('utf8');
    // Match <si>...</si> items
    const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
    let siMatch: RegExpExecArray | null;

    while ((siMatch = siRegex.exec(sstXml)) !== null) {
      const siContent = siMatch[1];
      // Gather all <t>...</t> tags inside <si>
      const tRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
      let tMatch: RegExpExecArray | null;
      let text = '';
      while ((tMatch = tRegex.exec(siContent)) !== null) {
        text += decodeXmlEntities(tMatch[1]);
      }
      sharedStrings.push(text);
    }
  }

  // 2. Find worksheet: sheet1.xml or first available sheet
  let sheetBuffer: Buffer | undefined;
  for (const [name, buf] of entries.entries()) {
    if (name === 'xl/worksheets/sheet1.xml') {
      sheetBuffer = buf;
      break;
    }
  }
  if (!sheetBuffer) {
    for (const [name, buf] of entries.entries()) {
      if (name.startsWith('xl/worksheets/sheet') && name.endsWith('.xml')) {
        sheetBuffer = buf;
        break;
      }
    }
  }

  if (!sheetBuffer) {
    throw new Error('Invalid XLSX workbook: No worksheet found.');
  }

  const sheetXml = sheetBuffer.toString('utf8');

  // 3. Parse rows and cells
  const rawGrid: string[][] = [];
  const rowRegex = /<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(sheetXml)) !== null) {
    const rowContent = rowMatch[2];
    const cellRegex = /<c\b([^>]*)>(?:<v>([\s\S]*?)<\/v>|<is><t>([\s\S]*?)<\/t><\/is>)?<\/c>/g;
    let cellMatch: RegExpExecArray | null;

    const rowCells: string[] = [];

    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
      const attrs = cellMatch[1];
      const valRaw = cellMatch[2];
      const inlineVal = cellMatch[3];

      // Extract cell ref like r="A1"
      const rMatch = attrs.match(/\br="([A-Z]+)(\d+)"/);
      if (!rMatch) continue;

      const colLetters = rMatch[1];
      const colIdx = colLetterToIndex(colLetters);

      // Extract cell type t="s" (shared string), t="inlineStr", t="b" (boolean), etc.
      const tMatch = attrs.match(/\bt="([a-zA-Z]+)"/);
      const cellType = tMatch ? tMatch[1] : undefined;

      let cellValue = '';
      if (cellType === 's' && valRaw !== undefined) {
        const sstIdx = parseInt(valRaw, 10);
        cellValue = sharedStrings[sstIdx] ?? '';
      } else if (cellType === 'inlineStr' && inlineVal !== undefined) {
        cellValue = decodeXmlEntities(inlineVal);
      } else if (valRaw !== undefined) {
        cellValue = decodeXmlEntities(valRaw);
      }

      // Pad array if sparse
      while (rowCells.length < colIdx) {
        rowCells.push('');
      }
      rowCells[colIdx] = cellValue.trim();
    }

    if (rowCells.some((c) => c.length > 0)) {
      rawGrid.push(rowCells);
      if (rawGrid.length >= maxRows + 1) break;
    }
  }

  if (rawGrid.length === 0) {
    return {
      headers: [],
      rows: [],
      rawGrid: [],
      rowCount: 0,
      detectedType: 'XLSX',
      formulaInjections: [],
    };
  }

  // First non-empty row is headers
  const rawHeaders = rawGrid[0];
  const headers = rawHeaders.map((h, idx) => {
    const trimmed = h.trim();
    return trimmed.length > 0 ? trimmed : `Column_${idx + 1}`;
  });

  const rows: Record<string, string>[] = [];
  const formulaInjections: SpreadsheetCellSecurityAlert[] = [];

  for (let r = 1; r < rawGrid.length; r++) {
    const rawCells = rawGrid[r];
    const rowObj: Record<string, string> = {};

    for (let c = 0; c < headers.length; c++) {
      const colName = headers[c];
      const rawVal = (rawCells[c] || '').trim();

      if (hasFormulaInjection(rawVal)) {
        const sanitized = sanitizeFormulaValue(rawVal);
        formulaInjections.push({
          row: r + 1,
          column: colName,
          originalValue: rawVal,
          sanitizedValue: sanitized,
          risk: 'FORMULA_INJECTION_DDE',
        });
        rowObj[colName] = sanitize ? sanitized : rawVal;
      } else {
        rowObj[colName] = rawVal;
      }
    }

    rows.push(rowObj);
  }

  return {
    headers,
    rows,
    rawGrid,
    rowCount: rows.length,
    detectedType: 'XLSX',
    formulaInjections,
  };
}

/**
 * Universal Spreadsheet Ingestion Dispatcher
 * Automatically detects whether input is CSV/TSV or binary XLSX.
 */
export function parseSpreadsheet(
  input: Buffer | string,
  filename?: string,
  options: ParseSpreadsheetOptions = {}
): ParsedSpreadsheet {
  if (Buffer.isBuffer(input)) {
    // Check PKZIP signature 0x04034b50 (50 4B 03 04)
    if (input.length >= 4 && input[0] === 0x50 && input[1] === 0x4B && input[2] === 0x03 && input[3] === 0x04) {
      return parseXLSX(input, options);
    }
    // Otherwise decode as UTF-8 string
    const text = input.toString('utf8');
    return parseCSV(text, options);
  }

  // String input
  if (filename && filename.toLowerCase().endsWith('.xlsx')) {
    throw new Error('XLSX files must be supplied as binary Buffers.');
  }

  return parseCSV(input, options);
}
