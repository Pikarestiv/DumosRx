import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <ShieldCheck className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold">DumosRx</span>
          </Link>
          <div className="flex items-center gap-4">
            <Button variant="ghost" asChild>
              <Link href="/login">Logout</Link>
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1 container py-12">
        <h1 className="text-3xl font-bold mb-4">Dashboard</h1>
        <div className="p-6 border rounded-lg bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900">
          <h2 className="text-xl font-semibold text-green-800 dark:text-green-300 mb-2">
            Login Successful!
          </h2>
          <p className="text-green-700 dark:text-green-400">
            You have successfully authenticated with the Laravel backend. This
            area would typically contain subscription management or download
            links.
          </p>
        </div>
      </main>
    </div>
  );
}
