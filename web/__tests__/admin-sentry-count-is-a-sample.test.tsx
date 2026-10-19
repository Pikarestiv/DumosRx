import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SentryIssuesCard } from "@/components/admin/operations/sentry-issues-card";
import type { SentryIssue } from "@/lib/types/admin";

const issue: SentryIssue = {
  id: "1",
  project: "dumosrx-client",
  title: "Sync pull failed",
  culprit: "pull.ts",
  level: "error",
  count: 12,
  userCount: 3,
  lastSeen: "2026-10-19T10:00:00Z",
  firstSeen: "2026-10-18T10:00:00Z",
  permalink: "https://sentry.io/issues/1/",
};

/**
 * A `captureException` is throttled to one event per fingerprint per hour and
 * the dev environment samples at 0.1, so a Sentry issue count is a lower
 * bound. It must never read as "this happened exactly N times".
 */
describe("SentryIssuesCard event counts", () => {
  it("renders the count as a lower bound, not a total", () => {
    render(<SentryIssuesCard data={{ configured: true, issues: [issue] }} isLoading={false} />);

    expect(screen.getByText(/≥\s*12 events/)).toBeInTheDocument();
    expect(screen.queryByText(/^12 events$/)).not.toBeInTheDocument();
  });

  it("says in the card that the counts are throttled samples and names the true figure", () => {
    render(<SentryIssuesCard data={{ configured: true, issues: [issue] }} isLoading={false} />);

    expect(screen.getByText(/sampled/i)).toBeInTheDocument();
    expect(screen.getByText(/occurrence count/i)).toBeInTheDocument();
  });
});
