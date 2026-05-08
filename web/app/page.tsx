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

export default function Home() {
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
              <Button variant="ghost" className="font-semibold" asChild>
                <Link href="/login">Log in</Link>
              </Button>
              <Button
                className="font-semibold shadow-lg shadow-primary/20"
                asChild
              >
                <Link href="/register">Start Free Trial</Link>
              </Button>
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
                <Link href="#features">Explore Features</Link>
              </Button>
            </div>

            {/* Dashboard Preview */}
            <div className="relative mx-auto max-w-6xl">
              <div className="rounded-2xl border bg-card/50 p-2 shadow-2xl backdrop-blur-sm">
                <Image
                  src="/images/dashboard-preview.png"
                  alt="DumosRx Dashboard Preview"
                  width={1200}
                  height={800}
                  className="rounded-xl shadow-inner border object-cover"
                  priority
                />
              </div>
              <div className="absolute -bottom-6 -left-6 hidden lg:block">
                <div className="bg-background border rounded-2xl p-6 shadow-xl flex items-center gap-4 animate-bounce-subtle">
                  <div className="bg-green-100 dark:bg-green-900/30 p-3 rounded-full">
                    <Zap className="h-6 w-6 text-green-600" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold">100% Offline Capable</p>
                    <p className="text-xs text-muted-foreground">
                      Work without internet
                    </p>
                  </div>
                </div>
              </div>
              <div className="absolute -top-6 -right-6 hidden lg:block">
                <div className="bg-background border rounded-2xl p-6 shadow-xl flex items-center gap-4">
                  <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-full">
                    <ShieldCheck className="h-6 w-6 text-blue-600" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold">PCN Compliant</p>
                    <p className="text-xs text-muted-foreground">
                      Meets local standards
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Logo Cloud / Social Proof */}
        <section className="py-20 border-y bg-muted/30">
          <div className="container px-4 mx-auto text-center">
            <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-10">
              TRUSTED BY INDUSTRY LEADERS ACROSS NIGERIA
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-12 items-center opacity-50 grayscale hover:grayscale-0 transition-all">
              <div className="flex justify-center">
                <p className="text-2xl font-black italic">HEALTHPLUS</p>
              </div>
              <div className="flex justify-center">
                <p className="text-2xl font-black italic">MEDPLUS</p>
              </div>
              <div className="flex justify-center">
                <p className="text-2xl font-black italic">NETCARE</p>
              </div>
              <div className="flex justify-center">
                <p className="text-2xl font-black italic">EMZOR</p>
              </div>
              <div className="flex justify-center">
                <p className="text-2xl font-black italic">FIDSON</p>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-32">
          <div className="container px-4 mx-auto">
            <div className="text-center max-w-3xl mx-auto mb-20">
              <h2 className="text-base font-bold text-primary tracking-wide uppercase mb-3">
                Core Features
              </h2>
              <p className="text-4xl md:text-5xl font-extrabold mb-6 tracking-tight">
                Everything you need to run a modern pharmacy
              </p>
              <p className="text-xl text-muted-foreground leading-relaxed">
                We&apos;ve built DumosRx with the specific challenges of
                Nigerian healthcare in mind. Powerful tools that work where you
                are.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  title: "Smart Inventory",
                  description:
                    "Automated stock alerts, expiry tracking, and intelligent reordering logic.",
                  icon: Database,
                  color: "blue",
                },
                {
                  title: "Fast POS Checkout",
                  description:
                    "Process sales in seconds. Supports multiple payment modes including bank transfers.",
                  icon: Zap,
                  color: "green",
                },
                {
                  title: "Financial Intelligence",
                  description:
                    "Real-time profit/loss, daily reports, and EOD reconciliations.",
                  icon: BarChart3,
                  color: "purple",
                },
                {
                  title: "Regulatory Compliance",
                  description:
                    "Automatic PCN-compliant records and professional digital receipts.",
                  icon: Shield,
                  color: "red",
                },
                {
                  title: "CRM & Loyalty",
                  description:
                    "Track customer history and build loyalty with reward points.",
                  icon: Users,
                  color: "indigo",
                },
                {
                  title: "Multi-Platform",
                  description:
                    "Run on Windows, Mac, or Tablet. All data syncs to the cloud securely.",
                  icon: Smartphone,
                  color: "orange",
                },
              ].map((feature, i) => (
                <Card
                  key={i}
                  className="group hover:border-primary/50 transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 border-muted bg-card/50 backdrop-blur"
                >
                  <CardHeader>
                    <div
                      className={`w-12 h-12 rounded-xl bg-${feature.color}-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}
                    >
                      <feature.icon
                        className={`h-6 w-6 text-${feature.color}-500`}
                      />
                    </div>
                    <CardTitle className="text-2xl font-bold">
                      {feature.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground leading-relaxed">
                      {feature.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Offline-First Showcase */}
        <section
          id="benefits"
          className="py-24 bg-slate-900 text-white overflow-hidden"
        >
          <div className="container px-4 mx-auto">
            <div className="grid lg:grid-cols-2 gap-20 items-center">
              <div>
                <h2 className="text-4xl md:text-5xl font-extrabold mb-8 tracking-tight">
                  Built for Nigeria&apos;s <br /> Infrastructure
                </h2>
                <div className="space-y-8">
                  <div className="flex gap-6">
                    <div className="shrink-0 w-12 h-12 bg-primary/20 rounded-lg flex items-center justify-center">
                      <Check className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold mb-2">
                        No Internet? No Problem.
                      </h3>
                      <p className="text-slate-400">
                        Continue making sales and managing stock even when your
                        internet is down. DumosRx syncs automatically once
                        you&apos;re back online.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-6">
                    <div className="shrink-0 w-12 h-12 bg-primary/20 rounded-lg flex items-center justify-center">
                      <Check className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold mb-2">
                        Power Failure Protection
                      </h3>
                      <p className="text-slate-400">
                        Our local-first architecture ensures no data is lost
                        during sudden power outages or system shutdowns.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-6">
                    <div className="shrink-0 w-12 h-12 bg-primary/20 rounded-lg flex items-center justify-center">
                      <Check className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold mb-2">
                        Bank Transfer Verification
                      </h3>
                      <p className="text-slate-400">
                        Specially designed POS flow for the Nigerian market,
                        supporting quick bank transfer verification and split
                        payments.
                      </p>
                    </div>
                  </div>
                </div>
                <Button size="lg" className="mt-12 group" asChild>
                  <Link href="/register">
                    Get Started Now{" "}
                    <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </Button>
              </div>
              <div className="relative">
                <div className="rounded-3xl overflow-hidden border-8 border-slate-800 shadow-2xl">
                  <Image
                    src="/images/pharmacy-lifestyle.png"
                    alt="Nigerian Pharmacist"
                    width={600}
                    height={600}
                    className="object-cover"
                  />
                </div>
                <div className="absolute -top-10 -right-10 bg-primary p-8 rounded-2xl shadow-2xl hidden xl:block">
                  <p className="text-5xl font-black mb-1 leading-none">99.9%</p>
                  <p className="text-sm font-bold uppercase tracking-widest opacity-80">
                    System Uptime
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="py-32">
          <PricingSection />
        </section>

        {/* FAQ Section */}
        <section className="py-32 bg-muted/30">
          <div className="container px-4 mx-auto max-w-4xl">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-extrabold mb-4">
                Frequently Asked Questions
              </h2>
              <p className="text-muted-foreground">
                Everything you need to know about DumosRx
              </p>
            </div>
            <div className="space-y-6">
              {[
                {
                  q: "Is DumosRx easy to learn?",
                  a: "Yes! Most pharmacists and cashiers master DumosRx in less than 30 minutes. Our interface is intuitive and mirrors real pharmacy workflows.",
                },
                {
                  q: "Does it work on a laptop?",
                  a: "Absolutely. DumosRx works on Windows and Mac. You can also access reports on your mobile phone via the cloud dashboard.",
                },
                {
                  q: "What happens if my computer crashes?",
                  a: "Your data is automatically synced to the DumosRx cloud whenever you have internet. You can restore your entire database to a new machine in minutes.",
                },
                {
                  q: "Is the software PCN compliant?",
                  a: "Yes, DumosRx generates all mandatory PCN records and handles batch numbers and expiry tracking exactly as required by Nigerian law.",
                },
              ].map((faq, i) => (
                <div
                  key={i}
                  className="bg-background border rounded-2xl p-8 shadow-sm"
                >
                  <h3 className="text-xl font-bold mb-3">{faq.q}</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {faq.a}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-32">
          <div className="container px-4 mx-auto">
            <div className="bg-primary rounded-[3rem] p-12 md:p-24 text-white text-center relative overflow-hidden shadow-2xl shadow-primary/20">
              <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.2),transparent)] pointer-events-none" />
              <div className="relative z-10">
                <h2 className="text-4xl md:text-6xl font-black mb-8 leading-tight">
                  Ready to modernize <br /> your pharmacy?
                </h2>
                <p className="text-xl mb-12 opacity-90 max-w-2xl mx-auto leading-relaxed">
                  Join 500+ forward-thinking pharmacies across Nigeria. Start
                  your 14-day risk-free trial today. No credit card required.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                  <Button
                    size="lg"
                    variant="secondary"
                    className="h-16 px-10 text-xl font-bold w-full sm:w-auto"
                    asChild
                  >
                    <Link href="/register">Create Account Now</Link>
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-16 px-10 text-xl font-bold bg-transparent border-white text-white hover:bg-white hover:text-primary w-full sm:w-auto"
                    asChild
                  >
                    <Link href="https://wa.me/2348000000000">
                      Chat with Sales
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="pt-24 pb-12 bg-slate-900 text-slate-400">
        <div className="container px-4 mx-auto">
          <div className="grid md:grid-cols-4 gap-12 mb-20">
            <div className="space-y-6">
              <Link href="/" className="flex items-center space-x-2">
                <div className="bg-primary p-1 rounded-lg">
                  <Pill className="h-5 w-5 text-white" />
                </div>
                <span className="text-xl font-bold text-white tracking-tight">
                  DumosRx
                </span>
              </Link>
              <p className="text-sm leading-relaxed">
                The #1 Pharmacy Management System in Nigeria. Trusted by 500+
                pharmacists to provide world-class healthcare.
              </p>
              <div className="flex space-x-4">
                {/* Social Icons Placeholder */}
                <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center hover:bg-primary transition-colors cursor-pointer">
                  <Globe className="w-4 h-4 text-white" />
                </div>
                <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center hover:bg-primary transition-colors cursor-pointer">
                  <Smartphone className="w-4 h-4 text-white" />
                </div>
                <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center hover:bg-primary transition-colors cursor-pointer">
                  <Zap className="w-4 h-4 text-white" />
                </div>
              </div>
            </div>
            <div>
              <h3 className="font-bold text-white mb-6 uppercase tracking-widest text-xs">
                Product
              </h3>
              <ul className="space-y-4 text-sm">
                <li>
                  <Link href="#" className="hover:text-white transition-colors">
                    Features
                  </Link>
                </li>
                <li>
                  <Link href="#" className="hover:text-white transition-colors">
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link href="#" className="hover:text-white transition-colors">
                    Offline Sync
                  </Link>
                </li>
                <li>
                  <Link href="#" className="hover:text-white transition-colors">
                    Release Notes
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold text-white mb-6 uppercase tracking-widest text-xs">
                Company
              </h3>
              <ul className="space-y-4 text-sm">
                <li>
                  <Link href="#" className="hover:text-white transition-colors">
                    About Us
                  </Link>
                </li>
                <li>
                  <Link href="#" className="hover:text-white transition-colors">
                    Careers
                  </Link>
                </li>
                <li>
                  <Link href="#" className="hover:text-white transition-colors">
                    Contact
                  </Link>
                </li>
                <li>
                  <Link href="#" className="hover:text-white transition-colors">
                    Privacy Policy
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold text-white mb-6 uppercase tracking-widest text-xs">
                Contact
              </h3>
              <ul className="space-y-4 text-sm">
                <li>Lagos, Nigeria</li>
                <li>support@dumostech.com</li>
                <li>+234 (0) 800 DUMOS RX</li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-slate-800 text-center text-xs">
            <p>
              &copy; {new Date().getFullYear()} Dumos Technologies. All rights
              reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Separator() {
  return <div className="h-px w-full bg-border my-2" />;
}
