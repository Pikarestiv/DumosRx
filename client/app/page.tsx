"use client";

import { LoginForm } from "@/components/auth/login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { APP_NAME } from "@/lib/constants";
import { motion } from "framer-motion";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Premium Background Elements */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/10 rounded-full blur-[120px]" />
      </div>

      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="text-center mb-8"
        >
          <h1 className="font-serif font-black text-4xl text-foreground mb-2 tracking-tight">
            {APP_NAME}
          </h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.8 }}
            className="text-muted-foreground text-lg"
          >
            NextGen Retail & Pharmacy Management
          </motion.p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
        >
          <Card className="border-border/50 shadow-2xl bg-card/80 backdrop-blur-xl">
            <CardHeader className="space-y-1">
              <CardTitle className="font-serif font-bold text-2xl text-center">Sign In</CardTitle>
              <CardDescription className="text-center">
                Enter your credentials to access your dashboard
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LoginForm />
            </CardContent>
          </Card>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 1 }}
          className="mt-8 text-center text-sm text-muted-foreground"
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-center gap-4 text-xs font-medium uppercase tracking-widest opacity-60">
              <span>Compliant</span>
              <span className="w-1 h-1 bg-muted-foreground rounded-full" />
              <span>Secure</span>
              <span className="w-1 h-1 bg-muted-foreground rounded-full" />
              <span>Reliable</span>
            </div>
            
            <p className="mt-4">
              Built with precision by{" "}
              <a
                href="https://dumostech.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline font-semibold transition-colors"
              >
                Dumos Technologies
              </a>
            </p>
            <p className="text-[10px] opacity-50 font-mono mt-1">© 2019 - 2025 • v2.0.0-tauri</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
