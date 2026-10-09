"use client";

import { useState } from "react";
import { KeyRound, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useMyTillCodes,
  useIssueTillCodeMutation,
  useRevokeTillCodeMutation,
  MAX_ACTIVE_TILL_CODES,
  type AdminTillCode,
} from "@/lib/api/admin-hooks-till-codes";

const CARD =
  "bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm";

function formatDate(iso: string | null): string {
  if (!iso) return "never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleDateString("en-GB");
}

export function TillCodesCard() {
  const { data, isLoading } = useMyTillCodes();
  const issue = useIssueTillCodeMutation();
  const revoke = useRevokeTillCodeMutation();

  const [label, setLabel] = useState("");
  const [issuedCode, setIssuedCode] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<AdminTillCode | null>(null);

  const codes = data?.codes ?? [];
  const atLimit = codes.length >= MAX_ACTIVE_TILL_CODES;

  // issue.reset() too: the mutation keeps its result in observer state (and
  // React Query devtools) after the dialog closes, so clearing only our own
  // copy would leave the code readable for the life of the page.
  const dismissCode = () => {
    setIssuedCode(null);
    issue.reset();
  };

  const handleIssue = async () => {
    const result = await issue.mutateAsync(label.trim() || null);
    setIssuedCode(result.code);
    setLabel("");
  };

  return (
    <div className={`${CARD} p-6 space-y-6`}>
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" />
          Till access codes
        </h2>
        <p className="text-sm text-muted-foreground max-w-prose">
          A till access code signs you in to a store&apos;s own till for
          read-only inspection. It is not your password, and it cannot be used
          anywhere in this panel.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="till-code-label" className="text-sm font-medium">
            Label (optional)
          </Label>
          <Input
            id="till-code-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="e.g. Agidi branch"
            maxLength={64}
            className="w-56"
          />
        </div>
        <Button onClick={() => void handleIssue()} disabled={atLimit || issue.isPending}>
          {issue.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Plus className="h-4 w-4 mr-2" />
          )}
          Generate code
        </Button>
      </div>

      {atLimit && (
        <p className="text-sm text-muted-foreground">
          {MAX_ACTIVE_TILL_CODES} active codes is the maximum. Revoke one to
          generate another.
        </p>
      )}

      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {isLoading && <p className="py-3 text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && codes.length === 0 && (
          <p className="py-3 text-sm text-muted-foreground">
            No active codes. Generate one before visiting a store.
          </p>
        )}
        {codes.map((code) => (
          <div key={code.id} className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {code.label || "Unlabelled"}
              </p>
              <p className="text-xs text-muted-foreground">
                Created {formatDate(code.created_at)} · Last used{" "}
                {formatDate(code.last_used_at)}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setRevoking(code)}>
              Revoke
            </Button>
          </div>
        ))}
      </div>

      <Dialog
        open={!!issuedCode}
        onOpenChange={(open) => {
          if (!open) dismissCode();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your till access code</DialogTitle>
            <DialogDescription>
              Write this down now. It is not shown again and cannot be
              recovered — only replaced.
            </DialogDescription>
          </DialogHeader>
          <p className="text-3xl font-mono font-semibold tracking-[0.2em] text-center py-4 select-all">
            {issuedCode}
          </p>
          <Button variant="outline" onClick={dismissCode}>
            I have written it down
          </Button>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(open) => {
          if (!open) setRevoking(null);
        }}
        title="Revoke this till access code?"
        description={`${
          revoking?.label || "This code"
        } stops working immediately. Any inspection session already open stays open until it ends on its own.`}
        confirmLabel="Revoke"
        onConfirm={async () => {
          if (revoking) await revoke.mutateAsync(revoking.id);
          setRevoking(null);
        }}
      />
    </div>
  );
}
