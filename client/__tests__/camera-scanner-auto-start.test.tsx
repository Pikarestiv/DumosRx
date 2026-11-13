import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StrictMode } from "react";
import { render, screen, waitFor, act } from "@testing-library/react";

const scannerMock = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  instances: 0,
  getCameras: () => Promise.resolve([{ id: "cam-1", label: "Back" }]),
}));

vi.mock("html5-qrcode", () => {
  class Html5Qrcode {
    isScanning = false;
    constructor() {
      scannerMock.instances += 1;
    }
    static getCameras = () => scannerMock.getCameras();
    start() {
      scannerMock.start();
      this.isScanning = true;
      return Promise.resolve();
    }
    stop() {
      scannerMock.stop();
      this.isScanning = false;
      return Promise.resolve();
    }
    getRunningTrackCameraCapabilities() {
      return { torchFeature: () => ({ isSupported: () => false, apply: async () => {} }) };
    }
  }
  return { Html5Qrcode };
});

import { CameraScannerDialog } from "@/components/pos/camera-scanner-dialog";

function setCameraPermission(query: (() => Promise<{ state: PermissionState }>) | undefined) {
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: query ? { query } : undefined,
  });
}

function renderDialog(strict = false) {
  const dialog = <CameraScannerDialog isOpen onClose={() => {}} onScanSuccess={() => {}} />;
  return render(strict ? <StrictMode>{dialog}</StrictMode> : dialog);
}

describe("CameraScannerDialog permission-aware start", () => {
  beforeEach(() => {
    scannerMock.start.mockReset();
    scannerMock.stop.mockReset();
    scannerMock.instances = 0;
    scannerMock.getCameras = () => Promise.resolve([{ id: "cam-1", label: "Back" }]);
  });

  afterEach(() => {
    setCameraPermission(undefined);
    localStorage.clear();
  });

  it("starts the camera straight away when permission was already granted", async () => {
    setCameraPermission(() => Promise.resolve({ state: "granted" }));
    renderDialog();

    await waitFor(() => expect(scannerMock.start).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: "Enable Camera" })).toBeNull();
    expect(await screen.findByText("Align the barcode within the frame.")).toBeTruthy();
  });

  it("starts exactly one camera under React strict mode's double effects", async () => {
    setCameraPermission(() => Promise.resolve({ state: "granted" }));
    renderDialog(true);

    await waitFor(() => expect(scannerMock.start).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(scannerMock.instances).toBe(1);
  });

  it("stops the auto-started camera when the dialog unmounts", async () => {
    setCameraPermission(() => Promise.resolve({ state: "granted" }));
    const { unmount } = renderDialog();
    await waitFor(() => expect(scannerMock.start).toHaveBeenCalledTimes(1));

    unmount();
    await waitFor(() => expect(scannerMock.stop).toHaveBeenCalledTimes(1));
  });

  it("never leaves a camera running when the dialog closes while the camera is still starting", async () => {
    let releaseCameras: (cameras: { id: string; label: string }[]) => void = () => {};
    scannerMock.getCameras = () => new Promise((resolve) => (releaseCameras = resolve));
    setCameraPermission(() => Promise.resolve({ state: "granted" }));
    const { unmount } = renderDialog();
    await act(async () => {});

    unmount();
    releaseCameras([{ id: "cam-1", label: "Back" }]);
    await act(async () => {});

    expect(scannerMock.start).not.toHaveBeenCalled();
  });

  it("keeps the Enable Camera prompt when the browser would still ask", async () => {
    setCameraPermission(() => Promise.resolve({ state: "prompt" }));
    renderDialog();

    expect(await screen.findByRole("button", { name: "Enable Camera" })).toBeTruthy();
    await act(async () => {});
    expect(scannerMock.start).not.toHaveBeenCalled();
  });

  it("shows the denied state without starting the camera when permission was refused", async () => {
    setCameraPermission(() => Promise.resolve({ state: "denied" }));
    renderDialog();

    expect(await screen.findByText("Camera access denied")).toBeTruthy();
    expect(scannerMock.start).not.toHaveBeenCalled();
  });

  it("falls back to the prompt when the Permissions API rejects the camera query", async () => {
    setCameraPermission(() => Promise.reject(new TypeError("camera is not a valid permission name")));
    renderDialog();

    await act(async () => {});
    expect(screen.getByRole("button", { name: "Enable Camera" })).toBeTruthy();
    expect(scannerMock.start).not.toHaveBeenCalled();
  });

  it("falls back to the prompt when the browser has no Permissions API", async () => {
    setCameraPermission(undefined);
    renderDialog();

    await act(async () => {});
    expect(screen.getByRole("button", { name: "Enable Camera" })).toBeTruthy();
    expect(scannerMock.start).not.toHaveBeenCalled();
  });

  it("remembers a successful start and auto-starts next time when the browser cannot report camera permission", async () => {
    setCameraPermission(undefined);
    const first = renderDialog();
    await act(async () => {});
    expect(scannerMock.start).not.toHaveBeenCalled();
    act(() => screen.getByRole("button", { name: "Enable Camera" }).click());
    await waitFor(() => expect(scannerMock.start).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(localStorage.getItem("camera_scanner_allowed")).toBe("1"));
    first.unmount();

    scannerMock.start.mockClear();
    renderDialog();
    await waitFor(() => expect(scannerMock.start).toHaveBeenCalledTimes(1));
  });

  it("does not trust the remembered flag when the browser says it would ask again", async () => {
    localStorage.setItem("camera_scanner_allowed", "1");
    setCameraPermission(() => Promise.resolve({ state: "prompt" }));
    renderDialog();

    await act(async () => {});
    expect(screen.getByRole("button", { name: "Enable Camera" })).toBeTruthy();
    expect(scannerMock.start).not.toHaveBeenCalled();
  });

  it("forgets the remembered flag when the camera is refused", async () => {
    localStorage.setItem("camera_scanner_allowed", "1");
    setCameraPermission(undefined);
    scannerMock.start.mockImplementation(() => {
      throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
    });
    renderDialog();

    await waitFor(() => expect(screen.getByText("Camera access denied")).toBeTruthy());
    expect(localStorage.getItem("camera_scanner_allowed")).toBeNull();
  });
});
