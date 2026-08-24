"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Menu,
  Zap,
  Shield,
  CreditCard,
  UserPlus,
  LogIn,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetClose,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ModeToggle } from "@/components/mode-toggle";
import { ServerSelector } from "@/components/ui/server-selector";
import { APP_URL } from "@/lib/constants";

export function HeaderSection() {
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
            <Button variant="ghost" className="font-semibold" asChild>
              <Link href={`${APP_URL}/login`}>Log in</Link>
            </Button>
            <Button
              className="font-semibold shadow-lg shadow-primary/20"
              asChild
            >
              <Link href={APP_URL}>Get Started</Link>
            </Button>
            <ServerSelector />
            <ModeToggle />
          </div>
        </nav>

        {/* Mobile Nav */}
        <div className="md:hidden flex items-center gap-4">
          <ServerSelector />
          <ModeToggle />
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-[300px] sm:w-[400px] border-l-border/40 bg-background/95 backdrop-blur-xl p-0"
            >
              <div className="flex flex-col h-full">
                <SheetHeader className="p-6 border-b border-border/40 text-left">
                  <SheetTitle className="text-xl font-black tracking-tight text-primary">
                    DumosRx
                  </SheetTitle>
                </SheetHeader>
                <div className="flex-1 overflow-y-auto py-6 px-6">
                  <div className="flex flex-col gap-4">
                    <SheetClose asChild>
                      <Link
                        href="#features"
                        className="flex items-center gap-3 py-2 text-lg font-medium text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <div className="p-2 rounded-md bg-primary/10 text-primary">
                          <Zap className="h-4 w-4" />
                        </div>
                        Features
                      </Link>
                    </SheetClose>
                    <SheetClose asChild>
                      <Link
                        href="#benefits"
                        className="flex items-center gap-3 py-2 text-lg font-medium text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <div className="p-2 rounded-md bg-emerald-500/10 text-emerald-500">
                          <Shield className="h-4 w-4" />
                        </div>
                        Benefits
                      </Link>
                    </SheetClose>
                    <SheetClose asChild>
                      <Link
                        href="#pricing"
                        className="flex items-center gap-3 py-2 text-lg font-medium text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <div className="p-2 rounded-md bg-amber-500/10 text-amber-500">
                          <CreditCard className="h-4 w-4" />
                        </div>
                        Pricing
                      </Link>
                    </SheetClose>
                  </div>
                </div>
                <div className="p-6 border-t border-border/40 bg-muted/20">
                  <div className="flex flex-col gap-3">
                    <SheetClose asChild>
                      <Button
                        className="w-full font-bold shadow-lg shadow-primary/20 h-12"
                        asChild
                      >
                        <Link href={APP_URL}>
                          <UserPlus className="h-4 w-4 mr-2" />
                          Get Started
                        </Link>
                      </Button>
                    </SheetClose>
                    <SheetClose asChild>
                      <Button
                        variant="outline"
                        className="w-full font-bold h-12 border-border/40 hover:bg-muted"
                        asChild
                      >
                        <Link href={`${APP_URL}/login`}>
                          <LogIn className="h-4 w-4 mr-2" />
                          Log in
                        </Link>
                      </Button>
                    </SheetClose>
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
