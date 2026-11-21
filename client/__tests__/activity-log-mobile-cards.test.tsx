import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  ActivityLogMobileList,
  ActivityLogMobileCard,
} from "@/components/activity-log/activity-log-mobile-list";
import type { AuditLogRow } from "@/lib/types/audit-log";

describe("ActivityLogMobileList", () => {
  const sampleRows: AuditLogRow[] = [
    {
      id: "log-1",
      action: "INSERT",
      table_name: "products",
      record_id: "prod-1",
      user_name: "Chioma",
      created_at: "2026-11-20T10:00:00.000Z",
      details: JSON.stringify({ name: "Amoxicillin 500mg" }),
    },
    {
      id: "log-2",
      action: "LOGIN",
      table_name: "users",
      record_id: "user-1",
      user_name: "Emeka",
      created_at: "2026-11-20T09:30:00.000Z",
      occurrence_count: 3,
    },
  ];

  it("renders mobile activity cards with human-readable descriptions and details", () => {
    const onSelect = vi.fn();
    render(
      <ActivityLogMobileList
        rows={sampleRows}
        isLoading={false}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByText('Created product "Amoxicillin 500mg"')).toBeTruthy();
    expect(screen.getByText("Chioma")).toBeTruthy();
    expect(screen.getByText("Signed in")).toBeTruthy();
    expect(screen.getByText("Emeka")).toBeTruthy();
    expect(screen.getByText("×3")).toBeTruthy();
  });

  it("calls onSelect when a card is clicked or activated with Enter", () => {
    const onSelect = vi.fn();
    render(
      <ActivityLogMobileCard
        row={sampleRows[0]}
        group={[sampleRows[0]]}
        onSelect={onSelect}
      />,
    );

    const card = screen.getByRole("button");
    fireEvent.click(card);
    expect(onSelect).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(card, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it("renders empty state when there are no rows", () => {
    render(
      <ActivityLogMobileList
        rows={[]}
        isLoading={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("No activity found for this filter")).toBeTruthy();
  });
});
