"use client";

import { useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  requestAdminTillSession,
  TILL_CODE_LENGTH,
  UNIFORM_REJECTION,
  OFFLINE_MESSAGE,
} from "@/lib/api/admin-till-session";
import { startTillInspectionSession } from "@/lib/utils/till-inspection";
import { clearImpersonatedSession } from "@/lib/utils/impersonation";

interface Props {
  /** Called once a session is live. The caller decides what happens next —
   * the lock screen navigates, the blocked licence card re-renders in place. */
  onSuccess: () => void;
  onCancel?: () => void;
}

/**
 * The on-till admin entry, shared by the lock screen and the blocked licence
 * card. It deliberately does not navigate: a router push from the licence card
 * only re-renders the card, because LicenseGuard returns it instead of its
 * children while the device is blocked.
 */
export function AdminTillLogin({ onSuccess, onCancel }: Props) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!navigator.onLine) {
      setError(OFFLINE_MESSAGE);
      return;
    }

    setIsLoading(true);
    const session = await requestAdminTillSession(email, code).catch(() => null);
    setIsLoading(false);

    if (!session) {
      setError(UNIFORM_REJECTION);
      setCode("");
      return;
    }

    clearImpersonatedSession();
    startTillInspectionSession(session);
    onSuccess();
  };

  return (
    <form onSubmit={submit} className="space-y-3 text-left">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
        <ShieldAlert className="h-3 w-3" />
        Admin access
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="admin-till-email" className="text-sm font-medium">
          Admin email
        </Label>
        <Input
          id="admin-till-email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@dumosrx.com"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="admin-till-code" className="text-sm font-medium">
          Till access code
        </Label>
        <Input
          id="admin-till-code"
          type="password"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={TILL_CODE_LENGTH}
          value={code}
          onChange={(event) =>
            setCode(event.target.value.replace(/\D/g, "").slice(0, TILL_CODE_LENGTH))
          }
          placeholder="12-digit code"
          className="text-center tracking-[0.3em] font-mono"
        />
      </div>

      {error && <p className="text-sm text-destructive font-medium">{error}</p>}

      <p className="text-xs text-muted-foreground">
        Read-only. Needs an internet connection.
      </p>

      <div className="flex gap-2">
        <Button
          type="submit"
          className="flex-1"
          disabled={isLoading || !email || code.length !== TILL_CODE_LENGTH}
        >
          {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Sign in
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
