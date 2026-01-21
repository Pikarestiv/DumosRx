import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";
import { Suspense } from "react";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-gray-50 dark:bg-gray-900">
      <div className="w-full max-w-md space-y-8 mb-8">
        <div className="flex flex-col items-center">
          <Link href="/" className="flex items-center space-x-2 mb-4">
            <ShieldCheck className="h-10 w-10 text-primary" />
            <span className="text-2xl font-bold">DumosRx</span>
          </Link>
          <h2 className="text-center text-3xl font-bold tracking-tight">
            Sign in to your account
          </h2>
        </div>

        <Suspense fallback={<div>Loading...</div>}>
          <LoginForm />
        </Suspense>
      </div>

      <div className="text-center text-xs text-muted-foreground">
        <Link href="/" className="underline hover:text-primary">
          Back to Home
        </Link>
      </div>
    </div>
  );
}
