import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HelpPage } from "@/components/help/help-page";
import { GUIDES_URL } from "@/lib/constants";
import { useAssistantPanel } from "@/lib/store/use-assistant-panel";
import { toast } from "sonner";

const mockMutate = vi.fn();

vi.mock("@/lib/context/auth-context", () => ({
  useAuth: () => ({
    user: { id: "user-123", username: "ada_pharmacy" },
  }),
}));

vi.mock("@/lib/hooks/use-submit-feedback-mutation", () => ({
  useSubmitFeedbackMutation: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe("HelpPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the help hub and all main resource sections", () => {
    render(<HelpPage />);

    expect(screen.getByRole("heading", { name: /Help & Support Hub/i })).toBeTruthy();
    expect(screen.getByText(/Step-by-Step Feature Walkthroughs & Videos/i)).toBeTruthy();
    expect(screen.getByText(/Ask Dumos Assistant/i)).toBeTruthy();
    expect(screen.getByText(/Account Manager & CRM/i)).toBeTruthy();
    expect(screen.getByText(/Send Feedback or Report an Issue/i)).toBeTruthy();
  });

  it("opens the video tutorials knowledgebase in a new browser tab", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    render(<HelpPage />);

    const watchButton = screen.getByRole("button", { name: /Watch Video Guides/i });
    fireEvent.click(watchButton);

    expect(openSpy).toHaveBeenCalledWith(GUIDES_URL, "_blank", "noopener,noreferrer");
    openSpy.mockRestore();
  });

  it("launches the offline assistant panel when requested", () => {
    const assistantOpenSpy = vi.spyOn(useAssistantPanel.getState(), "open");

    render(<HelpPage />);

    const launchButton = screen.getByRole("button", { name: /Launch Assistant/i });
    fireEvent.click(launchButton);

    expect(assistantOpenSpy).toHaveBeenCalled();
  });

  it("validates feedback content before submission", () => {
    render(<HelpPage />);

    const submitButton = screen.getByRole("button", { name: /Submit Feedback/i });
    fireEvent.click(submitButton);

    expect(toast.error).toHaveBeenCalledWith("Please provide some feedback details");
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it("submits valid feedback with user details", () => {
    render(<HelpPage />);

    const textarea = screen.getByPlaceholderText(/Tell us what happened/i);
    fireEvent.change(textarea, { target: { value: "The new spot sourcing feature is awesome!" } });

    const submitButton = screen.getByRole("button", { name: /Submit Feedback/i });
    fireEvent.click(submitButton);

    expect(mockMutate).toHaveBeenCalledWith(
      {
        userId: "user-123",
        type: "bug",
        content: "The new spot sourcing feature is awesome!",
        email: "Ada_pharmacy",
      },
      expect.any(Object),
    );
  });
});
