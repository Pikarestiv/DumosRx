import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Download, LayoutDashboard, Settings } from "lucide-react";
import { SubscriptionWrapper } from "@/components/dashboard/subscription-wrapper";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <header className="border-b bg-background">
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
      <main className="container py-12 space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Manage your pharmacy subscription and downloads.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {/* Subscription Module */}
          <SubscriptionWrapper />

          {/* Download Module */}
          <Card>
            <CardHeader>
              <CardTitle>Download App</CardTitle>
              <CardDescription>
                Get the latest version for your OS.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button className="w-full flex justify-between" variant="outline">
                <span>macOS (Apple Silicon)</span>
                <Download className="h-4 w-4" />
              </Button>
              <Button className="w-full flex justify-between" variant="outline">
                <span>Windows (x64)</span>
                <Download className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>

          {/* Quick Stats Module - Placeholder */}
          <Card>
            <CardHeader>
              <CardTitle>Pharmacy Status</CardTitle>
              <CardDescription>Quick overview of your shop.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">Online</div>
              <p className="text-xs text-muted-foreground">
                Last sync: Just now
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
