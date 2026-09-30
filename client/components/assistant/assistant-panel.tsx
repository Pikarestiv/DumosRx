"use client";

import { useCallback, type ReactNode } from "react";
import { X } from "lucide-react";
import { useResolvedMediaQuery } from "@/hooks/use-media-query";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useAssistant } from "@/lib/hooks/use-assistant";
import { useAssistantPanel } from "@/lib/store/use-assistant-panel";
import { AssistantMessageList } from "./assistant-message-list";
import { AssistantComposer } from "./assistant-composer";
import { AssistantSuggestionChips } from "./assistant-suggestion-chips";
import { ASSISTANT_NAME, AssistantBetaTag } from "./assistant-brand";

const PANEL_DESCRIPTION = "Ask how to do something, or ask for a quick number.";
const HEADER_CLASS =
  "flex shrink-0 flex-row items-start justify-between gap-3 space-y-0 bg-primary bg-gradient-to-b from-primary to-primary/85 px-4 py-3 text-left";
const CLOSE_CLASS =
  "rounded-sm p-1 text-primary-foreground opacity-80 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const TITLE_CLASS = "flex items-center gap-2 text-primary-foreground";

function HeaderText({ title, description }: { title: ReactNode; description: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      {title}
      {description}
    </div>
  );
}

export function AssistantPanel() {
  const isOpen = useAssistantPanel((state) => state.isOpen);
  const close = useAssistantPanel((state) => state.close);
  const { messages, isThinking, suggestions, send } = useAssistant();
  const { matches: isDesktop, resolved } = useResolvedMediaQuery("(min-width: 768px)");

  const handleSend = useCallback(
    (text: string) => {
      void Promise.resolve()
        .then(() => send(text))
        .catch(() => undefined);
    },
    [send],
  );

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) close();
    },
    [close],
  );

  if (!resolved) return null;

  const body = (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
        {messages.length === 0 && (
          <AssistantSuggestionChips suggestions={suggestions} onPick={handleSend} />
        )}
        <AssistantMessageList messages={messages} isThinking={isThinking} onActionClick={close} />
      </div>
      <div className="shrink-0">
        <AssistantComposer isThinking={isThinking} onSend={handleSend} />
      </div>
    </>
  );

  if (isDesktop) {
    return (
      <Sheet open={isOpen} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          hideClose
          className="flex w-full flex-col gap-0 overflow-hidden border-l border-border bg-background/95 p-0 shadow-sm backdrop-blur-sm sm:max-w-md"
          style={{
            paddingTop: "var(--tauri-top, 0px)",
            paddingBottom: "var(--tauri-bottom, env(safe-area-inset-bottom, 0px))",
          }}
        >
          <SheetHeader className={HEADER_CLASS}>
            <HeaderText
              title={
                <SheetTitle className={TITLE_CLASS}>
                  {ASSISTANT_NAME}
                  <AssistantBetaTag tone="onPrimary" />
                </SheetTitle>
              }
              description={
                <SheetDescription className="text-primary-foreground/80">
                  {PANEL_DESCRIPTION}
                </SheetDescription>
              }
            />
            <SheetClose className={CLOSE_CLASS}>
              <X className="h-5 w-5" />
              <span className="sr-only">Close</span>
            </SheetClose>
          </SheetHeader>
          {body}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Drawer open={isOpen} onOpenChange={handleOpenChange}>
      <DrawerContent className="flex h-[85vh] flex-col overflow-hidden bg-background/95 p-0 backdrop-blur-sm">
        <DrawerHeader className={HEADER_CLASS}>
          <HeaderText
            title={
              <DrawerTitle className={TITLE_CLASS}>
                {ASSISTANT_NAME}
                <AssistantBetaTag tone="onPrimary" />
              </DrawerTitle>
            }
            description={
              <DrawerDescription className="text-primary-foreground/80">
                {PANEL_DESCRIPTION}
              </DrawerDescription>
            }
          />
          <DrawerClose className={CLOSE_CLASS}>
            <X className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </DrawerClose>
        </DrawerHeader>
        {body}
      </DrawerContent>
    </Drawer>
  );
}
