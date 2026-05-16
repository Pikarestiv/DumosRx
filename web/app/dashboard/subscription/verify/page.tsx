"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVerifyPaymentMutation } from "@/lib/api/hooks";
import { toast } from "sonner";

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const verifyPayment = useVerifyPaymentMutation();
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [message, setMessage] = useState("We are verifying your payment with the provider. Please do not close this window.");

  const reference = searchParams.get("reference") || searchParams.get("tx_ref") || searchParams.get("trs_ref");

  useEffect(() => {
    if (reference) {
      handleVerify();
    } else {
      setStatus("error");
      setMessage("No transaction reference found. If you believe this is an error, please contact support.");
    }
  }, [reference]);

  const handleVerify = async () => {
    try {
      const response = await verifyPayment.mutateAsync(reference!);
      if (response.success) {
        setStatus("success");
        setMessage("Your subscription has been activated successfully! You now have access to all Pro features.");
        toast.success("Subscription Activated!");
      } else {
        setStatus("error");
        setMessage(response.message || "Payment verification failed. Please contact support.");
      }
    } catch (error: any) {
      setStatus("error");
      setMessage(error.message || "An unexpected error occurred during verification.");
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-none shadow-2xl animate-in fade-in zoom-in duration-500">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            {status === "verifying" && <Loader2 className="h-12 w-12 text-indigo-600 animate-spin" />}
            {status === "success" && <CheckCircle2 className="h-12 w-12 text-emerald-500" />}
            {status === "error" && <XCircle className="h-12 w-12 text-rose-500" />}
          </div>
          <CardTitle className="text-2xl font-black">
            {status === "verifying" && "Verifying Payment"}
            {status === "success" && "Subscription Active!"}
            {status === "error" && "Verification Failed"}
          </CardTitle>
          <CardDescription className="mt-2 text-slate-500 font-medium leading-relaxed">
            {message}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center pb-8">
          {status !== "verifying" && (
            <Button 
              className="bg-indigo-600 hover:bg-indigo-700 font-bold px-8 h-12 rounded-2xl transition-all hover:scale-105 active:scale-95"
              onClick={() => router.push("/dashboard/billing")}
            >
              Return to Billing
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function VerifyPaymentPage() {
  return (
    <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
    }>
      <VerifyContent />
    </Suspense>
  );
}
