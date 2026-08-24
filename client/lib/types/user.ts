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
