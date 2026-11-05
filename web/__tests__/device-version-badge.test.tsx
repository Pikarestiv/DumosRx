import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  formatDeviceVersion,
  DeviceVersionBadge,
  DeviceIdentity,
  LatestBuildShaProvider,
} from "@/components/admin/stores/details/store-detail-primitives";

describe("formatDeviceVersion", () => {
  it("returns null when neither is provided or both are empty", () => {
    expect(formatDeviceVersion()).toBeNull();
    expect(formatDeviceVersion(null, null)).toBeNull();
    expect(formatDeviceVersion("", "")).toBeNull();
    expect(formatDeviceVersion("   ", "   ")).toBeNull();
  });

  it("formats app version alone with a v prefix", () => {
    expect(formatDeviceVersion("0.0.41")).toBe("v0.0.41");
  });

  it("formats build SHA alone, truncating 40-character SHAs to 8 characters", () => {
    expect(formatDeviceVersion(null, "a19fa29f")).toBe("a19fa29f");
    expect(
      formatDeviceVersion(null, "a19fa29fca740203bf1887888bccffcd9da5fd6e")
    ).toBe("a19fa29f");
    expect(formatDeviceVersion(null, "local")).toBe("local");
  });

  it("combines both app version and short build SHA", () => {
    expect(
      formatDeviceVersion("0.0.41", "a19fa29fca740203bf1887888bccffcd9da5fd6e")
    ).toBe("v0.0.41 · a19fa29f");
    expect(formatDeviceVersion("0.0.41", "local")).toBe("v0.0.41 · local");
  });
});

describe("DeviceVersionBadge", () => {
  it("renders nothing when no version info is present", () => {
    const { container } = render(<DeviceVersionBadge />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a neutral badge when latest build SHA is not provided", () => {
    render(
      <DeviceVersionBadge
        appVersion="0.0.41"
        buildSha="a19fa29fca740203bf1887888bccffcd9da5fd6e"
      />
    );
    const badge = screen.getByText("v0.0.41 · a19fa29f");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute(
      "title",
      "App: 0.0.41 | Build: a19fa29fca740203bf1887888bccffcd9da5fd6e"
    );
  });

  it("renders emerald up-to-date badge when device matches latest build SHA", () => {
    render(
      <DeviceVersionBadge
        appVersion="0.0.41"
        buildSha="a19fa29fca740203bf1887888bccffcd9da5fd6e"
        latestBuildSha="a19fa29f"
      />
    );
    const badge = screen.getByText("v0.0.41 · a19fa29f");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute("title", "Up to date (Build: a19fa29f)");
    expect(badge).toHaveClass("text-emerald-700");
  });

  it("renders amber update-pending badge when device lags behind latest build SHA", () => {
    render(
      <DeviceVersionBadge
        appVersion="0.0.40"
        buildSha="7d6930d9"
        latestBuildSha="a19fa29f"
      />
    );
    const badge = screen.getByText("v0.0.40 · 7d6930d9");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute(
      "title",
      "Update pending (device: 7d6930d9, latest: a19fa29f)"
    );
    expect(badge).toHaveClass("text-amber-700");
  });

  it("inherits latestBuildSha from LatestBuildShaProvider context", () => {
    render(
      <LatestBuildShaProvider value="a19fa29f">
        <DeviceVersionBadge
          appVersion="0.0.41"
          buildSha="a19fa29f"
        />
      </LatestBuildShaProvider>
    );
    const badge = screen.getByText("v0.0.41 · a19fa29f");
    expect(badge).toHaveAttribute("title", "Up to date (Build: a19fa29f)");
    expect(badge).toHaveClass("text-emerald-700");
  });
});

describe("DeviceIdentity", () => {
  it("renders label, device id, and version badge together", () => {
    render(
      <DeviceIdentity
        label="Main Counter"
        deviceId="DRX-COUNTER-1"
        appVersion="0.0.41"
        buildSha="a19fa29f"
        latestBuildSha="a19fa29f"
      />
    );
    expect(screen.getByText("Main Counter")).toBeInTheDocument();
    expect(screen.getByText("DRX-COUNTER-1")).toBeInTheDocument();
    expect(screen.getByText("v0.0.41 · a19fa29f")).toBeInTheDocument();
  });
});
