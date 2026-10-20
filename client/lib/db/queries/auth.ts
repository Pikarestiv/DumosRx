import { query } from "@/lib/db/core";
import { update, insert } from "@/lib/db/local-database";
import type { UserDbRow } from "@/lib/types/user";
import { hashPin } from "@/lib/utils/pin-hash";

// Deliberately NOT scoped to the currently-active store.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-auth-L6
export async function getUsersByUsernameOrEmail(identifier: string) {
  const isEmail = identifier.includes("@");
  const field = isEmail ? "email" : "username";
  return query<UserDbRow>(
    `SELECT * FROM users WHERE LOWER(${field}) = LOWER(?) AND is_active = 1 AND (_deleted = 0 OR _deleted IS NULL)`,
    [identifier]
  );
}

// Single-row convenience wrapper around getUsersByUsernameOrEmail.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-auth-ts-L17
export async function getUserByUsernameOrEmail(identifier: string) {
  const users = await getUsersByUsernameOrEmail(identifier);
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
  // Goes through insert() (not a raw query) so this bootstrap account is actually pushed to the cloud like any other user - previously it was a…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-auth-ts-L34
  return insert(
    "users",
    {
      id: adminInfo.id,
      first_name: adminInfo.first_name,
      last_name: adminInfo.last_name,
      username: adminInfo.username,
      // Hashed like every other stored PIN, even though the bootstrap value itself is a documented constant (DEFAULT_ADMIN_PIN) - once this row exis…
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-auth-ts-L51
      pin: hashPin(adminInfo.pin),
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

// Stores a PIN hashed, never raw - see lib/utils/pin-hash.ts.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-auth-ts-L74
export async function updateUserPin(userId: string, newPin: string) {
  return update("users", userId, { pin: hashPin(newPin) });
}

// The lazy half of the plaintext-PIN migration:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-auth-L99
export async function migrateLegacyPinToHash(userId: string, verifiedPin: string) {
  try {
    await updateUserPin(userId, verifiedPin);
    return true;
  } catch (e) {
    console.error("Failed to upgrade stored PIN to a hash", e);
    return false;
  }
}

// Null means "no row" or "column not yet backfilled on this device" - callers should treat that the same as "use the local default", not as an…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-auth-ts-L93
export async function getUserAutoLockDuration(userId: string) {
  const rows = await query<{ auto_lock_duration: number | null }>(
    "SELECT auto_lock_duration FROM users WHERE id = ?",
    [userId],
  );
  return rows.length > 0 ? rows[0].auto_lock_duration : null;
}

/** Goes through update() so the account's auto-lock preference follows it
 * to every device via sync, same as updateUserPin() above. */
export async function updateUserAutoLockDuration(userId: string, duration: number) {
  return update("users", userId, { auto_lock_duration: duration });
}

export async function getStaffCount() {
  // Excludes the store owner's own row (role = 'store_owner') so a plan's advertised staff limit means "N employees you can add," not "you + N-1…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-auth-ts-L102
  const result = await query<{ count: number }>(
    "SELECT COUNT(*) as count FROM users WHERE _deleted = 0 AND is_active = 1 AND id != 'default-admin' AND role != 'store_owner'"
  );
  return result[0]?.count || 0;
}
