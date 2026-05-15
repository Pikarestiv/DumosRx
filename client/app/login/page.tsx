"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Lock, User, Loader2, ArrowLeft, RefreshCw } from "lucide-react";
import { APP_NAME, APP_VERSION } from "@/lib/constants";
import { toast } from "sonner";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { query } from "@/lib/db/local-database";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [userCount, setUserCount] = useState(0);

  const { login } = useAuth();
  const router = useRouter();

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    try {
      const tables = await query<any>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='users'",
      );
      if (tables.length === 0) {
        setUserCount(0);
        return;
      }

      const result = await query<any>(
        "SELECT COUNT(*) as count FROM users WHERE is_active = 1",
      );
      const count = result[0]?.count || 0;
      setUserCount(count);
    } catch (e) {
      console.error("Status check failed", e);
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const success = await login(username, pin);
      if (success) {
        toast.success("Welcome back!");
        router.push("/dashboard");
      } else {
        toast.error("Invalid credentials. Please try again.");
      }
    } catch {
      toast.error("Login failed. Database might not be initialized.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckForUpdates = async () => {
    try {
      const { isTauri } = await import("@/lib/db/core");
      if (!isTauri()) {
        toast.info("Updates only available in desktop app");
        return;
      }

      setIsCheckingUpdate(true);
      const { check } = await import("@tauri-apps/plugin-updater");
      const { relaunch } = await import("@tauri-apps/plugin-process");
      const update = await check();

      if (update) {
        toast.success(`Update available: ${update.version}`);
        if (
          window.confirm(`Version ${update.version} is available. Install now?`)
        ) {
          await update.downloadAndInstall();
          await relaunch();
        }
      } else {
        toast.info("You are on the latest version");
      }
    } catch (err) {
      console.error("Update check failed", err);
      toast.error("Failed to check for updates");
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  if (isCheckingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden bg-background">
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/60" />
      </div>

      <div
        className="absolute z-20"
        style={{ top: "calc(var(--tauri-top, 0px) + 2rem)", right: "2rem" }}
      >
        <ThemeToggle />
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md z-10"
      >
        <Link
          href="/"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors group"
        >
          <ArrowLeft className="h-4 w-4 mr-2 transform group-hover:-translate-x-1 transition-transform" />
          Back to Home
        </Link>

        <Card className="border-border shadow-2xl bg-card/60 backdrop-blur-2xl">
          <CardHeader className="space-y-1 flex flex-col items-center text-center pb-2">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{
                type: "spring",
                stiffness: 260,
                damping: 20,
                delay: 0.2,
              }}
              className="mb-6 overflow-hidden"
            >
              <Image
                src="/logo.png"
                alt="Logo"
                width={180}
                height={70}
                className="object-contain"
                style={{ filter: "var(--logo-filter)", height: "auto" }}
              />
            </motion.div>

            {userCount === 0 ? (
              <>
                <CardTitle className="text-xl font-bold">
                  No Local Accounts Found
                </CardTitle>
                <CardDescription className="text-muted-foreground mt-2">
                  This device hasn't been set up yet. Would you like to create a
                  new store or restore from a backup?
                </CardDescription>
              </>
            ) : (
              <CardDescription className="text-muted-foreground">
                Terminal Access • Secure Login
              </CardDescription>
            )}
          </CardHeader>

          {userCount === 0 ? (
            <CardContent className="flex flex-col space-y-4 pt-6 pb-8">
              <Link href="/setup?from=login">
                <Button className="w-full h-12 text-lg font-bold shadow-lg">
                  Setup New Store
                </Button>
              </Link>
              <Link href="/setup?step=backup&from=login">
                <Button
                  variant="outline"
                  className="w-full h-12 text-lg font-bold"
                >
                  Restore from Backup
                </Button>
              </Link>
              <div className="pt-2 text-center">
                <Link
                  href="/setup?step=cloud&from=login"
                  className="text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  Already have a cloud account?{" "}
                  <span className="font-semibold underline">Sync Now</span>
                </Link>
              </div>
            </CardContent>
          ) : (
            <form onSubmit={handleLogin}>
              <CardContent className="space-y-4 pt-6">
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <div className="relative group">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input
                      id="username"
                      placeholder="admin"
                      className="pl-10 bg-background/50 border-border focus:border-primary/50 focus:ring-primary/20 transition-all"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pin">PIN / Password</Label>
                  <div className="relative group">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input
                      id="pin"
                      type="password"
                      placeholder="••••"
                      className="pl-10 bg-background/50 border-border focus:border-primary/50 focus:ring-primary/20 transition-all"
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="pt-2 text-center">
                  <Link
                    href="/setup?step=backup&from=login"
                    className="text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    Moving from another device?{" "}
                    <span className="font-semibold underline">
                      Restore from Backup
                    </span>
                  </Link>
                </div>
              </CardContent>
              <CardFooter className="flex flex-col space-y-6 pt-6 pb-8">
                <Button
                  type="submit"
                  className="w-full h-12 text-lg font-bold shadow-lg active:scale-[0.98]"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  ) : (
                    "Authorize Entry"
                  )}
                </Button>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-widest">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  System Online • Encrypted Session
                </div>
                <div className="flex items-center justify-between w-full mt-4 border-t border-border pt-4">
                  <span className="text-[10px] text-muted-foreground font-medium">
                    v{APP_VERSION}
                  </span>
                  <button
                    type="button"
                    onClick={handleCheckForUpdates}
                    disabled={isCheckingUpdate}
                    className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`h-3 w-3 ${isCheckingUpdate ? "animate-spin" : ""}`}
                    />
                    {isCheckingUpdate ? "Checking..." : "Check for Updates"}
                  </button>
                </div>
              </CardFooter>
            </form>
          )}
        </Card>
      </motion.div>
    </div>
  );
}
