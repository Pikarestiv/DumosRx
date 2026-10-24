import { execute } from "@/lib/db/core";

export interface LocalAdminSeed {
  userId: string;
  firstName: string;
  lastName: string;
  username: string;
  hashedPin: string;
}

export interface PendingNewRegistration extends LocalAdminSeed {
  store: { id: string; name: string };
  pin: string;
  storeName: string;
}

const INSERT_STORE_SQL =
  "INSERT INTO stores (id, name, is_initialized, created_at, updated_at, _synced, auto_sync_enabled, auto_sync_interval) VALUES (?, ?, ?, ?, ?, ?, 1, 30)";
const INSERT_USER_SQL =
  "INSERT INTO users (id, first_name, last_name, username, pin, role, store_id, is_active, created_at, updated_at, _synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
const INSERT_SYNC_QUEUE_SQL =
  "INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at) VALUES (?, ?, ?, ?, ?)";

function insertAdminUser(admin: LocalAdminSeed, storeId: string, now: string, synced: 0 | 1) {
  return execute(INSERT_USER_SQL, [
    admin.userId, admin.firstName, admin.lastName, admin.username, admin.hashedPin,
    "admin", storeId, 1, now, now, synced,
  ]);
}

function queueSyncRow(table: string, recordId: string, operation: "INSERT" | "UPDATE", payload: object, now: string) {
  return execute(INSERT_SYNC_QUEUE_SQL, [table, recordId, operation, JSON.stringify(payload), now]);
}

export async function seedCloudLinkedStoreAndAdmin(
  store: { id: string; name: string },
  admin: LocalAdminSeed,
  now: string,
) {
  await execute(INSERT_STORE_SQL, [store.id, store.name, 1, now, now, 1]);
  await insertAdminUser(admin, store.id, now, 1);
}

export async function seedOfflineStoreAndAdmin(
  storeId: string,
  storeName: string,
  isExistingStore: boolean,
  admin: LocalAdminSeed,
  now: string,
) {
  if (!isExistingStore) {
    await execute(INSERT_STORE_SQL, [storeId, storeName, 1, now, now, 0]);
    await queueSyncRow("stores", storeId, "INSERT", {
      id: storeId,
      name: storeName,
      is_initialized: 1,
      created_at: now,
      updated_at: now,
      auto_sync_enabled: 1,
      auto_sync_interval: 30,
    }, now);
  } else {
    await execute(
      "UPDATE stores SET name = ?, is_initialized = 1, updated_at = ? WHERE id = ?",
      [storeName, now, storeId],
    );
    await queueSyncRow("stores", storeId, "UPDATE", {
      id: storeId,
      name: storeName,
      is_initialized: 1,
      updated_at: now,
    }, now);
  }

  await insertAdminUser(admin, storeId, now, 0);
  await queueSyncRow("users", admin.userId, "INSERT", {
    id: admin.userId,
    first_name: admin.firstName,
    last_name: admin.lastName,
    username: admin.username,
    pin: admin.hashedPin,
    role: "admin",
    store_id: storeId,
    is_active: 1,
    created_at: now,
    updated_at: now,
  }, now);
}
