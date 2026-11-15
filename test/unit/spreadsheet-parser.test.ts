import { describe, it, expect } from 'vitest';
import {
  parseCSV,
  hasFormulaInjection,
  sanitizeFormulaValue,
  stripBOM,
  detectDelimiter,
  parseSpreadsheet,
} from '@/lib/csv/spreadsheet-parser';

describe('Spreadsheet Ingestion Engine - CSV & Security', () => {
  it('strips UTF-8 BOM properly', () => {
    const withBom = '\uFEFFname,email\nAlice,alice@example.com';
    expect(stripBOM(withBom)).toBe('name,email\nAlice,alice@example.com');
  });

  it('detects delimiters automatically (comma, tab, semicolon)', () => {
    expect(detectDelimiter('name,email,course\nAlice,alice@ex.com,Math')).toBe(',');
    expect(detectDelimiter('name\temail\tcourse\nAlice\talice@ex.com\tMath')).toBe('\t');
    expect(detectDelimiter('name;email;course\nAlice;alice@ex.com;Math')).toBe(';');
  });

  it('parses standard RFC 4180 CSV with escaped quotes and multiline fields', () => {
    const csv = `Full Name,Email Address,Notes
"Alice, M.","alice@example.com","Line 1
Line 2"
"Bob ""The Builder""","bob@example.com","Simple note"`;

    const result = parseCSV(csv);
    expect(result.rowCount).toBe(2);
    expect(result.headers).toEqual(['Full Name', 'Email Address', 'Notes']);
    expect(result.rows[0]['Full Name']).toBe('Alice, M.');
    expect(result.rows[0]['Notes']).toBe('Line 1\nLine 2');
    expect(result.rows[1]['Full Name']).toBe('Bob "The Builder"');
    expect(result.rows[1]['Notes']).toBe('Simple note');
  });

  it('SEC-07: accurately detects CSV/Excel formula injection vectors', () => {
    expect(hasFormulaInjection('=cmd|\'/c calc\'!A1')).toBe(true);
    expect(hasFormulaInjection('+1+2')).toBe(true);
    expect(hasFormulaInjection('-2+3')).toBe(true);
    expect(hasFormulaInjection('@SUM(A1:A10)')).toBe(true);
    expect(hasFormulaInjection('\tmalicious')).toBe(true);
    expect(hasFormulaInjection('\rmalicious')).toBe(true);
    expect(hasFormulaInjection('Jane Doe')).toBe(false);
    expect(hasFormulaInjection('alice@example.com')).toBe(false);
  });

  it('SEC-07: sanitizes dangerous formula injections with leading single quote', () => {
    const raw = '=cmd|\'/c powershell -enc...\'!A0';
    const sanitized = sanitizeFormulaValue(raw);
    expect(sanitized).toBe('\'=cmd|\'/c powershell -enc...\'!A0');
  });

  it('SEC-07: records formula injection alerts during parsing and sanitizes cell data', () => {
    const maliciousCsv = `Name,Email,Grade
Alice,alice@example.com,A
=cmd|'/c calc'!A1,hacker@evil.com,+100
Bob,bob@example.com,@MAX(B1:B2)`;

    const result = parseCSV(maliciousCsv, { sanitizeFormulas: true });
    expect(result.rowCount).toBe(3);
    expect(result.formulaInjections.length).toBe(3);

    // Row 2 Name
    expect(result.formulaInjections[0]).toMatchObject({
      row: 3,
      column: 'Name',
      originalValue: "=cmd|'/c calc'!A1",
      sanitizedValue: "'=cmd|'/c calc'!A1",
      risk: 'FORMULA_INJECTION_DDE',
    });

    // Row 2 Grade
    expect(result.formulaInjections[1]).toMatchObject({
      row: 3,
      column: 'Grade',
      originalValue: '+100',
      sanitizedValue: "'+100",
    });

    // Verify cell content was sanitized
    expect(result.rows[1]['Name']).toBe("'=cmd|'/c calc'!A1");
    expect(result.rows[1]['Grade']).toBe("'+100");
    expect(result.rows[2]['Grade']).toBe("'@MAX(B1:B2)");
  });

  it('handles empty files and whitespace gracefully', () => {
    const emptyResult = parseSpreadsheet('');
    expect(emptyResult.rowCount).toBe(0);
    expect(emptyResult.headers).toEqual([]);
    expect(emptyResult.rows).toEqual([]);
  });

  it('parses buffers directly via parseSpreadsheet dispatcher', () => {
    const buffer = Buffer.from('Recipient,Course\nJohn Doe,Cybersecurity 101');
    const result = parseSpreadsheet(buffer);
    expect(result.detectedType).toBe('CSV');
    expect(result.rowCount).toBe(1);
    expect(result.rows[0]['Recipient']).toBe('John Doe');
    expect(result.rows[0]['Course']).toBe('Cybersecurity 101');
  });
});
