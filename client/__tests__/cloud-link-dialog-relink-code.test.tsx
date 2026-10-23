import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

const { linkWithRelinkCode, linkCloudAccount, toastError, toastSuccess } = vi.hoisted(() => ({
  linkWithRelinkCode: vi.fn(),
  linkCloudAccount: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/lib/context/auth-context", () => ({ useAuth: () => ({ linkWithRelinkCode, linkCloudAccount }) }));
vi.mock("@/lib/context/store-context", () => ({ useStore: () => ({ storeProfile: null }) }));
vi.mock("sonner", () => ({ toast: { error: toastError, success: toastSuccess } }));

import { CloudLinkDialog } from "@/components/settings/cloud-link-dialog";

function renderDialog() {
  const onOpenChange = vi.fn();
  const onSuccess = vi.fn();
  render(<CloudLinkDialog open onOpenChange={onOpenChange} onSuccess={onSuccess} />);
  fireEvent.click(screen.getByRole("button", { name: "Have a re-link code?" }));
  return { onOpenChange, onSuccess };
}

function submitCode(code: string) {
  fireEvent.change(screen.getByLabelText("Re-link Code"), { target: { value: code } });
  fireEvent.click(screen.getByRole("button", { name: "Re-link Till" }));
}

describe("CloudLinkDialog re-link code path", () => {
  beforeEach(() => vi.clearAllMocks());

  it("links with an uppercased code, closes, and runs the post-link callback", async () => {
    linkWithRelinkCode.mockResolvedValue({ success: true, message: "Till re-linked" });
    const { onOpenChange, onSuccess } = renderDialog();

    submitCode("abcd 2345");

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(linkWithRelinkCode).toHaveBeenCalledWith("ABCD2345");
    expect(linkCloudAccount).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith("Till re-linked");
  });

  it("shows the server's error inline and stays open", async () => {
    linkWithRelinkCode.mockResolvedValue({ success: false, message: "Invalid or expired code." });
    const { onOpenChange } = renderDialog();

    submitCode("ZZZZZZZZ");

    expect((await screen.findByRole("alert")).textContent).toContain("Invalid or expired code.");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("refuses a code of the wrong length without calling the server", () => {
    renderDialog();

    submitCode("ABC");

    expect((screen.getByRole("alert")).textContent).toContain("8-character");
    expect(linkWithRelinkCode).not.toHaveBeenCalled();
  });
});
