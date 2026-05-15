"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-background text-foreground transition-colors duration-500">
      {/* Premium Background Effects */}
      <div className="absolute inset-0 z-0">
        {/* Animated Mesh Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 via-transparent to-accent/10 dark:from-primary/20 dark:to-accent/20" />
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-primary/20 dark:bg-primary/30 rounded-full blur-[120px] mix-blend-multiply dark:mix-blend-screen animate-blob" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-accent/10 dark:bg-accent/20 rounded-full blur-[120px] mix-blend-multiply dark:mix-blend-screen animate-blob animation-delay-2000" />
      </div>

      <div className="absolute top-6 right-6 z-30">
        <ThemeToggle />
      </div>

      <main className="w-full max-w-[1200px] grid grid-cols-1 lg:grid-cols-2 gap-12 items-center z-10">
        {/* Hero Content */}
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: "circOut" }}
          className="hidden lg:block space-y-8"
        >
          <div className="space-y-4">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.8 }}
              className="text-6xl font-serif font-black leading-tight tracking-tighter"
            >
              The Future of <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">
                Retail & Pharmacy
              </span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.8 }}
              className="text-xl text-muted-foreground max-w-lg leading-relaxed"
            >
              Streamline your operations, manage inventory with precision, and
              provide world-class service with DumosRx.
            </motion.p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.8 }}
            className="flex items-center gap-8 pt-4"
          >
            <div className="flex flex-col">
              <span className="text-3xl font-bold">99.9%</span>
              <span className="text-xs text-muted-foreground uppercase tracking-widest font-medium">
                Uptime
              </span>
            </div>
            <div className="w-px h-10 bg-border" />
            <div className="flex flex-col">
              <span className="text-3xl font-bold">256-bit</span>
              <span className="text-xs text-muted-foreground uppercase tracking-widest font-medium">
                Encryption
              </span>
            </div>
            <div className="w-px h-10 bg-border" />
            <div className="flex flex-col">
              <span className="text-3xl font-bold">Instant</span>
              <span className="text-xs text-muted-foreground uppercase tracking-widest font-medium">
                Sync
              </span>
            </div>
          </motion.div>
        </motion.div>

        {/* Login/Get Started Card */}
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, ease: "circOut" }}
          className="w-full max-w-md mx-auto"
        >
          <Card className="border-border shadow-[0_0_50px_-12px_rgba(0,0,0,0.1)] dark:shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] bg-card/60 backdrop-blur-2xl overflow-hidden relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/50 to-accent/50 rounded-xl opacity-0 group-hover:opacity-5 transition duration-1000" />

            <CardHeader className="space-y-1 relative pt-10">
              <div className="flex justify-center mb-8">
                <Image
                  src="/logo.png"
                  alt="DumosRx Logo"
                  width={200}
                  height={80}
                  className="object-contain"
                  style={{ filter: "var(--logo-filter)", height: "auto" }}
                />
              </div>
              <CardTitle className="font-serif font-bold text-3xl text-center">
                Ready to Begin?
              </CardTitle>
              <CardDescription className="text-center text-muted-foreground px-6 pt-2">
                Experience the next generation of business intelligence and
                pharmacy management.
              </CardDescription>
            </CardHeader>
            <CardContent className="relative pb-10 pt-6 flex flex-col space-y-4">
              <Link href="/login">
                <Button className="w-full h-14 text-lg font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg transition-all hover:translate-y-[-2px] active:translate-y-[0px]">
                  Launch System
                </Button>
              </Link>
              <div className="text-center">
                <Link
                  href="/login"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center justify-center gap-2 group"
                >
                  Already have an account?{" "}
                  <span className="font-semibold underline decoration-primary/30 group-hover:decoration-primary transition-all">
                    Log In
                  </span>
                </Link>
              </div>
            </CardContent>
          </Card>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="mt-8 text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium"
          >
            © 2019 - 2026 • Powered by Dumos Technologies
          </motion.p>
        </motion.div>
      </main>

      {/* Global CSS for custom animations */}
      <style jsx global>{`
        @keyframes blob {
          0% {
            transform: translate(0px, 0px) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
          100% {
            transform: translate(0px, 0px) scale(1);
          }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
      `}</style>
    </div>
  );
}
