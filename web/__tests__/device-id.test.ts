import { describe, it, expect, beforeEach } from "vitest";
import { getDeviceId } from "@/lib/utils/device-id";

describe("web getDeviceId", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("generates and persists a DRX-WEB- device id in localStorage", () => {
    const id1 = getDeviceId();
    expect(id1).toMatch(/^DRX-WEB-[A-Z0-9]+$/);

    const id2 = getDeviceId();
    expect(id2).toBe(id1);
  });
});
