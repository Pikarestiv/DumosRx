import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Users,
  Pill,
  Activity,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  Menu,
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ModeToggle } from "@/components/mode-toggle";
import { PricingSection } from "@/components/landing/pricing-section";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Navigation */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <ShieldCheck className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold">DumosRx</span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-6">
            <Link
              href="#features"
              className="text-sm font-medium hover:text-primary transition-colors"
            >
              Features
            </Link>
            <Link
              href="#pricing"
              className="text-sm font-medium hover:text-primary transition-colors"
            >
              Pricing
            </Link>
            <Link
              href="#testimonials"
              className="text-sm font-medium hover:text-primary transition-colors"
            >
              Testimonials
            </Link>
            <div className="flex items-center gap-4">
              <Button variant="ghost" asChild>
                <Link href="/login">Log in</Link>
              </Button>
              <Button asChild>
                <Link href="/register">Get Started</Link>
              </Button>
              <ModeToggle />
            </div>
          </nav>

          {/* Mobile Nav */}
          <div className="md:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-6 w-6" />
                </Button>
              </SheetTrigger>
              <SheetContent>
                <div className="flex flex-col gap-4 mt-8">
                  <Link href="#features" className="text-lg font-medium">
                    Features
                  </Link>
                  <Link href="#pricing" className="text-lg font-medium">
                    Pricing
                  </Link>
                  <Link href="#testimonials" className="text-lg font-medium">
                    Testimonials
                  </Link>
                  <hr className="my-4" />
                  <Link href="/login" className="text-lg font-medium">
                    Log in
                  </Link>
                  <Link
                    href="/register"
                    className="text-lg font-medium text-primary"
                  >
                    Get Started
                  </Link>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative py-20 md:py-32 overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-size-[14px_24px]"></div>
          <div className="absolute left-0 right-0 top-0 -z-10 m-auto h-[310px] w-[310px] rounded-full bg-primary/20 opacity-20 blur-[100px]"></div>

          <div className="container flex flex-col items-center text-center space-y-8">
            <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-primary text-primary-foreground hover:bg-primary/80">
              New: Offline Mode Support 🚀
            </div>
            <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight max-w-4xl">
              Modern Pharmacy Management <br className="hidden md:inline" />
              <span className="text-primary">Built for Nigeria</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl">
              Stop fighting with spreadsheets and legacy software. DumosRx
              handles your inventory, sales, and NAFDAC compliance in one
              beautiful platform.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 min-w-[300px]">
              <Button size="lg" className="h-12 px-8 text-lg" asChild>
                <Link href="/register">
                  Start Free Trial <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="h-12 px-8 text-lg">
                View Demo
              </Button>
            </div>
            <div className="pt-8 flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4 text-green-500" /> NAFDAC
                Compliant
              </div>
              <div className="flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4 text-green-500" /> Offline
                First
              </div>
              <div className="flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4 text-green-500" /> Local
                Support
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section
          id="features"
          className="py-20 bg-slate-50 dark:bg-slate-900/50"
        >
          <div className="container space-y-16">
            <div className="text-center space-y-4 max-w-3xl mx-auto">
              <h2 className="text-3xl md:text-4xl font-bold">
                Everything you need to run your pharmacy
              </h2>
              <p className="text-muted-foreground text-lg">
                Built specifically for the unique challenges of Nigerian
                pharmacies, from power outages to regulatory compliance.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              <Card className="bg-background/60 backdrop-blur border-none shadow-md">
                <CardHeader>
                  <Users className="h-12 w-12 text-primary mb-2" />
                  <CardTitle>Customer Loyalty</CardTitle>
                  <CardDescription>
                    Built-in CRM and loyalty points
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  Keep customers coming back with automated birthday discounts,
                  points accumulation, and tier-based rewards.
                </CardContent>
              </Card>

              <Card className="bg-background/60 backdrop-blur border-none shadow-md">
                <CardHeader>
                  <Pill className="h-12 w-12 text-blue-500 mb-2" />
                  <CardTitle>Smart Inventory</CardTitle>
                  <CardDescription>
                    Expiry alerts & reorder levels
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  Never sell expired drugs again. Get automated alerts for low
                  stock and expiring batches. Track drug movement in real-time.
                </CardContent>
              </Card>

              <Card className="bg-background/60 backdrop-blur border-none shadow-md">
                <CardHeader>
                  <Activity className="h-12 w-12 text-green-500 mb-2" />
                  <CardTitle>Business Analytics</CardTitle>
                  <CardDescription>Know your profit daily</CardDescription>
                </CardHeader>
                <CardContent>
                  Visual dashboards showing your top selling drugs, peak hours,
                  and staff performance. Make data-driven decisions.
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <PricingSection />

        {/* CTA Section */}
        <section className="py-20 bg-primary text-primary-foreground">
          <div className="container text-center space-y-8">
            <h2 className="text-3xl md:text-5xl font-bold">
              Ready to modernize your pharmacy?
            </h2>
            <p className="text-xl opacity-90 max-w-2xl mx-auto">
              Join 500+ pharmacies in Nigeria trusting DumosRx. Start your
              14-day free trial today.
            </p>
            <Button
              size="lg"
              variant="secondary"
              className="h-12 px-8 text-lg"
              asChild
            >
              <Link href="/register">Create Account Now</Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="py-12 bg-slate-900 text-slate-400">
        <div className="container grid md:grid-cols-4 gap-8 mb-8">
          <div className="space-y-4">
            <div className="flex items-center space-x-2 text-white">
              <ShieldCheck className="h-6 w-6" />
              <span className="text-lg font-bold">DumosRx</span>
            </div>
            <p className="text-sm">
              The #1 Pharmacy Management System in Nigeria. Compliant, reliable,
              and easy to use.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-white mb-4">Product</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="#" className="hover:text-white">
                  Features
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-white">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-white">
                  Changelog
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-white">
                  Roadmap
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-white mb-4">Company</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="#" className="hover:text-white">
                  About
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-white">
                  Careers
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-white">
                  Blog
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-white">
                  Contact
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-white mb-4">Legal</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="#" className="hover:text-white">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-white">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-white">
                  Cookie Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="container border-t border-slate-800 pt-8 text-center text-sm">
          <p>
            © 2019 - {new Date().getFullYear()} Dumos Technologies. All rights
            reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
