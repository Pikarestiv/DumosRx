import { query } from "@/lib/db/core";
import { update, insert } from "@/lib/db/local-database";
import type { UserDbRow } from "@/lib/types/user";

export async function getUserByUsernameOrEmail(identifier: string) {
  const isEmail = identifier.includes("@");
  const field = isEmail ? "email" : "username";
  const users = await query<UserDbRow>(
    `SELECT * FROM users WHERE LOWER(${field}) = LOWER(?) AND is_active = 1 AND (_deleted = 0 OR _deleted IS NULL)`,
    [identifier]
  );
  return users.length > 0 ? users[0] : null;
}

interface DefaultAdminInfo {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
  pin: string;
  role: string;
}

export async function createDefaultAdmin(adminInfo: DefaultAdminInfo) {
  // Goes through insert() (not a raw query) so this bootstrap account is
  // actually pushed to the cloud like any other user - previously it was a
  // raw INSERT OR IGNORE that never touched _sync_queue, so it stayed
  // invisible to every other device/the server, and a factory-reset device
  // would silently mint an independent, never-reconciled duplicate. The id
  // stays the fixed "default-admin" sentinel: it's relied on elsewhere
  // (staff-list.tsx disables editing/deleting this specific row) and the
  // caller (auth-context.tsx's login()) only reaches this once it has
  // already confirmed zero local users exist, so a same-id collision here
  // would only happen from a genuine double-submit race, not routine use.
  return insert(
    "users",
    {
      id: adminInfo.id,
      first_name: adminInfo.first_name,
      last_name: adminInfo.last_name,
      username: adminInfo.username,
      pin: adminInfo.pin,
      role: adminInfo.role,
      is_active: 1,
    },
    { action: "CREATE_DEFAULT_ADMIN" },
  );
}

export async function getUserPin(userId: string) {
  const users = await query<{ pin: string }>("SELECT pin FROM users WHERE id = ?", [userId]);
  return users.length > 0 ? users[0].pin : null;
}

export async function updateUserPin(userId: string, newPin: string) {
  return update("users", userId, { pin: newPin });
}

export async function getStaffCount() {
  // Excludes the store owner's own row (role = 'store_owner') so a plan's
  // advertised staff limit means "N employees you can add," not "you +
  // N-1 employees." Also still excludes the hardcoded 'default-admin'
  // bootstrap id (a local fallback account, unrelated to ownership — see
  // auth-context.tsx's login() fallback branch).
  const result = await query<{ count: number }>(
    "SELECT COUNT(*) as count FROM users WHERE _deleted = 0 AND is_active = 1 AND id != 'default-admin' AND role != 'store_owner'"
  );
  return result[0]?.count || 0;
}
