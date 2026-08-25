import { query, execute } from "@/lib/db/core";
import type { UserDbRow } from "@/lib/types/user";

export async function getUserByUsernameOrEmail(identifier: string) {
  const isEmail = identifier.includes("@");
  const field = isEmail ? "email" : "username";
  const users = await query<UserDbRow>(
    `SELECT * FROM users WHERE LOWER(${field}) = LOWER(?) AND is_active = 1`,
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
  return query(
    "INSERT OR IGNORE INTO users (id, first_name, last_name, username, pin, role, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [adminInfo.id, adminInfo.first_name, adminInfo.last_name, adminInfo.username, adminInfo.pin, adminInfo.role, 1]
  );
}

export async function getUserPin(userId: string) {
  const users = await query<{ pin: string }>("SELECT pin FROM users WHERE id = ?", [userId]);
  return users.length > 0 ? users[0].pin : null;
}

export async function updateUserPin(userId: string, newPin: string) {
  return execute("UPDATE users SET pin = ? WHERE id = ?", [newPin, userId]);
}

export async function getStaffCount() {
  const result = await query<{ count: number }>(
    "SELECT COUNT(*) as count FROM users WHERE _deleted = 0 AND is_active = 1 AND id != 'default-admin'"
  );
  return result[0]?.count || 0;
}
