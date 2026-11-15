/**
 * CREDVAIL Batch Validation & Recipient Ingestion Engine
 * 
 * Provides:
 * - Spreadsheet column mapping to certificate placeholders
 * - Header auto-detection and smart fuzzy mapping
 * - Row-by-row data hygiene and schema validation
 * - In-file and cross-batch duplicate detection
 * - SEC-07 formula injection neutralization alerts
 * - Collision-safe certificate numbering preview
 * - Comprehensive diagnostic breakdown (VALID, INVALID, DUPLICATE)
 */

import { z } from 'zod';
import type { ParsedSpreadsheet } from '../csv/spreadsheet-parser.ts';
import { hasFormulaInjection, sanitizeFormulaValue } from '../csv/spreadsheet-parser.ts';

export interface ColumnMappingConfig {
  recipient_name: string;        // Column mapped to recipient name (Required)
  recipient_email: string;       // Column mapped to recipient email (Required)
  external_id?: string;          // Optional student/employee ID
  certificate_number?: string;   // Optional custom cert number
  course_name?: string;          // Optional course/event title
  issue_date?: string;           // Optional issue date
  completion_date?: string;      // Optional completion date
  grade?: string;                // Optional score/grade
  instructor_name?: string;      // Optional instructor name
  customFields?: Record<string, string>; // Maps custom placeholder name -> column name
}

export type RowValidationStatus = 'VALID' | 'INVALID' | 'DUPLICATE';

export interface RowDiagnosticError {
  column: string;
  field: string;
  message: string;
  value: string;
}

export interface ValidatedRecipientRecord {
  rowIndex: number;              // 1-based spreadsheet row number
  status: RowValidationStatus;
  recipientName: string;
  recipientEmail: string;
  externalIdentifier?: string;
  certificateNumberPreview: string;
  courseName?: string;
  issueDate: string;
  completionDate?: string;
  grade?: string;
  instructorName?: string;
  customData: Record<string, string>;
  errors: RowDiagnosticError[];
  isFormulaSanitized: boolean;
  duplicateOfRowIndex?: number;
}

export interface BatchDiagnosticReport {
  totalRows: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  securityAlertCount: number;
  rows: ValidatedRecipientRecord[];
  summary: {
    canProceed: boolean;
    validPercentage: number;
    errorDistribution: Record<string, number>;
  };
}

// Canonical matching dictionary for auto-detection
const HEADER_PATTERNS: Record<keyof ColumnMappingConfig, RegExp[]> = {
  recipient_name: [
    /^(?:full[_\s-]?)?name$/i,
    /^recipient(?:[_\s-]name)?$/i,
    /^student(?:[_\s-]name)?$/i,
    /^candidate(?:[_\s-]name)?$/i,
    /^participant(?:[_\s-]name)?$/i,
    /^attendee(?:[_\s-]name)?$/i,
  ],
  recipient_email: [
    /^e[_\s-]?mail(?:[_\s-]?address)?$/i,
    /^recipient(?:[_\s-]email)?$/i,
    /^student(?:[_\s-]email)?$/i,
  ],
  external_id: [
    /^(?:student|employee|external|reg|registration|roll|member)[_\s-]?(?:id|no|number)$/i,
    /^id$/i,
  ],
  certificate_number: [
    /^cert(?:ificate)?[_\s-]?(?:no|number|id)$/i,
  ],
  course_name: [
    /^(?:course|program|training|event|workshop|subject)(?:[_\s-]?name|[_\s-]?title)?$/i,
    /^title$/i,
  ],
  issue_date: [
    /^(?:issue|issued)[_\s-]?date$/i,
    /^date$/i,
  ],
  completion_date: [
    /^(?:completion|grad|graduation|end)[_\s-]?date$/i,
  ],
  grade: [
    /^(?:final[_\s-]?)?(?:grade|score|mark|marks|result|gpa|standing)$/i,
    /(?:grade|score|gpa)/i,
  ],
  instructor_name: [
    /^(?:instructor|trainer|teacher|professor|speaker|mentor)(?:[_\s-]?name)?$/i,
  ],
  customFields: [],
};

/**
 * Suggests intelligent column mappings based on detected headers.
 */
export function suggestColumnMappings(headers: string[]): ColumnMappingConfig {
  const mapping: ColumnMappingConfig = {
    recipient_name: '',
    recipient_email: '',
  };

  const usedHeaders = new Set<string>();

  for (const [field, patterns] of Object.entries(HEADER_PATTERNS) as [keyof ColumnMappingConfig, RegExp[]][]) {
    if (field === 'customFields') continue;

    for (const header of headers) {
      if (usedHeaders.has(header)) continue;
      const cleanHeader = header.trim();

      const isMatch = patterns.some((pat) => pat.test(cleanHeader));
      if (isMatch) {
        if (field === 'recipient_name') mapping.recipient_name = header;
        else if (field === 'recipient_email') mapping.recipient_email = header;
        else (mapping as unknown as Record<string, string>)[field] = header;
        usedHeaders.add(header);
        break;
      }
    }
  }

  // Fallbacks if not auto-matched
  if (!mapping.recipient_name) {
    const nameFallback = headers.find((h) => /name/i.test(h) && !usedHeaders.has(h));
    if (nameFallback) {
      mapping.recipient_name = nameFallback;
      usedHeaders.add(nameFallback);
    }
  }

  if (!mapping.recipient_email) {
    const emailFallback = headers.find((h) => /mail/i.test(h) && !usedHeaders.has(h));
    if (emailFallback) {
      mapping.recipient_email = emailFallback;
      usedHeaders.add(emailFallback);
    }
  }

  return mapping;
}

/**
 * Validates email format per RFC 5322 approximation.
 */
export function isValidEmail(email: string): boolean {
  if (!email || email.length > 254) return false;
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return emailRegex.test(email);
}

/**
 * Normalizes date string to YYYY-MM-DD.
 */
export function normalizeDate(dateStr?: string): string {
  if (!dateStr || dateStr.trim().length === 0) {
    return new Date().toISOString().split('T')[0];
  }

  const clean = dateStr.trim();

  // If already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }

  // Parse common patterns like DD/MM/YYYY or MM/DD/YYYY
  const parts = clean.split(/[./-]/);
  if (parts.length === 3) {
    const p0 = parseInt(parts[0], 10);
    const p1 = parseInt(parts[1], 10);
    const p2 = parseInt(parts[2], 10);

    // If p2 is a 4-digit year (e.g. DD/MM/YYYY)
    if (p2 >= 1900 && p2 <= 2100) {
      // Assume DD/MM/YYYY if p0 > 12
      if (p0 > 12 && p1 <= 12) {
        return `${p2}-${String(p1).padStart(2, '0')}-${String(p0).padStart(2, '0')}`;
      }
      // Otherwise assume standard ISO or international
      return `${p2}-${String(p1).padStart(2, '0')}-${String(p0).padStart(2, '0')}`;
    }
  }

  const parsed = new Date(clean);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return clean;
}

/**
 * Collision-safe certificate number generator.
 * Format: PREFIX-YEAR-SEQUENCE
 */
export function generateCertificateNumber(
  prefix: string,
  year: number,
  sequence: number
): string {
  const cleanPrefix = (prefix || 'CREDVAIL')
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/^-+|-+$/g, '');
  const seqStr = String(sequence).padStart(6, '0');
  return `${cleanPrefix}-${year}-${seqStr}`;
}

export interface ValidationOptions {
  tenantPrefix?: string;
  year?: number;
  startSequence?: number;
  existingEmailsInBatch?: Set<string>;
  existingCertNumbers?: Set<string>;
}

/**
 * Validates a parsed spreadsheet against column mappings.
 */
export function validateSpreadsheetBatch(
  parsed: ParsedSpreadsheet,
  mapping: ColumnMappingConfig,
  options: ValidationOptions = {}
): BatchDiagnosticReport {
  const rows = parsed.rows;
  const totalRows = rows.length;
  const validatedRecords: ValidatedRecipientRecord[] = [];

  const year = options.year || new Date().getFullYear();
  const tenantPrefix = options.tenantPrefix || 'CREDVAIL';
  let sequence = options.startSequence || 1;

  const seenEmails = new Map<string, number>(); // email -> first row index
  const errorDistribution: Record<string, number> = {};
  let validCount = 0;
  let invalidCount = 0;
  let duplicateCount = 0;
  let securityAlertCount = 0;

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const rowIndex = idx + 2; // 1-based, accounting for header row
    const errors: RowDiagnosticError[] = [];
    let isFormulaSanitized = false;

    // 1. Recipient Name Validation
    const nameCol = mapping.recipient_name;
    const rawName = (nameCol ? row[nameCol] : '').trim();
    if (hasFormulaInjection(rawName) || /^'([=+\-@\t\r])/.test(rawName)) {
      isFormulaSanitized = true;
      securityAlertCount++;
    }
    const cleanName = sanitizeFormulaValue(rawName);

    if (!cleanName) {
      errors.push({
        column: nameCol || 'recipient_name',
        field: 'recipient_name',
        message: 'Recipient name is required but missing.',
        value: rawName,
      });
    } else if (cleanName.length < 2) {
      errors.push({
        column: nameCol || 'recipient_name',
        field: 'recipient_name',
        message: 'Recipient name must be at least 2 characters long.',
        value: rawName,
      });
    }

    // 2. Recipient Email Validation
    const emailCol = mapping.recipient_email;
    const rawEmail = (emailCol ? row[emailCol] : '').trim();
    if (hasFormulaInjection(rawEmail)) {
      isFormulaSanitized = true;
      securityAlertCount++;
    }
    const cleanEmail = sanitizeFormulaValue(rawEmail).toLowerCase();

    if (!cleanEmail) {
      errors.push({
        column: emailCol || 'recipient_email',
        field: 'recipient_email',
        message: 'Recipient email is required but missing.',
        value: rawEmail,
      });
    } else if (!isValidEmail(cleanEmail)) {
      errors.push({
        column: emailCol || 'recipient_email',
        field: 'recipient_email',
        message: `Invalid email address format: "${rawEmail}".`,
        value: rawEmail,
      });
    }

    // 3. Optional Fields Extraction
    const extIdCol = mapping.external_id;
    const rawExtId = (extIdCol ? row[extIdCol] : '').trim();
    const cleanExtId = sanitizeFormulaValue(rawExtId);

    const courseCol = mapping.course_name;
    const rawCourse = (courseCol ? row[courseCol] : '').trim();
    const cleanCourse = sanitizeFormulaValue(rawCourse);

    const issueDateCol = mapping.issue_date;
    const rawIssueDate = (issueDateCol ? row[issueDateCol] : '').trim();
    const normalizedIssueDate = normalizeDate(rawIssueDate);

    const completionDateCol = mapping.completion_date;
    const rawCompletionDate = (completionDateCol ? row[completionDateCol] : '').trim();
    const normalizedCompletionDate = rawCompletionDate ? normalizeDate(rawCompletionDate) : undefined;

    const gradeCol = mapping.grade;
    const rawGrade = (gradeCol ? row[gradeCol] : '').trim();
    if (hasFormulaInjection(rawGrade) || /^'([=+\-@\t\r])/.test(rawGrade)) {
      isFormulaSanitized = true;
      securityAlertCount++;
    }
    const cleanGrade = sanitizeFormulaValue(rawGrade);

    const instructorCol = mapping.instructor_name;
    const rawInstructor = (instructorCol ? row[instructorCol] : '').trim();
    const cleanInstructor = sanitizeFormulaValue(rawInstructor);

    // Custom fields extraction
    const customData: Record<string, string> = {};
    if (mapping.customFields) {
      for (const [placeholder, colName] of Object.entries(mapping.customFields)) {
        if (colName && row[colName] !== undefined) {
          customData[placeholder] = sanitizeFormulaValue(row[colName].trim());
        }
      }
    }

    // 4. Duplicate Detection (In-file duplicate check)
    let isDuplicate = false;
    let duplicateOfRowIndex: number | undefined;

    if (cleanEmail && isValidEmail(cleanEmail)) {
      if (seenEmails.has(cleanEmail)) {
        isDuplicate = true;
        duplicateOfRowIndex = seenEmails.get(cleanEmail);
        errors.push({
          column: emailCol || 'recipient_email',
          field: 'recipient_email',
          message: `Duplicate recipient email in file. First seen on row ${duplicateOfRowIndex}.`,
          value: rawEmail,
        });
      } else if (options.existingEmailsInBatch && options.existingEmailsInBatch.has(cleanEmail)) {
        isDuplicate = true;
        errors.push({
          column: emailCol || 'recipient_email',
          field: 'recipient_email',
          message: `Recipient email already exists in this tenant or active batch.`,
          value: rawEmail,
        });
      } else {
        seenEmails.set(cleanEmail, rowIndex);
      }
    }

    // 5. Certificate Number Preview
    const certNumCol = mapping.certificate_number;
    let certNumPreview = (certNumCol ? row[certNumCol] : '').trim();
    if (!certNumPreview) {
      certNumPreview = generateCertificateNumber(tenantPrefix, year, sequence);
      sequence++;
    } else {
      certNumPreview = sanitizeFormulaValue(certNumPreview);
      if (options.existingCertNumbers && options.existingCertNumbers.has(certNumPreview)) {
        errors.push({
          column: certNumCol || 'certificate_number',
          field: 'certificate_number',
          message: `Certificate number "${certNumPreview}" is already issued.`,
          value: certNumPreview,
        });
        isDuplicate = true;
      }
    }

    // 6. Categorize Row Status
    let status: RowValidationStatus = 'VALID';
    if (errors.length > 0) {
      if (isDuplicate) {
        status = 'DUPLICATE';
        duplicateCount++;
      } else {
        status = 'INVALID';
        invalidCount++;
      }

      for (const err of errors) {
        errorDistribution[err.message] = (errorDistribution[err.message] || 0) + 1;
      }
    } else {
      validCount++;
    }

    validatedRecords.push({
      rowIndex,
      status,
      recipientName: cleanName,
      recipientEmail: cleanEmail,
      externalIdentifier: cleanExtId || undefined,
      certificateNumberPreview: certNumPreview,
      courseName: cleanCourse || undefined,
      issueDate: normalizedIssueDate,
      completionDate: normalizedCompletionDate,
      grade: cleanGrade || undefined,
      instructorName: cleanInstructor || undefined,
      customData,
      errors,
      isFormulaSanitized,
      duplicateOfRowIndex,
    });
  }

  const validPercentage = totalRows > 0 ? Math.round((validCount / totalRows) * 100) : 0;

  return {
    totalRows,
    validCount,
    invalidCount,
    duplicateCount,
    securityAlertCount,
    rows: validatedRecords,
    summary: {
      canProceed: validCount > 0,
      validPercentage,
      errorDistribution,
    },
  };
}
