"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";


import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ModeToggle } from "@/components/mode-toggle";
import { PricingSection } from "@/components/landing/pricing-section";
import { Separator } from "@/components/ui/separator";
import { HeroSection } from "@/components/landing/hero-section";
import { FeaturesSection } from "@/components/landing/features-section";
import { BenefitsSection } from "@/components/landing/benefits-section";
import { CTASection } from "@/components/landing/cta-section";
import { FooterSection } from "@/components/landing/footer-section";

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
        <div className="container px-6 md:px-12 flex h-20 items-center justify-between mx-auto">
          <Link
            href="/"
            className="flex items-center group transition-transform hover:scale-105"
          >
            <div className="relative h-10 w-auto flex items-center justify-center">
              <Image
                src="/logo.png"
                alt="DumosRx Logo"
                width={120}
                height={38}
                className="h-10 w-auto object-contain brightness-0 invert"
                priority
              />
            </div>
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
                <Button
                  className="font-semibold shadow-lg shadow-primary/20"
                  asChild
                >
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
        <HeroSection isLoggedIn={isLoggedIn} />
        <FeaturesSection />
        <BenefitsSection />
        <PricingSection />
        <CTASection />
      </main>

      <FooterSection />
    </div>
  );
}
