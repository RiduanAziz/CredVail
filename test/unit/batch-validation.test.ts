import { describe, it, expect } from 'vitest';
import {
  suggestColumnMappings,
  isValidEmail,
  normalizeDate,
  generateCertificateNumber,
  validateSpreadsheetBatch,
  ColumnMappingConfig,
} from '@/lib/services/batch-validation-service';
import { ParsedSpreadsheet } from '@/lib/csv/spreadsheet-parser';

describe('Batch Validation & Recipient Ingestion Service', () => {
  describe('Column Mapping Auto-Detection', () => {
    it('intelligently maps common spreadsheet headers to template placeholders', () => {
      const headers = [
        'Student Name',
        'Email Address',
        'Course Title',
        'Issue Date',
        'Final Grade',
        'Instructor',
        'Student ID',
      ];

      const mapping = suggestColumnMappings(headers);

      expect(mapping.recipient_name).toBe('Student Name');
      expect(mapping.recipient_email).toBe('Email Address');
      expect(mapping.course_name).toBe('Course Title');
      expect(mapping.issue_date).toBe('Issue Date');
      expect(mapping.grade).toBe('Final Grade');
      expect(mapping.instructor_name).toBe('Instructor');
      expect(mapping.external_id).toBe('Student ID');
    });

    it('falls back to partial pattern matches if exact terms are absent', () => {
      const headers = ['Candidate', 'Mail', 'Department'];
      const mapping = suggestColumnMappings(headers);
      expect(mapping.recipient_name).toBe('Candidate');
      expect(mapping.recipient_email).toBe('Mail');
    });
  });

  describe('Data Hygiene & Formatting Helpers', () => {
    it('validates RFC 5322 email syntax rigorously', () => {
      expect(isValidEmail('alice@example.com')).toBe(true);
      expect(isValidEmail('dr.turing+sec@sub.univ.edu')).toBe(true);
      expect(isValidEmail('invalid-email')).toBe(false);
      expect(isValidEmail('user@')).toBe(false);
      expect(isValidEmail('@domain.com')).toBe(false);
      expect(isValidEmail('')).toBe(false);
    });

    it('normalizes various date formats to ISO YYYY-MM-DD', () => {
      expect(normalizeDate('2026-11-15')).toBe('2026-11-15');
      expect(normalizeDate('15/11/2026')).toBe('2026-11-15');
      // Default fallback when empty
      const today = new Date().toISOString().split('T')[0];
      expect(normalizeDate('')).toBe(today);
    });

    it('generates collision-safe, tenant-aware certificate numbers', () => {
      const cert1 = generateCertificateNumber('APEX', 2026, 1);
      const cert42 = generateCertificateNumber('MIT', 2026, 42);

      expect(cert1).toBe('APEX-2026-000001');
      expect(cert42).toBe('MIT-2026-000042');
    });
  });

  describe('Batch Validation & Diagnostic Categorization', () => {
    const mockParsed: ParsedSpreadsheet = {
      headers: ['Full Name', 'Email', 'Course', 'Grade'],
      rawGrid: [],
      rowCount: 5,
      detectedType: 'CSV',
      formulaInjections: [],
      rows: [
        {
          'Full Name': 'Alice Turing',
          Email: 'alice@example.com',
          Course: 'Computer Architecture',
          Grade: 'A+',
        },
        {
          'Full Name': '', // Missing required name
          Email: 'bob@example.com',
          Course: 'Cryptography',
          Grade: 'B',
        },
        {
          'Full Name': 'Charlie Chaplin',
          Email: 'not-an-email', // Malformed email
          Course: 'Cinema Studies',
          Grade: 'Pass',
        },
        {
          'Full Name': 'Alice Duplicate',
          Email: 'alice@example.com', // Duplicate of row 1
          Course: 'Algorithms',
          Grade: 'A',
        },
        {
          'Full Name': "=cmd|'/c calc'!A1", // SEC-07 Formula Injection
          Email: 'dan@example.com',
          Course: 'Penetration Testing',
          Grade: '+100', // Formula Injection
        },
      ],
    };

    const mapping: ColumnMappingConfig = {
      recipient_name: 'Full Name',
      recipient_email: 'Email',
      course_name: 'Course',
      grade: 'Grade',
    };

    it('processes batch and separates records into VALID, INVALID, and DUPLICATE', () => {
      const report = validateSpreadsheetBatch(mockParsed, mapping, {
        tenantPrefix: 'APEX',
        year: 2026,
        startSequence: 100,
      });

      expect(report.totalRows).toBe(5);
      expect(report.validCount).toBe(2); // Alice Turing and Dan (sanitized)
      expect(report.invalidCount).toBe(2); // Missing name and invalid email
      expect(report.duplicateCount).toBe(1); // Alice duplicate
      expect(report.summary.canProceed).toBe(true);

      // Verify Row 1: Valid
      const row1 = report.rows[0];
      expect(row1.status).toBe('VALID');
      expect(row1.recipientName).toBe('Alice Turing');
      expect(row1.certificateNumberPreview).toBe('APEX-2026-000100');
      expect(row1.errors.length).toBe(0);

      // Verify Row 2: Invalid (missing name)
      const row2 = report.rows[1];
      expect(row2.status).toBe('INVALID');
      expect(row2.errors.some((e) => e.field === 'recipient_name')).toBe(true);

      // Verify Row 3: Invalid (bad email)
      const row3 = report.rows[2];
      expect(row3.status).toBe('INVALID');
      expect(row3.errors.some((e) => e.field === 'recipient_email')).toBe(true);

      // Verify Row 4: Duplicate of row 2
      const row4 = report.rows[3];
      expect(row4.status).toBe('DUPLICATE');
      expect(row4.duplicateOfRowIndex).toBe(2);

      // Verify Row 5: SEC-07 Formula Injection Sanitized
      const row5 = report.rows[4];
      expect(row5.status).toBe('VALID');
      expect(row5.isFormulaSanitized).toBe(true);
      expect(row5.recipientName).toBe("'=cmd|'/c calc'!A1");
      expect(row5.grade).toBe("'+100");
      expect(report.securityAlertCount).toBeGreaterThanOrEqual(1);
    });

    it('detects existing duplicates across previously staged tenant credentials', () => {
      const existingEmails = new Set(['alice@example.com']);
      const report = validateSpreadsheetBatch(mockParsed, mapping, {
        existingEmailsInBatch: existingEmails,
      });

      // Now both row 1 and row 4 should be marked duplicate
      expect(report.rows[0].status).toBe('DUPLICATE');
      expect(report.rows[0].errors[0].message).toContain('already exists in this tenant');
    });
  });
});
