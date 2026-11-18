"use client";

import { useState } from "react";
import { Loader2, Eye, EyeOff, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminAuthStore } from "@/lib/store/use-admin-auth-store";

interface EmailComposeToolsProps {
  title: string;
  message: string;
  renderPreview: () => Promise<string>;
  sendTest: (email: string) => Promise<unknown>;
}

export function EmailComposeTools({ title, message, renderPreview, sendTest: deliverTest }: EmailComposeToolsProps) {
  const adminEmail = useAdminAuthStore((state) => state.user?.email ?? "");
  const [overriddenTestEmail, setOverriddenTestEmail] = useState<string | null>(null);
  const testEmail = overriddenTestEmail ?? adminEmail;

  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);

  const hasContent = title.trim().length > 0 && message.trim().length > 0;

  const loadPreview = async () => {
    if (!hasContent) {
      toast.error("Add a title and a message first");
      return;
    }
    setIsPreviewLoading(true);
    try {
      setPreviewHtml(await renderPreview());
    } catch (_error) {
      toast.error("Could not render the email preview");
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const sendTest = async () => {
    if (isSendingTest) return;
    if (!hasContent) {
      toast.error("Add a title and a message first");
      return;
    }
    if (!testEmail.trim()) {
      toast.error("Enter an address to send the test to");
      return;
    }
    setIsSendingTest(true);
    try {
      await deliverTest(testEmail.trim());
      toast.success(`Test email sent to ${testEmail.trim()}`);
    } catch (_error) {
      toast.error("Failed to send the test email");
    } finally {
      setIsSendingTest(false);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="rounded-xl font-bold border-slate-200 dark:border-slate-700"
          onClick={() => (previewHtml ? setPreviewHtml(null) : void loadPreview())}
          disabled={isPreviewLoading}
        >
          {isPreviewLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : previewHtml ? (
            <EyeOff className="h-4 w-4 mr-2" />
          ) : (
            <Eye className="h-4 w-4 mr-2" />
          )}
          {previewHtml ? "Hide Preview" : "Preview Email"}
        </Button>
        {previewHtml && (
          <Button
            type="button"
            variant="ghost"
            className="rounded-xl font-bold"
            onClick={() => void loadPreview()}
            disabled={isPreviewLoading}
          >
            Refresh
          </Button>
        )}
      </div>

      {previewHtml && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Exactly what recipients will see
          </p>
          <iframe
            title="Email preview"
            sandbox=""
            srcDoc={previewHtml}
            className="w-full h-[320px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white"
          />
        </div>
      )}

      <div className="space-y-2">
        <Label
          htmlFor="email-test-address"
          className="font-bold text-xs uppercase tracking-widest text-slate-400 pl-1"
        >
          Send a test to
        </Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id="email-test-address"
            type="email"
            placeholder="you@dumosrx.com"
            className="rounded-2xl h-12 border-slate-200 dark:border-slate-700 font-bold flex-1 min-w-[200px] bg-white dark:bg-slate-900"
            value={testEmail}
            onChange={(e) => setOverriddenTestEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void sendTest();
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            className="rounded-xl h-12 font-bold border-slate-200 dark:border-slate-700"
            onClick={() => void sendTest()}
            disabled={isSendingTest}
          >
            {isSendingTest ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            {isSendingTest ? "Sending..." : "Send Test"}
          </Button>
        </div>
        <p className="text-xs font-medium text-slate-400 pl-1">
          Goes to this one address only. Nobody else is emailed.
        </p>
      </div>
    </div>
  );
}
