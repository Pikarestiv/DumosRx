import { describe, it, expect, vi } from "vitest";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

import { scheduleDraftDelete } from "@/components/procurement/order-screen/schedule-draft-delete";

type Captured = { action: { onClick: () => void }; onAutoClose: () => void; onDismiss: () => void };

function capture() {
  let options: Captured | null = null;
  const showToast = vi.fn((_message: string, opts: Captured) => { options = opts; });
  return { showToast, get: () => options as unknown as Captured };
}

describe("deleting a draft with undo", () => {
  it("deletes only once the undo window closes", () => {
    const deleteFn = vi.fn(() => Promise.resolve());
    const toast = capture();
    scheduleDraftDelete("po1", { onUndo: vi.fn(), deleteFn, showToast: toast.showToast });

    expect(deleteFn).not.toHaveBeenCalled();
    toast.get().onAutoClose();
    toast.get().onDismiss();
    expect(deleteFn).toHaveBeenCalledTimes(1);
    expect(deleteFn).toHaveBeenCalledWith("po1");
  });

  it("keeps the draft when Undo is pressed, even though the toast then closes", () => {
    const deleteFn = vi.fn(() => Promise.resolve());
    const onUndo = vi.fn();
    const toast = capture();
    scheduleDraftDelete("po1", { onUndo, deleteFn, showToast: toast.showToast });

    toast.get().action.onClick();
    toast.get().onDismiss();

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(deleteFn).not.toHaveBeenCalled();
  });

  it("deletes when the toast is swiped away before it times out", () => {
    const deleteFn = vi.fn(() => Promise.resolve());
    const toast = capture();
    scheduleDraftDelete("po1", { onUndo: vi.fn(), deleteFn, showToast: toast.showToast });
    toast.get().onDismiss();
    expect(deleteFn).toHaveBeenCalledTimes(1);
  });
});
