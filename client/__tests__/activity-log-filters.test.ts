import { describe, it, expect, vi, beforeEach } from 'vitest';
import { query } from '@/lib/db/local-database';

vi.mock('@/lib/db/local-database', () => ({
  query: vi.fn(),
}));

import { getActivityLog } from '../lib/db/queries/activity-log';

describe('getActivityLog tableName filter', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset();
  });

  it('adds an al.table_name condition when tableName is passed', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([]);

    await getActivityLog({ tableName: 'users' });

    const countCall = vi.mocked(query).mock.calls[0];
    expect(countCall[0]).toContain('al.table_name = ?');
    expect(countCall[1]).toContain('users');
  });

  it('omits the table_name condition when tableName is not passed', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([]);

    await getActivityLog({});

    const countCall = vi.mocked(query).mock.calls[0];
    expect(countCall[0]).not.toContain('table_name');
  });
});
