import { describe, it, expect, afterEach } from "vitest";
import { render, act, waitFor, cleanup } from "@testing-library/react";
import { Toaster, toast } from "sonner";
import { toastTiming } from "@/lib/utils/toast-timing";

async function showToast(durationMs: number) {
  render(<Toaster />);
  act(() => {
    toast("Saved", toastTiming(durationMs));
  });
  return waitFor(() => {
    const el = document.querySelector<HTMLElement>("[data-sonner-toast]");
    expect(el).not.toBeNull();
    return el as HTMLElement;
  });
}

describe("toast countdown bar timing (A-360)", () => {
  afterEach(() => {
    act(() => {
      toast.dismiss();
    });
    cleanup();
  });

  it("runs the bar for the toast's own duration", async () => {
    const el = await showToast(8000);

    expect(el.style.getPropertyValue("--toast-timer-duration")).toBe("8000ms");
  });

  it("hides the bar on a toast that never closes by itself", async () => {
    const el = await showToast(Infinity);

    expect(el.style.getPropertyValue("--toast-bar-color")).toBe("transparent");
    expect(el.style.getPropertyValue("--toast-track-color")).toBe("transparent");
  });
});
