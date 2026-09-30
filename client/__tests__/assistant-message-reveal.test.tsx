import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, act } from "@testing-library/react";
import type { AssistantMessage } from "@/lib/assistant/types";
import { getUserInitials } from "@/lib/utils";
import { AssistantMessageList } from "@/components/assistant/assistant-message-list";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => React.createElement("a", { href, ...rest }, children),
}));

const REPLY_TEXT = "Make a sale: Open POS and scan the item";

function assistantMessage(
  overrides: Partial<AssistantMessage> = {},
): AssistantMessage {
  return {
    id: "m1",
    role: "assistant",
    text: REPLY_TEXT,
    actions: [{ label: "Make a sale", href: "/pos" }],
    at: new Date().toISOString(),
    ...overrides,
  };
}

describe("assistant message reveal", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("puts the whole reply in the DOM before the reveal finishes", () => {
    const { rerender } = render(
      <AssistantMessageList
        messages={[]}
        isThinking
        userInitials="JD"
        onActionClick={() => {}}
      />,
    );

    rerender(
      <AssistantMessageList
        messages={[assistantMessage()]}
        isThinking={false}
        userInitials="JD"
        onActionClick={() => {}}
      />,
    );

    const paragraphs = Array.from(document.querySelectorAll("p"));
    expect(paragraphs.map((p) => p.textContent)).toEqual([REPLY_TEXT]);
    expect(screen.queryByRole("link", { name: "Make a sale" })).toBeNull();
    expect(
      document.querySelectorAll('[data-revealed="false"]').length,
    ).toBeGreaterThan(0);
  });

  it("reveals every word and then the actions", () => {
    const { rerender } = render(
      <AssistantMessageList
        messages={[]}
        isThinking
        userInitials="JD"
        onActionClick={() => {}}
      />,
    );
    rerender(
      <AssistantMessageList
        messages={[assistantMessage()]}
        isThinking={false}
        userInitials="JD"
        onActionClick={() => {}}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(document.querySelectorAll('[data-revealed="false"]').length).toBe(0);
    expect(screen.getByText(REPLY_TEXT)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Make a sale" }).getAttribute("href"),
    ).toBe("/pos");
    expect(document.querySelectorAll("p").length).toBe(1);
  });

  it("settles into a single plain paragraph once the reveal finishes", () => {
    const { rerender } = render(
      <AssistantMessageList
        messages={[]}
        isThinking
        userInitials="JD"
        onActionClick={() => {}}
      />,
    );
    rerender(
      <AssistantMessageList
        messages={[assistantMessage()]}
        isThinking={false}
        userInitials="JD"
        onActionClick={() => {}}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(screen.getAllByText(REPLY_TEXT)).toHaveLength(1);
    expect(document.querySelectorAll("[data-revealed]").length).toBe(0);
    const hiddenReplyText = Array.from(
      document.querySelectorAll('[aria-hidden="true"]'),
    ).some((node) => node.textContent?.includes(REPLY_TEXT));
    expect(hiddenReplyText).toBe(false);
  });

  it("caps a long reply's reveal at the budget by revealing several words per tick", () => {
    const longText = Array.from({ length: 300 }, (_, i) => `word${i}`).join(
      " ",
    );
    const { rerender } = render(
      <AssistantMessageList
        messages={[]}
        isThinking
        userInitials="JD"
        onActionClick={() => {}}
      />,
    );
    rerender(
      <AssistantMessageList
        messages={[assistantMessage({ text: longText })]}
        isThinking={false}
        userInitials="JD"
        onActionClick={() => {}}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(document.querySelectorAll('[data-revealed="false"]').length).toBe(0);
  });

  it("does not hide messages that were already on screen, or the user's own message", () => {
    render(
      <AssistantMessageList
        messages={[
          {
            id: "old",
            role: "assistant",
            text: "Earlier reply",
            at: new Date().toISOString(),
          },
        ]}
        isThinking={false}
        userInitials="JD"
        onActionClick={() => {}}
      />,
    );

    expect(document.querySelectorAll('[data-revealed="false"]').length).toBe(0);
  });

  it("renders a new reply fully revealed when the OS asks for reduced motion", () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;

    try {
      const { rerender } = render(
        <AssistantMessageList
          messages={[]}
          isThinking
          userInitials="JD"
          onActionClick={() => {}}
        />,
      );
      rerender(
        <AssistantMessageList
          messages={[assistantMessage()]}
          isThinking={false}
          userInitials="JD"
          onActionClick={() => {}}
        />,
      );

      expect(document.querySelectorAll('[data-revealed="false"]').length).toBe(
        0,
      );
      expect(document.querySelectorAll("[data-revealed]").length).toBe(0);
      expect(screen.getByText(REPLY_TEXT)).toBeTruthy();
      expect(
        screen.getByRole("link", { name: "Make a sale" }).getAttribute("href"),
      ).toBe("/pos");
    } finally {
      window.matchMedia = original;
    }
  });

  it("shows a user message immediately even though it is new", () => {
    const { rerender } = render(
      <AssistantMessageList
        messages={[]}
        isThinking={false}
        userInitials="JD"
        onActionClick={() => {}}
      />,
    );
    rerender(
      <AssistantMessageList
        messages={[
          {
            id: "u1",
            role: "user",
            text: "how do i make a sale",
            at: new Date().toISOString(),
          },
        ]}
        isThinking={false}
        userInitials="JD"
        onActionClick={() => {}}
      />,
    );

    expect(document.querySelectorAll('[data-revealed="false"]').length).toBe(0);
  });
});

describe("assistant message avatars", () => {
  const userMessage: AssistantMessage = {
    id: "u1",
    role: "user",
    text: "how do i make a sale",
    at: new Date().toISOString(),
  };

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("renders the signed-in user's initials beside their own message", () => {
    render(
      <AssistantMessageList
        messages={[userMessage]}
        isThinking={false}
        userInitials="JD"
        onActionClick={() => {}}
      />,
    );

    expect(screen.getByText("JD")).toBeTruthy();
    expect(document.querySelectorAll("svg").length).toBe(0);
  });

  it("leaves the assistant's own sparkles avatar in place", () => {
    render(
      <AssistantMessageList
        messages={[assistantMessage()]}
        isThinking={false}
        userInitials="JD"
        onActionClick={() => {}}
      />,
    );

    expect(document.querySelectorAll("svg").length).toBe(1);
    expect(screen.queryByText("JD")).toBeNull();
  });

  it("falls back to the default initial when the name is missing", () => {
    render(
      <AssistantMessageList
        messages={[userMessage]}
        isThinking={false}
        userInitials={getUserInitials(undefined, undefined)}
        onActionClick={() => {}}
      />,
    );

    expect(screen.getByText("U")).toBeTruthy();
  });

  it("uses a single initial when only one name part is known", () => {
    render(
      <AssistantMessageList
        messages={[userMessage]}
        isThinking={false}
        userInitials={getUserInitials("Ada", "")}
        onActionClick={() => {}}
      />,
    );

    expect(screen.getByText("A")).toBeTruthy();
  });
});
