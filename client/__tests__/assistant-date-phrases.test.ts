import { describe, it, expect } from "vitest";
import { parseDatePhrase } from "@/lib/assistant/date-phrases";

const NOW = new Date(2026, 8, 29, 14, 30, 0);

describe("parseDatePhrase", () => {
  it("resolves 'today'", () => {
    expect(parseDatePhrase("sales today", NOW)).toEqual({
      from: "2026-09-29",
      to: "2026-09-29",
      label: "today",
    });
  });

  it("resolves 'yesterday'", () => {
    expect(parseDatePhrase("profit yesterday", NOW)).toEqual({
      from: "2026-09-28",
      to: "2026-09-28",
      label: "yesterday",
    });
  });

  it("resolves 'yesterday' correctly across a month boundary", () => {
    const firstOfMonth = new Date(2026, 9, 1, 0, 30, 0);
    expect(parseDatePhrase("sales yesterday", firstOfMonth)).toEqual({
      from: "2026-09-30",
      to: "2026-09-30",
      label: "yesterday",
    });
  });

  it("resolves 'this month'", () => {
    expect(parseDatePhrase("gross profit this month", NOW)).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
      label: "this month",
    });
  });

  it("resolves 'last month'", () => {
    expect(parseDatePhrase("net profit last month", NOW)).toEqual({
      from: "2026-08-01",
      to: "2026-08-31",
      label: "last month",
    });
  });

  it("resolves an ISO date", () => {
    expect(parseDatePhrase("profit on 2026-09-01", NOW)).toEqual({
      from: "2026-09-01",
      to: "2026-09-01",
      label: "2026-09-01",
    });
  });

  it("resolves a DD/MM/YYYY date", () => {
    expect(parseDatePhrase("sales on 15/09/2026", NOW)).toEqual({
      from: "2026-09-15",
      to: "2026-09-15",
      label: "15/09/2026",
    });
  });

  it("resolves 'from X to Y'", () => {
    expect(parseDatePhrase("profit from 2026-09-01 to 2026-09-10", NOW)).toEqual({
      from: "2026-09-01",
      to: "2026-09-10",
      label: "2026-09-01 to 2026-09-10",
    });
  });

  it("resolves a relative-word range like 'from yesterday to today'", () => {
    expect(parseDatePhrase("sales from yesterday to today", NOW)).toEqual({
      from: "2026-09-28",
      to: "2026-09-29",
      label: "yesterday to today",
    });
  });

  it("falls through to a bare relative-day match when the range phrase doesn't resolve to dates", () => {
    expect(parseDatePhrase("move stock from the shelf to the counter today", NOW)).toEqual({
      from: "2026-09-29",
      to: "2026-09-29",
      label: "today",
    });
  });

  it("returns null for an invalid date like 31/02/2026", () => {
    expect(parseDatePhrase("sales on 31/02/2026", NOW)).toBeNull();
  });

  it("returns null when no date phrase is present", () => {
    expect(parseDatePhrase("what's low on stock", NOW)).toBeNull();
  });
});
