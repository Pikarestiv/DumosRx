import { describe, it, expect, vi } from 'vitest';
import { updateUser } from '../lib/db/local-database';

vi.mock('../lib/db/local-database', async () => {
  const actual = await vi.importActual<typeof import('../lib/db/local-database')>('../lib/db/local-database');
  return {
    ...actual,
    updateUser: vi.fn().mockResolvedValue(undefined),
  };
});

describe('staff deactivate/reactivate', () => {
  it('deactivating calls updateUser with is_active: 0, not deleteUser', async () => {
    await updateUser('user-1', { is_active: 0 });
    expect(vi.mocked(updateUser)).toHaveBeenCalledWith('user-1', { is_active: 0 });
  });

  it('reactivating calls updateUser with is_active: 1', async () => {
    await updateUser('user-1', { is_active: 1 });
    expect(vi.mocked(updateUser)).toHaveBeenCalledWith('user-1', { is_active: 1 });
  });
});
