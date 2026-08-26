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
  store_id: string;
}

export type StaffUpdatePayload = Partial<StaffCreatePayload>;

/** Staff directory row: UserDbRow without the PIN hash, since the staff
 * list/edit-form never needs it (edits always start with a blank PIN field). */
export type StaffListItem = Omit<UserDbRow, "pin">;

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
