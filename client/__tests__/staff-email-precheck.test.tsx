import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import initSqlJs, { type Database } from "sql.js";

const { checkAvailable, authToken } = vi.hoisted(() => ({
  checkAvailable: vi.fn(),
  authToken: { value: "token" as string | null },
}));

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));
vi.mock("@/lib/api/client", () => ({ apiClient: { checkStaffEmailAvailable: checkAvailable, pushChanges: vi.fn() } }));
vi.mock("@/lib/storage-keys", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage-keys")>()),
  getAuthToken: () => authToken.value,
}));

import { assertStaffEmailFree, EMAIL_CHECK_TIMEOUT_MS, StaffEmailTakenError } from "@/lib/utils/staff-email-check";
import { useMutateUser } from "@/lib/hooks/queries/use-users";

const setOnline = (online: boolean) => Object.defineProperty(navigator, "onLine", { value: online, configurable: true });

describe("assertStaffEmailFree", () => {
  beforeEach(() => {
    checkAvailable.mockReset();
    authToken.value = "token";
    setOnline(true);
  });

  afterEach(() => setOnline(true));

  it("passes when the server says the address is free, passing along the account being edited", async () => {
    checkAvailable.mockResolvedValue({ available: true });

    await expect(assertStaffEmailFree("  new@shop.test ", "u1")).resolves.toBeUndefined();
    expect(checkAvailable).toHaveBeenCalledWith("new@shop.test", "u1");
  });

  it("refuses with a plain message when another account holds the address", async () => {
    checkAvailable.mockResolvedValue({ available: false });

    const attempt = assertStaffEmailFree("josh@dumostech.com");

    await expect(attempt).rejects.toBeInstanceOf(StaffEmailTakenError);
    await expect(attempt).rejects.toThrow(/already used by another account/i);
  });

  it("never blocks an offline till, so the edit can still be saved and judged on sync", async () => {
    setOnline(false);

    await expect(assertStaffEmailFree("josh@dumostech.com")).resolves.toBeUndefined();
    expect(checkAvailable).not.toHaveBeenCalled();
  });

  it("never blocks when the server cannot be asked", async () => {
    checkAvailable.mockRejectedValue(new Error("Network error"));

    await expect(assertStaffEmailFree("josh@dumostech.com")).resolves.toBeUndefined();
  });

  it("lets the save through when the server takes too long to answer", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      checkAvailable.mockReturnValue(new Promise(() => {}));
      const attempt = assertStaffEmailFree("josh@dumostech.com");
      await vi.advanceTimersByTimeAsync(EMAIL_CHECK_TIMEOUT_MS);
      await expect(attempt).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not ask for a blank email or without a cloud account", async () => {
    await assertStaffEmailFree("   ");
    await assertStaffEmailFree(undefined);
    authToken.value = null;
    await assertStaffEmailFree("josh@dumostech.com");

    expect(checkAvailable).not.toHaveBeenCalled();
  });
});

describe("editing a staff member's email", () => {
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

  beforeEach(() => {
    db.run(`DELETE FROM users; DELETE FROM _sync_queue;`);
    db.run(
      `INSERT INTO users (id, first_name, last_name, username, email, role, store_id, created_at, updated_at, _synced, _version)
       VALUES ('u1', 'Staff', 'Member', 'staff1', 'staff@local.dumosrx.com', 'sales_staff', 'store-1', '2026-11-18T00:00:00Z', '2026-11-18T00:00:00Z', 1, 2)`,
    );
    checkAvailable.mockReset();
    authToken.value = "token";
    setOnline(true);
  });

  const emailOf = () => db.exec(`SELECT email FROM users WHERE id = 'u1'`)[0].values[0][0];
  const queued = () => db.exec(`SELECT COUNT(*) FROM _sync_queue`)[0].values[0][0];

  it("saves nothing and queues nothing when the server says the address is taken", async () => {
    checkAvailable.mockResolvedValue({ available: false });
    const { result } = renderHook(() => useMutateUser(), { wrapper });

    await expect(result.current.update.mutateAsync({ id: "u1", data: { email: "josh@dumostech.com" } })).rejects.toBeInstanceOf(
      StaffEmailTakenError,
    );

    expect(emailOf()).toBe("staff@local.dumosrx.com");
    expect(queued()).toBe(0);
  });

  it("saves the new address and queues it when the server says it is free", async () => {
    checkAvailable.mockResolvedValue({ available: true });
    const { result } = renderHook(() => useMutateUser(), { wrapper });

    await result.current.update.mutateAsync({ id: "u1", data: { email: "josh+staff@dumostech.com" } });

    expect(emailOf()).toBe("josh+staff@dumostech.com");
    expect(queued()).toBeGreaterThan(0);
  });

  it("does not ask the server when the email is not being changed", async () => {
    const { result } = renderHook(() => useMutateUser(), { wrapper });

    await result.current.update.mutateAsync({ id: "u1", data: { first_name: "Renamed", email: "STAFF@local.dumosrx.com" } });

    expect(checkAvailable).not.toHaveBeenCalled();
  });

  it("still saves offline, leaving the server to judge it when the till syncs", async () => {
    setOnline(false);
    const { result } = renderHook(() => useMutateUser(), { wrapper });

    await result.current.update.mutateAsync({ id: "u1", data: { email: "josh@dumostech.com" } });

    expect(emailOf()).toBe("josh@dumostech.com");
    expect(checkAvailable).not.toHaveBeenCalled();
  });
});
