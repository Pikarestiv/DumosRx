"use client";

import { formatDistanceToNowStrict } from "date-fns";
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
import type { RecentDraft } from "@/lib/db/queries/procurement-draft-status";

interface PoResumeDraftPromptProps {
  draft: RecentDraft;
  onContinue: () => void;
  onStartNew: () => void;
}

export function PoResumeDraftPrompt({ draft, onContinue, onStartNew }: PoResumeDraftPromptProps) {
  const count = Number(draft.item_count);
  const age = formatDistanceToNowStrict(new Date(draft.updated_at), { addSuffix: true });
  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Continue your last order?</AlertDialogTitle>
          <AlertDialogDescription>
            {`Continue order from ${draft.vendor_name} (${count} ${count === 1 ? "item" : "items"}, ${age})?`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onStartNew}>Start new</AlertDialogCancel>
          <AlertDialogAction onClick={onContinue}>Continue</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
