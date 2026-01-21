import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-gray-50 dark:bg-gray-900">
      <div className="w-full max-w-md space-y-8 text-center">
        <Link href="/" className="inline-flex items-center space-x-2 mb-4">
          <ShieldCheck className="h-10 w-10 text-primary" />
          <span className="text-2xl font-bold">DumosRx</span>
        </Link>
        <h2 className="text-3xl font-bold">Login</h2>
        <p className="text-muted-foreground">
          This is a placeholder for the login page.
        </p>
        <div className="p-4 bg-yellow-100 text-yellow-800 rounded-md">
          Registration success! You would effectively be logged in here.
        </div>
        <Button asChild>
          <Link href="/">Back to Home</Link>
        </Button>
      </div>
    </div>
  );
}
