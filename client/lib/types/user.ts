/** Raw `users` table row, including the PIN hash — never pass this around
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
}
