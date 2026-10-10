"use client";

import { useState } from "react";
import { Eye, EyeOff, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminAuthStore, checkIsSuperAdmin } from "@/lib/store/use-admin-auth-store";
import { useAllTillCodes } from "@/lib/api/admin-hooks-till-codes";

const CARD =
  "bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm";

function formatDate(iso: string | null): string {
  if (!iso) return "never";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleDateString("en-GB");
}

export function AllTillCodesCard() {
  const role = useAdminAuthStore((state) => state.user?.role);
  const [revealed, setRevealed] = useState(false);
  const { data, isLoading, error } = useAllTillCodes(revealed);

  if (!checkIsSuperAdmin(role)) return null;

  const codes = data?.codes ?? [];

  return (
    <div className={`${CARD} p-6 space-y-6`}>
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-primary" />
          Every admin&apos;s till access code
        </h2>
        <p className="text-sm text-muted-foreground max-w-prose">
          Super admins only. Each reveal is written to the platform activity log
          with your name, the codes shown and their owners. Codes issued before
          this existed cannot be recovered and read as unavailable.
        </p>
      </div>

      <Button variant="outline" onClick={() => setRevealed(!revealed)}>
        {isLoading ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : revealed ? (
          <EyeOff className="h-4 w-4 mr-2" />
        ) : (
          <Eye className="h-4 w-4 mr-2" />
        )}
        {revealed ? "Hide codes" : "Reveal codes"}
      </Button>

      {error instanceof Error && (
        <p className="text-sm font-medium text-destructive" role="alert">
          {error.message}
        </p>
      )}

      {revealed && !isLoading && (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {codes.length === 0 && (
            <p className="py-3 text-sm text-muted-foreground">
              No active codes on the platform.
            </p>
          )}
          {codes.map((entry) => (
            <div
              key={entry.id}
              className="flex flex-wrap items-center justify-between gap-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {entry.admin_name || entry.admin_email || "Unknown admin"}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {entry.admin_email} · {entry.label || "Unlabelled"} · Created{" "}
                  {formatDate(entry.created_at)} · Last used{" "}
                  {formatDate(entry.last_used_at)}
                </p>
              </div>
              {entry.code ? (
                <p className="font-mono text-lg tracking-[0.15em] select-all">
                  {entry.code}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Unavailable</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
