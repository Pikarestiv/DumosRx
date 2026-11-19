import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));
vi.mock("@/lib/api/client", () => ({ apiClient: { checkStaffEmailAvailable: vi.fn(), pushChanges: vi.fn() } }));
vi.mock("@/lib/storage-keys", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage-keys")>()),
  getAuthToken: () => null,
}));

import { useMutateUser } from "@/lib/hooks/queries/use-users";
import { staffSaveErrorMessage } from "@/lib/utils/staff-save-errors";
import { STAFF_EMAIL_TAKEN_MESSAGE } from "@/lib/utils/staff-email-check";

describe("creating staff without an email", () => {
  let db: Database;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>{children}</QueryClientProvider>
  );

  beforeAll(async () => {
    const core = await import("@/lib/db/core");
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => db.run(`DELETE FROM users; DELETE FROM _sync_queue;`));

  const newStaff = (username: string, email = "") => ({
    first_name: "Staff",
    last_name: username,
    username,
    email,
    pin: "1234",
    role: "sales_staff",
    store_id: "agidi",
  });
  const emails = () => db.exec(`SELECT username, email FROM users ORDER BY username`)[0]?.values ?? [];

  it("lets one store hold several staff accounts that have no email", async () => {
    const { result } = renderHook(() => useMutateUser(), { wrapper });

    await result.current.create.mutateAsync(newStaff("amaka"));
    await result.current.create.mutateAsync(newStaff("chidi", "   "));
    await result.current.create.mutateAsync(newStaff("obi"));

    expect(emails()).toEqual([
      ["amaka", null],
      ["chidi", null],
      ["obi", null],
    ]);
  });

  it("is not blocked by an older account that was saved with an empty-string email", async () => {
    db.run(
      `INSERT INTO users (id, first_name, last_name, username, email, role, store_id, created_at, updated_at, _synced, _version)
       VALUES ('old', 'Old', 'Staff', 'old', '', 'sales_staff', 'agidi', '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z', 1, 1)`,
    );
    const { result } = renderHook(() => useMutateUser(), { wrapper });

    await result.current.create.mutateAsync(newStaff("amaka"));

    expect(emails()).toEqual([
      ["amaka", null],
      ["old", ""],
    ]);
  });

  it("clears an empty-string email when that account is next edited", async () => {
    db.run(
      `INSERT INTO users (id, first_name, last_name, username, email, role, store_id, created_at, updated_at, _synced, _version)
       VALUES ('old', 'Old', 'Staff', 'old', '', 'sales_staff', 'agidi', '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z', 1, 1)`,
    );
    const { result } = renderHook(() => useMutateUser(), { wrapper });

    await result.current.update.mutateAsync({ id: "old", data: { first_name: "Renamed", email: "" } });

    expect(emails()).toEqual([["old", null]]);
  });

  it("keeps a real email as typed, trimmed", async () => {
    const { result } = renderHook(() => useMutateUser(), { wrapper });

    await result.current.create.mutateAsync(newStaff("amaka", "  amaka@shop.test "));

    expect(emails()).toEqual([["amaka", "amaka@shop.test"]]);
  });
});

describe("staffSaveErrorMessage", () => {
  it("names the email when the email is what clashed", () => {
    expect(staffSaveErrorMessage(new Error("UNIQUE constraint failed: users.email"))).toBe(STAFF_EMAIL_TAKEN_MESSAGE);
  });

  it("names the username when the username is what clashed", () => {
    expect(staffSaveErrorMessage(new Error("UNIQUE constraint failed: users.store_id, users.username"))).toBe(
      "That username is already used in this store. Choose a different one.",
    );
  });

  it("says something honest about any other unique clash instead of blaming the username", () => {
    expect(staffSaveErrorMessage(new Error("UNIQUE constraint failed: users.id"))).toBe(
      "Another staff account already uses one of these details. Check them and try again.",
    );
  });

  it("returns null for errors that are not a clash", () => {
    expect(staffSaveErrorMessage(new Error("disk full"))).toBeNull();
    expect(staffSaveErrorMessage("nope")).toBeNull();
  });
});
