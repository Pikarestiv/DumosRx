import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CountFreshnessWarning } from "@/components/stock-batch/count-freshness-warning";
import type { CountFreshness } from "@/lib/hooks/use-count-freshness";

// Stage 1 of docs/superpowers/specs/2026-10-14-oversell-compensating-movement-design.md:
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-count-freshness-warning-deficit-test-tsx-L6
const fresh: CountFreshness = {
  localMinutes: 2,
  isLocalStale: false,
  stalePeers: [],
  thresholdMinutes: 30,
  deficits: [],
  shouldWarn: false,
};

describe("CountFreshnessWarning: the shortfall notice", () => {
  afterEach(cleanup);

  it("says nothing when the device is fresh and no product is short", () => {
    const { container } = render(
      <CountFreshnessWarning
        freshness={fresh}
        acknowledged={false}
        onAcknowledgedChange={() => {}}
      />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("names each short product and what a count will actually do", () => {
    render(
      <CountFreshnessWarning
        freshness={{
          ...fresh,
          deficits: [
            { productName: "gluformin", deficit: 2 },
            { productName: "amoxicillin", deficit: 1 },
          ],
          shouldWarn: true,
        }}
        acknowledged={false}
        onAcknowledgedChange={() => {}}
      />,
    );

    expect(
      screen.getByText("Some of these products are carrying a stock shortfall"),
    ).toBeTruthy();
    expect(screen.getByText(/gluformin/)).toBeTruthy();
    expect(screen.getByText(/2 units short/)).toBeTruthy();
    expect(screen.getByText(/1 unit short/)).toBeTruthy();
  });

  it("keeps the staleness heading when the device is also behind", () => {
    render(
      <CountFreshnessWarning
        freshness={{
          ...fresh,
          localMinutes: 180,
          isLocalStale: true,
          deficits: [{ productName: "gluformin", deficit: 2 }],
          shouldWarn: true,
        }}
        acknowledged={false}
        onAcknowledgedChange={() => {}}
      />,
    );

    expect(
      screen.getByText("This count may be recorded against out-of-date stock"),
    ).toBeTruthy();
    expect(screen.getByText(/gluformin/)).toBeTruthy();
  });

  it("leaves out the shortfall copy when only the device is stale", () => {
    render(
      <CountFreshnessWarning
        freshness={{ ...fresh, isLocalStale: true, shouldWarn: true }}
        acknowledged={false}
        onAcknowledgedChange={() => {}}
      />,
    );

    expect(screen.queryByText(/short/)).toBeNull();
  });
});
