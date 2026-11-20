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
import { discardAllUnsavedEdits, hasUnsavedEdits } from "@/lib/hooks/use-unsaved-edit";

function internalLinkTarget(event: MouseEvent): string | null {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!link || link.target === "_blank" || link.hasAttribute("download")) return null;
  const url = new URL(link.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  if (url.pathname === window.location.pathname && url.search === window.location.search) return null;
  return url.pathname + url.search + url.hash;
}

export function UnsavedEditsGuard() {
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!hasUnsavedEdits()) return;
      const href = internalLinkTarget(event);
      if (!href) return;
      event.preventDefault();
      event.stopPropagation();
      setPendingHref(href);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  const leave = () => {
    const href = pendingHref;
    setPendingHref(null);
    discardAllUnsavedEdits();
    if (href) router.push(href);
  };

  return (
    <AlertDialog open={pendingHref !== null} onOpenChange={(open) => !open && setPendingHref(null)}>
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
