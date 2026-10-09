import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  downloadDiagnosticsReport,
  sendDiagnosticsReport,
} from "@/lib/utils/diagnostics-delivery";
import {
  startTillInspectionSession,
  IDLE_TIMEOUT_MS,
  type TillInspectionSession,
} from "@/lib/utils/till-inspection";

vi.mock("@/lib/api/client", () => ({
  apiClient: { getBaseURL: () => "https://api.test/api/v1" },
}));

const live = (): TillInspectionSession => ({
  admin: {
    id: "a1",
    first_name: "Ops",
    last_name: "Admin",
    email: "ops@dumosrx.com",
    role: "platform_admin",
  },
  sessionId: "sess-1",
  hardExpiresAt: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
  idleExpiresAt: new Date(Date.now() + IDLE_TIMEOUT_MS).toISOString(),
  storeId: "s1",
  deviceId: "till-7",
});

describe("downloadDiagnosticsReport", () => {
  beforeEach(() => {
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:report"),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("names the file by store and timestamp, so two tills do not collide", () => {
    const filename = downloadDiagnosticsReport("the report", "Agidi Branch");

    expect(filename).toMatch(/^DumosRx_Agidi-Branch_DeviceReport_\d{4}-\d{2}-\d{2}_\d{4}\.txt$/);
  });

  it("falls back to a usable name with no store", () => {
    expect(downloadDiagnosticsReport("r", null)).toMatch(/^DumosRx_Store_DeviceReport_/);
  });

  it("leaves no anchor behind in the document", () => {
    downloadDiagnosticsReport("the report", "Agidi");

    expect(document.querySelectorAll("a[download]")).toHaveLength(0);
  });
});

describe("sendDiagnosticsReport", () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  const send = (contactEmail?: string | null) =>
    sendDiagnosticsReport({
      report: "the report",
      storeName: "Agidi",
      deviceLabel: "Till 7",
      contactEmail,
    });

  it("files it under the inspecting admin's own address", async () => {
    startTillInspectionSession(live());
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response("{}", { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await send("owner@shop.com");

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    // The admin is the correspondent, not whatever address the store has on
    // file — and it comes from the server-issued session, not the till.
    expect(body.email).toBe("ops@dumosrx.com");
    expect(body.message).toBe("the report");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.test/api/v1/support");
  });

  it("uses the store's address when there is no inspection session", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response("{}", { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await send("owner@shop.com");

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).email).toBe(
      "owner@shop.com",
    );
  });

  it("refuses with no address rather than posting a ticket nobody can answer", async () => {
    vi.stubGlobal("fetch", vi.fn());

    await expect(send(null)).rejects.toThrow(/Download the report/);
  });

  it("sends no bearer token, so a 401 cannot unlink the till", async () => {
    startTillInspectionSession(live());
    localStorage.setItem("auth_token", "till-token");
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response("{}", { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await send();

    const headers = (fetchMock.mock.calls[0][1]?.headers ?? {}) as Record<string, string>;
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain("authorization");
    expect(localStorage.getItem("auth_token")).toBe("till-token");
  });

  it("explains a throttle rather than failing silently", async () => {
    startTillInspectionSession(live());
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })));

    await expect(send()).rejects.toThrow(/Too many reports/);
  });

  it("points at the download when the server cannot be reached", async () => {
    startTillInspectionSession(live());
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));

    await expect(send()).rejects.toThrow(/Download the report/);
  });
});
