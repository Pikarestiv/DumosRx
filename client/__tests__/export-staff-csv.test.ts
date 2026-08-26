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
});
