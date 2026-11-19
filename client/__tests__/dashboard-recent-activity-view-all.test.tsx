import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DashboardRecentActivity } from "@/components/dashboard/dashboard-recent-activity";

describe("Dashboard Recent Activity", () => {
  it("sends View All to the Activity Log, where the same feed is listed in full", () => {
    render(<DashboardRecentActivity activities={[]} getActivityColor={() => ""} />);

    expect(screen.getByRole("link", { name: "View All" }).getAttribute("href")).toBe("/activity-log");
  });
});
