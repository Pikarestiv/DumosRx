import { query, execute } from "@/lib/db/core";

export async function getUserByUsernameOrEmail(identifier: string) {
  const isEmail = identifier.includes("@");
  const field = isEmail ? "email" : "username";
  const users = await query<any>(
    `SELECT * FROM users WHERE LOWER(${field}) = LOWER(?) AND is_active = 1`, 
    [identifier]
  );
  return users.length > 0 ? users[0] : null;
}

export async function createDefaultAdmin(adminInfo: any) {
  return query(
    "INSERT OR IGNORE INTO users (id, first_name, last_name, username, pin, role, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [adminInfo.id, adminInfo.first_name, adminInfo.last_name, adminInfo.username, adminInfo.pin, adminInfo.role, 1]
  );
}

export async function getUserPin(userId: string) {
  const users = await query<any>("SELECT pin FROM users WHERE id = ?", [userId]);
  return users.length > 0 ? users[0].pin : null;
}

export async function updateUserPin(userId: string, newPin: string) {
  return execute("UPDATE users SET pin = ? WHERE id = ?", [newPin, userId]);
}

export async function getStaffCount() {
  const result = await query<{ count: number }>(
    "SELECT COUNT(*) as count FROM users WHERE _deleted = 0 AND id != 'default-admin'"
  );
  return result[0]?.count || 0;
}
