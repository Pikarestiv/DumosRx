"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { webApiClient } from "@/lib/api/client";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");
    const email = searchParams.get("email");

    if (!token || !email) {
      setStatus("error");
      setErrorMessage("Invalid verification link. Missing token or email.");
      return;
    }

    const verify = async () => {
      try {
        const res = await webApiClient.request("verify-email", {
          method: "POST",
          body: JSON.stringify({ token, email }),
        });
        
        setStatus("success");
        toast.success((res as any).message || "Email verified successfully!");
        
        // Short delay before redirecting to dashboard
        setTimeout(() => {
          router.push("/dashboard");
        }, 3000);
      } catch (err: any) {
        setStatus("error");
        setErrorMessage(err.message || "Failed to verify email. The link may have expired.");
      }
    };

    verify();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-800 p-8 text-center space-y-6">
        <div className="flex justify-center">
          {status === "loading" && (
            <div className="bg-indigo-50 dark:bg-indigo-900/30 p-4 rounded-full">
              <Loader2 className="h-10 w-10 text-indigo-600 dark:text-indigo-400 animate-spin" />
            </div>
          )}
          {status === "success" && (
            <div className="bg-emerald-50 dark:bg-emerald-900/30 p-4 rounded-full">
              <CheckCircle2 className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
            </div>
          )}
          {status === "error" && (
            <div className="bg-red-50 dark:bg-red-900/30 p-4 rounded-full">
              <XCircle className="h-10 w-10 text-red-600 dark:text-red-400" />
            </div>
          )}
        </div>

        <div>
          <h2 className="text-2xl font-bold tracking-tight mb-2">
            {status === "loading" && "Verifying your email..."}
            {status === "success" && "Email Verified!"}
            {status === "error" && "Verification Failed"}
          </h2>
          <p className="text-muted-foreground">
            {status === "loading" && "Please wait while we confirm your email address."}
            {status === "success" && "Your email has been successfully verified. Redirecting you to your dashboard..."}
            {status === "error" && errorMessage}
          </p>
        </div>

        {status === "error" && (
          <div className="pt-4 flex flex-col gap-3">
            <Button asChild className="w-full bg-indigo-600 hover:bg-indigo-700">
              <Link href="/dashboard">Return to Dashboard</Link>
            </Button>
            <p className="text-sm text-muted-foreground">
              You can request a new verification link from your dashboard.
            </p>
          </div>
        )}

        {status === "success" && (
          <div className="pt-4">
            <Button asChild variant="outline" className="w-full">
              <Link href="/dashboard">Go to Dashboard Now</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
