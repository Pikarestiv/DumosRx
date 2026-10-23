"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/context/auth-context";
import { useStore } from "@/lib/context/store-context";
import { toast } from "sonner";
import { Cloud, Loader2, AlertTriangle } from "lucide-react";
import { WEB_APP_URL } from "@/lib/constants";
import { RelinkCodeField, RELINK_CODE_LENGTH, normalizeRelinkCode } from "./relink-code-field";

interface CloudLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CloudLinkDialog({ open, onOpenChange, onSuccess }: CloudLinkDialogProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [useCode, setUseCode] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const { linkCloudAccount, linkWithRelinkCode } = useAuth();
  const { storeProfile } = useStore();

  useEffect(() => {
    if (open && storeProfile?.email && !email) {
      setEmail(storeProfile.email);
    }
  }, [open, storeProfile?.email, email]);

  const submitLink = () => {
    if (useCode) {
      return linkWithRelinkCode(normalizeRelinkCode(code));
    }
    return linkCloudAccount(email.trim().toLowerCase(), password);
  };

  const handleLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (useCode && normalizeRelinkCode(code).length !== RELINK_CODE_LENGTH) {
      setCodeError(`Enter the ${RELINK_CODE_LENGTH}-character code from the owner`);
      return;
    }
    if (!useCode && (!email || !password)) {
      toast.error("Please enter both email and password");
      return;
    }

    setIsLoading(true);
    setCodeError(null);
    try {
      const result = await submitLink();
      if (result.success) {
        toast.success(result.message);
        setEmail("");
        setPassword("");
        setCode("");
        onOpenChange(false);
        if (onSuccess) onSuccess();
      } else {
        if (useCode) setCodeError(result.message);
        toast.error(result.message);
      }
    } catch (_error) {
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={(e) => void handleLink(e)}>
          <DialogHeader>
            <div className="mx-auto w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4">
              <Cloud className="w-6 h-6" />
            </div>
            <DialogTitle className="text-center">Link DumosRx Cloud</DialogTitle>
            <DialogDescription className="text-center">
              {useCode
                ? "Enter the re-link code the store owner generated in Settings > Account > Sessions & Devices."
                : "Enter your online account credentials to enable automatic cloud backup and synchronization."}
            </DialogDescription>
          </DialogHeader>
          {useCode && (
            <RelinkCodeField
              value={code}
              error={codeError}
              disabled={isLoading}
              onChange={(value) => {
                setCode(value);
                setCodeError(null);
              }}
            />
          )}
          <div className={useCode ? "hidden" : "grid gap-4 py-4"}>
            <div className="grid gap-2">
              <Label htmlFor="cloud-email">Cloud Email</Label>
              <Input
                id="cloud-email"
                className="lowercase"
                type="email"
                placeholder="admin@store.com"
                value={email}
                onChange={(e) => setEmail(e.target.value.toLowerCase())}
                disabled={isLoading}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cloud-password">Cloud Password</Label>
              <Input
                id="cloud-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>
            {storeProfile?.email && email && email.toLowerCase() !== storeProfile.email.toLowerCase() && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-md text-xs">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <p>
                  <strong>Warning:</strong> You are linking an email that differs from your store profile ({storeProfile.email}).
                  Syncing to a different cloud account could overwrite data if the accounts belong to different stores.
                </p>
              </div>
            )}
          </div>
          <div className="text-center pb-2 space-y-1">
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => {
                setUseCode(!useCode);
                setCodeError(null);
              }}
              disabled={isLoading}
            >
              {useCode ? "Use email and password instead" : "Have a re-link code?"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Don't have a web dashboard account yet?{" "}
              <a
                href={`${WEB_APP_URL}/register`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary font-bold hover:underline"
              >
                Create one here
              </a>
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLoading ? "Connecting..." : useCode ? "Re-link Till" : "Link Account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
