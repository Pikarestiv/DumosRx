"use client";

import { useResendVerificationMutation } from "@/lib/api/hooks";
import { AlertCircle, Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface VerificationBannerProps {
  email: string;
}

export function VerificationBanner({ email }: VerificationBannerProps) {
  const resendMutation = useResendVerificationMutation();

  const handleResend = async () => {
    try {
      await resendMutation.mutateAsync(email);
      toast.success("Verification email sent! Please check your inbox.");
    } catch (error: any) {
      toast.error(error.message || "Failed to resend verification email.");
    }
  };

  return (
    <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/50 px-4 py-3 sm:px-6 lg:px-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-3 text-amber-800 dark:text-amber-200">
          <div className="bg-amber-100 dark:bg-amber-900/60 p-2 rounded-full shrink-0">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="font-medium">Verify Your Email Address</p>
            <p className="text-sm opacity-90 mt-0.5">
              We sent a verification link to <strong>{email}</strong>. Please
              check your <strong>inbox and spam/junk folder</strong>. Some
              features (like downloading the POS app) are restricted until you
              verify.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleResend}
          disabled={resendMutation.isPending}
          className="shrink-0 bg-white dark:bg-slate-900 border-amber-300 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-900/30 text-amber-700 dark:text-amber-300"
        >
          {resendMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Mail className="h-4 w-4 mr-2" />
          )}
          Resend Email
        </Button>
      </div>
    </div>
  );
}
