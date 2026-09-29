/** A device's "recently signed in" list, rendered on the lock screen and the
 * device picker. Persisted under STORAGE_KEYS.recentUsers. */
export interface RecentUser {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
  role: string;
  last_login: string;
}

/** Raw `users` table row, including the PIN hash. Never pass this around
 * app state directly (use the auth context's `User` for that); only the
 * login flow that verifies the PIN should see this shape. */
export interface UserDbRow {
  id: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  email?: string;
  pin?: string;
  role: string;
  store_id?: string;
  is_active?: number;
  created_at?: string;
  permission_group_id?: string | null;
}

/** Payload built by the staff create/edit form: createUser() requires
 * store_id/pin, updateUser() only ever sends a partial edit. */
export interface StaffCreatePayload {
  [key: string]: unknown;
  id?: string;
  first_name: string;
  last_name: string;
  username: string;
  email?: string;
  pin: string;
  role: string;
  // null (not "") when no store is active at creation time - an empty
  // string matches neither `store_id = ?` nor the `store_id IS NULL`
  // fallback getUsers()/local-database.ts checks for, making the account
  // invisible in every staff list while still able to log in.
  store_id: string | null;
  permission_group_id?: string;
}

export type StaffUpdatePayload = Partial<StaffCreatePayload>;

/** Staff directory row: UserDbRow without the PIN hash, since the staff
 * list/edit-form never needs it (edits always start with a blank PIN field) —
 * only `has_pin`, derived query-side, so the list can show whether an account
 * actually has a PIN rather than assuming every account does. */
export type StaffListItem = Omit<UserDbRow, "pin"> & { has_pin?: number };

/** The cloud Sanctum-authenticated account (store owner/admin), distinct
 * from the auth-context `User`, which represents the local, PIN-authenticated
 * device user. Only the store owner/admin has one of these; staff members
 * log in locally and have no cloud session of their own. */
export interface CurrentUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string | null;
  role: string;
  deletion_requested_at?: string | null;
  deletion_reason?: string | null;
}

/** A single authenticated Sanctum session/device, as listed on the
 * account's Sessions & Devices settings page. */
export interface Session {
  id: string;
  name: string;
  ip_address: string | null;
  user_agent: string | null;
  last_used_at: string | null;
  created_at: string;
  is_current: boolean;
}
