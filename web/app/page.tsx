"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
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
  Zap,
  Shield,
  Smartphone,
  Globe,
  Database,
  BarChart3,
  Check,
  Plus,
} from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ModeToggle } from "@/components/mode-toggle";
import { PricingSection } from "@/components/landing/pricing-section";
import { Separator } from "@/components/ui/separator";

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("drx_token");
    setIsLoggedIn(!!token);
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Navigation */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="container flex h-20 items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <div className="bg-primary p-1.5 rounded-lg">
              <Pill className="h-6 w-6 text-white" />
            </div>
            <span className="text-2xl font-bold tracking-tight">
              Dumos<span className="text-primary">Rx</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            <Link
              href="#features"
              className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors"
            >
              Features
            </Link>
            <Link
              href="#benefits"
              className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors"
            >
              Benefits
            </Link>
            <Link
              href="#pricing"
              className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors"
            >
              Pricing
            </Link>
            <div className="h-6 w-px bg-border mx-2" />
            <div className="flex items-center gap-4">
              {isLoggedIn ? (
                <Button className="font-semibold shadow-lg shadow-primary/20" asChild>
                  <Link href="/dashboard">Go to Dashboard</Link>
                </Button>
              ) : (
                <>
                  <Button variant="ghost" className="font-semibold" asChild>
                    <Link href="/login">Log in</Link>
                  </Button>
                  <Button
                    className="font-semibold shadow-lg shadow-primary/20"
                    asChild
                  >
                    <Link href="/register">Start Free Trial</Link>
                  </Button>
                </>
              )}
              <ModeToggle />
            </div>
          </nav>

          {/* Mobile Nav */}
          <div className="md:hidden flex items-center gap-4">
            <ModeToggle />
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-6 w-6" />
                </Button>
              </SheetTrigger>
              <SheetContent>
                <div className="flex flex-col gap-6 mt-12">
                  <Link href="#features" className="text-xl font-bold">
                    Features
                  </Link>
                  <Link href="#benefits" className="text-xl font-bold">
                    Benefits
                  </Link>
                  <Link href="#pricing" className="text-xl font-bold">
                    Pricing
                  </Link>
                  <Separator />
                  {isLoggedIn ? (
                    <Button size="lg" className="w-full" asChild>
                      <Link href="/dashboard">Dashboard</Link>
                    </Button>
                  ) : (
                    <>
                      <Button size="lg" className="w-full" asChild>
                        <Link href="/register">Get Started</Link>
                      </Button>
                      <Button
                        size="lg"
                        variant="outline"
                        className="w-full"
                        asChild
                      >
                        <Link href="/login">Log in</Link>
                      </Button>
                    </>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="relative pt-20 pb-32 overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full -z-10 opacity-10 dark:opacity-20 pointer-events-none">
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary rounded-full blur-[120px]" />
            <div className="absolute bottom-[10%] right-[-10%] w-[30%] h-[30%] bg-blue-400 rounded-full blur-[100px]" />
          </div>

          <div className="container px-4 mx-auto text-center">
            <div className="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium leading-5 text-primary ring-1 ring-inset ring-primary/20 bg-primary/5 mb-8">
              <span>Trusted by 500+ Nigerian Pharmacies</span>
              <ArrowRight className="ml-1 h-4 w-4" />
            </div>
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6 bg-clip-text text-transparent bg-linear-to-b from-foreground to-foreground/70">
              The Intelligent Way to <br className="hidden md:block" />
              Manage Your <span className="text-primary">Pharmacy</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-10 leading-relaxed">
              DumosRx is Nigeria&apos;s #1 offline-first pharmacy management
              system. Designed for reliability even during power outages and
              poor internet.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
              {isLoggedIn ? (
                <Button
                  size="lg"
                  className="h-14 px-8 text-lg font-bold shadow-xl shadow-primary/20"
                  asChild
                >
                  <Link href="/dashboard">Open Dashboard</Link>
                </Button>
              ) : (
                <>
                  <Button
                    size="lg"
                    className="h-14 px-8 text-lg font-bold shadow-xl shadow-primary/20"
                    asChild
                  >
                    <Link href="/register">Start 14-Day Free Trial</Link>
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-14 px-8 text-lg font-bold"
                    asChild
                  >
                    <Link href="/login">Log in</Link>
                  </Button>
                </>
              )}
            </div>

            {/* App Mockup */}
            <div className="relative mx-auto max-w-5xl">
              <div className="absolute -inset-1 bg-linear-to-r from-primary to-blue-600 rounded-2xl blur-sm opacity-25" />
              <div className="relative bg-background border rounded-xl overflow-hidden shadow-2xl">
                <div className="h-12 bg-muted/50 border-b flex items-center px-4 gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500/20" />
                    <div className="w-3 h-3 rounded-full bg-amber-500/20" />
                    <div className="w-3 h-3 rounded-full bg-green-500/20" />
                  </div>
                  <div className="mx-auto w-full max-w-sm h-6 bg-background rounded-md border text-[10px] flex items-center px-3 text-muted-foreground">
                    cloud.dumosrx.com/dashboard
                  </div>
                </div>
                <div className="aspect-video bg-muted/20 relative">
                  <Image
                    src="https://images.unsplash.com/photo-1586023492125-27b2c045efd7?q=80&w=2000&auto=format&fit=crop"
                    alt="DumosRx Dashboard"
                    fill
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-linear-to-t from-background/40 to-transparent" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-24 bg-muted/50">
          <div className="container px-4 mx-auto">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-base font-bold text-primary tracking-wider uppercase mb-3">
                Features
              </h2>
              <h3 className="text-4xl font-black mb-6">
                Everything you need to run a modern pharmacy
              </h3>
              <p className="text-lg text-muted-foreground leading-relaxed">
                We&apos;ve built DumosRx specifically for the Nigerian market,
                focusing on the real-world challenges you face every day.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[
                {
                  title: "Offline-First Sync",
                  description:
                    "Sell and manage inventory even without internet. Data syncs automatically to the cloud when you're back online.",
                  icon: Zap,
                },
                {
                  title: "Expiry Tracking",
                  description:
                    "Get notified months before medicines expire. Reduce losses and ensure patient safety with automated alerts.",
                  icon: Shield,
                },
                {
                  title: "Mobile Dashboard",
                  description:
                    "Monitor your store sales, staff activity, and inventory levels from your phone, anywhere in the world.",
                  icon: Smartphone,
                },
                {
                  title: "Multi-Store Support",
                  description:
                    "Manage multiple branches from a single cloud account. Aggregate reporting and central stock management.",
                  icon: Globe,
                },
                {
                  title: "Sales Analytics",
                  description:
                    "Deep insights into your most profitable products, peak sales periods, and staff performance.",
                  icon: BarChart3,
                },
                {
                  title: "Secure Backups",
                  description:
                    "Your pharmacy data is encrypted and backed up daily. Never lose a record to system failure or theft.",
                  icon: Database,
                },
              ].map((feature, i) => (
                <Card key={i} className="border-none shadow-sm hover:shadow-md transition-all group">
                  <CardHeader>
                    <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary mb-4 group-hover:scale-110 transition-transform">
                      <feature.icon className="h-6 w-6" />
                    </div>
                    <CardTitle className="text-xl">{feature.title}</CardTitle>
                    <CardDescription className="text-base">
                      {feature.description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Benefits/Why Choose Us */}
        <section id="benefits" className="py-24 overflow-hidden">
           <div className="container px-4 mx-auto">
              <div className="flex flex-col lg:flex-row items-center gap-16">
                 <div className="flex-1 space-y-8">
                    <h2 className="text-4xl font-black leading-tight">
                       Why Nigerian Pharmacists choose <span className="text-primary">DumosRx</span>
                    </h2>
                    <div className="space-y-6">
                       {[
                          { title: "No Internet? No Problem.", desc: "Our local client app works 100% offline. No more waiting for pages to load during a sale." },
                          { title: "NAFDAC & Expiry Alerts", desc: "Automated tracking for regulatory compliance and proactive inventory management." },
                          { title: "Transparent Pricing", desc: "Pay in Naira, no hidden fees. Choose a plan that fits your pharmacy size." }
                       ].map((item, i) => (
                          <div key={i} className="flex gap-4">
                             <div className="mt-1">
                                <div className="bg-emerald-500/10 p-1 rounded-full">
                                   <Check className="h-5 w-5 text-emerald-500" />
                                </div>
                             </div>
                             <div>
                                <h4 className="font-bold text-xl mb-1">{item.title}</h4>
                                <p className="text-muted-foreground leading-relaxed">{item.desc}</p>
                             </div>
                          </div>
                       ))}
                    </div>
                    <Button size="lg" className="rounded-full px-8 h-12 font-bold shadow-lg shadow-primary/20" asChild>
                       <Link href="/register">Join the Community</Link>
                    </Button>
                 </div>
                 <div className="flex-1 relative">
                    <div className="absolute -inset-4 bg-primary/5 rounded-[40px] rotate-3" />
                    <div className="relative aspect-square rounded-[32px] overflow-hidden shadow-2xl border-8 border-background">
                       <Image 
                          src="https://images.unsplash.com/photo-1576091160550-2173dba999ef?q=80&w=2070&auto=format&fit=crop"
                          alt="Pharmacist working"
                          fill
                          className="object-cover"
                       />
                    </div>
                 </div>
              </div>
           </div>
        </section>

        <PricingSection />

        {/* CTA Section */}
        <section className="py-24 bg-primary text-primary-foreground relative overflow-hidden">
           <div className="absolute top-0 right-0 w-[50%] h-full bg-white/5 skew-x-[-20deg] translate-x-1/2" />
           <div className="container px-4 mx-auto relative text-center">
              <h2 className="text-4xl md:text-5xl font-black mb-6">Ready to modernize your pharmacy?</h2>
              <p className="text-xl text-primary-foreground/80 mb-10 max-w-2xl mx-auto">
                 Join hundreds of pharmacies across Nigeria using DumosRx to increase profits and improve patient care.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                 <Button size="lg" variant="secondary" className="h-14 px-10 text-lg font-bold" asChild>
                    <Link href="/register">Create Your Account</Link>
                 </Button>
                 <Button size="lg" variant="outline" className="h-14 px-10 text-lg font-bold bg-transparent text-white border-white hover:bg-white/10" asChild>
                    <Link href="/login">Sign In</Link>
                 </Button>
              </div>
              <p className="mt-8 text-primary-foreground/60 text-sm font-medium italic">
                 * No credit card required to start your free trial.
              </p>
           </div>
        </section>
      </main>

      <footer className="bg-background border-t py-12">
        <div className="container px-4 mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div className="col-span-2">
              <Link href="/" className="flex items-center space-x-2 mb-6">
                <Pill className="h-6 w-6 text-primary" />
                <span className="text-xl font-bold">DumosRx</span>
              </Link>
              <p className="text-muted-foreground max-w-xs mb-6">
                The most reliable pharmacy management system for the Nigerian
                market. Offline-first, cloud-synced, and built for growth.
              </p>
            </div>
            <div>
              <h4 className="font-bold mb-4 uppercase text-xs tracking-widest text-muted-foreground">Product</h4>
              <ul className="space-y-2">
                <li><Link href="#features" className="text-sm text-muted-foreground hover:text-primary">Features</Link></li>
                <li><Link href="#pricing" className="text-sm text-muted-foreground hover:text-primary">Pricing</Link></li>
                <li><Link href="/downloads" className="text-sm text-muted-foreground hover:text-primary">Downloads</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold mb-4 uppercase text-xs tracking-widest text-muted-foreground">Company</h4>
              <ul className="space-y-2">
                <li><Link href="/about" className="text-sm text-muted-foreground hover:text-primary">About</Link></li>
                <li><Link href="/contact" className="text-sm text-muted-foreground hover:text-primary">Contact</Link></li>
                <li><Link href="/privacy" className="text-sm text-muted-foreground hover:text-primary">Privacy</Link></li>
              </ul>
            </div>
          </div>
          <Separator className="mb-8" />
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
            <p>© {new Date().getFullYear()} DumosRx Technology. All rights reserved.</p>
            <div className="flex gap-6">
               <Link href="#" className="hover:text-primary">Twitter</Link>
               <Link href="#" className="hover:text-primary">LinkedIn</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
