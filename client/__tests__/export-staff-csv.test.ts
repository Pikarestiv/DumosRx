import { describe, it, expect } from 'vitest';
import { buildStaffCsv } from '../lib/utils/export-staff-csv';

describe('buildStaffCsv', () => {
  it('builds a header row plus one row per staff member', () => {
    const csv = buildStaffCsv([
      {
        id: '1',
        first_name: 'Jane',
        last_name: 'Doe',
        username: 'jdoe',
        email: 'jane@example.com',
        role: 'sales_staff',
        store_id: 'store-1',
        is_active: 1,
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('Name,Username,Email,Role,Status,Created');
    expect(lines[1]).toBe('Jane Doe,jdoe,jane@example.com,sales_staff,Active,2026-01-01');
  });

  it('escapes commas in fields with quotes', () => {
    const csv = buildStaffCsv([
      {
        id: '1',
        first_name: 'Doe, Jr.',
        last_name: '',
        username: 'jdoe',
        role: 'sales_staff',
        is_active: 0,
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ]);

    expect(csv).toContain('"Doe, Jr."');
  });

  // Medium bug fix: embedded quotes/newlines weren't escaped at all (only a
  // comma triggered quoting), and username/email/role bypassed the quoting
  // function entirely - a name containing either corrupted every following
  // row when the CSV was opened.
  it('doubles an embedded quote and wraps the field in quotes', () => {
    const csv = buildStaffCsv([
      {
        id: '1',
        first_name: 'Jo"ker',
        last_name: '',
        username: 'jdoe',
        role: 'sales_staff',
        is_active: 1,
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ]);

    expect(csv).toContain('"Jo""ker"');
  });

  it('quotes a field containing an embedded newline, so a naive parser sees it as part of one field', () => {
    const csv = buildStaffCsv([
      {
        id: '1',
        first_name: 'Jane\nDoe',
        last_name: '',
        username: 'jdoe',
        role: 'sales_staff',
        is_active: 1,
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ]);

    // A correct CSV parser treats a newline inside a quoted field as part of
    // the field's value, not a row separator - unquoted, it would have
    // corrupted every following row.
    expect(csv).toContain('"Jane\nDoe"');
  });

  it('escapes username/email/role fields too, not just the name', () => {
    const csv = buildStaffCsv([
      {
        id: '1',
        first_name: 'Jane',
        last_name: 'Doe',
        username: 'j,doe',
        email: 'jane,doe@example.com',
        role: 'sales,staff',
        is_active: 1,
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const lines = csv.trim().split('\n');
    expect(lines[1]).toBe('Jane Doe,"j,doe","jane,doe@example.com","sales,staff",Active,2026-01-01');
  });

  it('prefixes a leading formula-trigger character to defuse spreadsheet formula injection', () => {
    const csv = buildStaffCsv([
      {
        id: '1',
        first_name: '=SUM(A1:A9)',
        last_name: '',
        username: '+cmd|calc',
        email: '',
        role: '',
        is_active: 1,
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const lines = csv.trim().split('\n');
    // A leading tab is invisible in a spreadsheet cell but stops it being
    // parsed as a formula.
    expect(lines[1]).toBe('\t=SUM(A1:A9),\t+cmd|calc,,,Active,2026-01-01');
  });
});
