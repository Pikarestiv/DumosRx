import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { RegisterForm } from "@/components/auth/register-form";
import { Suspense } from "react";

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-gray-50 dark:bg-gray-900">
      <div className="w-full max-w-md space-y-8 mb-8">
        <div className="flex flex-col items-center">
          <Link href="/" className="flex items-center space-x-2 mb-4">
            <ShieldCheck className="h-10 w-10 text-primary" />
            <span className="text-2xl font-bold">DumosRx</span>
          </Link>
          <h2 className="text-center text-3xl font-bold tracking-tight">
            Create your account
          </h2>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Join the pharmacy management revolution
          </p>
        </div>

        <Suspense fallback={<div>Loading...</div>}>
          <RegisterForm />
        </Suspense>
      </div>

      <div className="text-center text-xs text-muted-foreground">
        By clicking "Create Account", you agree to our{" "}
        <Link href="#" className="underline hover:text-primary">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="#" className="underline hover:text-primary">
          Privacy Policy
        </Link>
        .
      </div>
    </div>
  );
}
