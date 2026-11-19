import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Database } from "sql.js";
import { clearProcurementTables, createProcurementTestDb } from "./helpers/procurement-test-db";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("idb-keyval", () => ({ get: vi.fn(() => Promise.resolve(undefined)), set: vi.fn(() => Promise.resolve(undefined)) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

describe("the order list's recovered-copy notice", () => {
  let db: Database;
  let RecoveredCopiesNotice: typeof import("@/components/procurement/recovered-copies-notice").RecoveredCopiesNotice;

  beforeAll(async () => {
    ({ RecoveredCopiesNotice } = await import("@/components/procurement/recovered-copies-notice"));
    db = await createProcurementTestDb();
  });

  beforeEach(() => clearProcurementTables(db));

  const renderNotice = (client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) =>
    render(
      <QueryClientProvider client={client}>
        <RecoveredCopiesNotice />
      </QueryClientProvider>,
    );

  it("points at a recovered draft until it is dealt with", async () => {
    db.run(`INSERT INTO purchase_orders (id, status, notes, created_at, _deleted) VALUES ('copy1', 'pending', 'Recovered copy of PO-AAAA1111: B notes', '2026-11-19T10:00:00Z', 0)`);
    renderNotice();

    fireEvent.click(await screen.findByRole("button", { name: "Open the recovered draft" }));
    expect(push).toHaveBeenCalledWith("/procurement/edit?id=copy1");
  });

  it("stays away once the recovered draft has been received or deleted", async () => {
    db.run(`INSERT INTO purchase_orders (id, status, notes, created_at, _deleted) VALUES
      ('copy1', 'received', 'Recovered copy of PO-AAAA1111', '2026-11-19T10:00:00Z', 0),
      ('copy2', 'pending', 'Recovered copy of PO-BBBB2222', '2026-11-19T10:00:00Z', 1),
      ('other', 'pending', 'Monday run', '2026-11-19T10:00:00Z', 0)`);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = renderNotice(client);
    await waitFor(() => expect(client.getQueryCache().getAll()[0]?.state.status).toBe("success"));
    expect(container.textContent).toBe("");
  });
});
