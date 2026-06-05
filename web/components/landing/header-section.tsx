"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import { ModeToggle } from "@/components/mode-toggle";
import { Separator } from "@/components/ui/separator";

export function HeaderSection() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("drx_token");
    setIsLoggedIn(!!token);
  }, []);

  return (
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
              className="h-10 w-auto object-contain"
              style={{ filter: "var(--logo-filter)" }}
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
            <SheetContent side="right" className="w-[300px] sm:w-[400px]">
              <div className="flex flex-col gap-8 mt-12 px-2">
                <div className="flex flex-col gap-6">
                  <SheetClose asChild>
                    <Link href="#features" className="text-2xl font-bold tracking-tight hover:text-primary transition-colors">
                      Features
                    </Link>
                  </SheetClose>
                  <SheetClose asChild>
                    <Link href="#benefits" className="text-2xl font-bold tracking-tight hover:text-primary transition-colors">
                      Benefits
                    </Link>
                  </SheetClose>
                  <SheetClose asChild>
                    <Link href="#pricing" className="text-2xl font-bold tracking-tight hover:text-primary transition-colors">
                      Pricing
                    </Link>
                  </SheetClose>
                </div>
                <Separator className="bg-border/60" />
                <div className="flex flex-col gap-4">
                  {isLoggedIn ? (
                    <SheetClose asChild>
                      <Button size="lg" className="w-full h-14 text-lg font-bold shadow-lg" asChild>
                        <Link href="/dashboard">Go to Dashboard</Link>
                      </Button>
                    </SheetClose>
                  ) : (
                    <>
                      <SheetClose asChild>
                        <Button size="lg" className="w-full h-14 text-lg font-bold shadow-lg shadow-primary/20" asChild>
                          <Link href="/register">Start Free Trial</Link>
                        </Button>
                      </SheetClose>
                      <SheetClose asChild>
                        <Button size="lg" variant="outline" className="w-full h-14 text-lg font-bold border-2" asChild>
                          <Link href="/login">Log in</Link>
                        </Button>
                      </SheetClose>
                    </>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
