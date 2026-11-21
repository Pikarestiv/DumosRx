"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { discardAllUnsavedEdits, hasUnsavedEdits, urlWhereEditsAreUnsaved } from "@/lib/hooks/use-unsaved-edit";

function internalLinkTarget(event: MouseEvent): string | null {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!link || link.target === "_blank" || link.hasAttribute("download")) return null;
  const url = new URL(link.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  if (url.pathname === window.location.pathname && url.search === window.location.search) return null;
  return url.pathname + url.search + url.hash;
}

type PendingExit = { kind: "link"; href: string } | { kind: "back" };

export function UnsavedEditsGuard() {
  const router = useRouter();
  const [pending, setPending] = useState<PendingExit | null>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!hasUnsavedEdits()) return;
      const href = internalLinkTarget(event);
      if (!href) return;
      event.preventDefault();
      event.stopPropagation();
      setPending({ kind: "link", href });
    };
    const onPopState = (event: PopStateEvent) => {
      if (!hasUnsavedEdits()) return;
      event.stopImmediatePropagation();
      window.history.pushState(window.history.state, "", urlWhereEditsAreUnsaved());
      setPending({ kind: "back" });
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState, true);
    };
  }, []);

  const leave = () => {
    const exit = pending;
    setPending(null);
    discardAllUnsavedEdits();
    if (exit?.kind === "link") router.push(exit.href);
    if (exit?.kind === "back") window.history.back();
  };

  return (
    <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>You have a change that isn&apos;t saved</AlertDialogTitle>
          <AlertDialogDescription>
            A value you edited in the catalog hasn&apos;t been saved. Stay to save it with the tick, or leave and lose it.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Stay</AlertDialogCancel>
          <AlertDialogAction onClick={leave}>Leave without saving</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
