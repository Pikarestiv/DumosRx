import { query } from "@/lib/db/core";
import { update, insert } from "@/lib/db/local-database";
import type { UserDbRow } from "@/lib/types/user";
import { hashPin } from "@/lib/utils/pin-hash";

/**
 * Deliberately NOT scoped to the currently-active store. On a multi-store
 * device (an owner/admin who has synced staff from more than one store) the
 * product decision is "authenticate first, then follow the account": a
 * successful login by a store-pinned user makes THEIR store the active one
 * (see auth-context.tsx's login()), rather than the previously-selected
 * store filtering who is allowed to log in. Scoping this query instead
 * would lock a cashier out of a device whose switcher happens to be
 * pointing at a sibling store.
 *
 * Known limit: usernames are unique per store, not globally -
 * `UNIQUE(store_id, username)` in schema.ts, matching the server's
 * 2026_08_01_000001_scope_username_uniqueness_to_store migration - so on a
 * multi-store device two rows can legitimately share a username. Returns
 * EVERY matching row (not just the first) precisely so a caller can detect
 * that ambiguity — see getUserByUsernameOrEmail below for the single-row
 * convenience wrapper, and auth-context.tsx's login() for how it uses this
 * to fail closed instead of silently picking one on a genuine collision
 * (same username AND the same PIN at two of this device's stores).
 */
export async function getUsersByUsernameOrEmail(identifier: string) {
  const isEmail = identifier.includes("@");
  const field = isEmail ? "email" : "username";
  return query<UserDbRow>(
    `SELECT * FROM users WHERE LOWER(${field}) = LOWER(?) AND is_active = 1 AND (_deleted = 0 OR _deleted IS NULL)`,
    [identifier]
  );
}

/**
 * Single-row convenience wrapper around getUsersByUsernameOrEmail. Returns
 * whichever SQLite yields first when more than one row matches (a genuine
 * multi-store username collision) — callers that need to authenticate a PIN
 * against a possibly-ambiguous identifier MUST use getUsersByUsernameOrEmail
 * directly instead, so they can detect and refuse an ambiguous match rather
 * than silently authenticating against a random one. See auth-context.tsx's
 * login().
 */
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
      // Hashed like every other stored PIN, even though the bootstrap
      // value itself is a documented constant (DEFAULT_ADMIN_PIN) - once
      // this row exists, ordinary login verifies against this column.
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

/** Stores a PIN hashed, never raw - see lib/utils/pin-hash.ts. Goes through
 * update() so it queues for sync push like any other local write, which is
 * also how a hash reaches the server and, from there, every other device. */
export async function updateUserPin(userId: string, newPin: string) {
  return update("users", userId, { pin: hashPin(newPin) });
}

/**
 * The lazy half of the plaintext-PIN migration: called right after a
 * successful login that matched a LEGACY plaintext `users.pin`, it rewrites
 * that row's PIN as a bcrypt hash of the very PIN just verified.
 *
 * Deliberately never throws - the login it follows has already succeeded,
 * and a failed rewrite only means this row stays plaintext until the next
 * login tries again. Nothing user-visible happens either way: no forced
 * reset, no prompt.
 */
export async function migrateLegacyPinToHash(userId: string, verifiedPin: string) {
  try {
    await updateUserPin(userId, verifiedPin);
    return true;
  } catch (e) {
    console.error("Failed to upgrade stored PIN to a hash", e);
    return false;
  }
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
