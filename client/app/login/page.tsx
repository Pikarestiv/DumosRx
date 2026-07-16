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
import { Lock, User, Loader2, ArrowLeft } from "lucide-react";
import { APP_VERSION } from "@/lib/constants";
import { toast } from "sonner";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";

import { checkIfTableExists, getActiveUserCount } from "@/lib/db/queries/setup";
import { LockScreen } from "@/components/auth/lock-screen";
import { RecentUser } from "@/lib/context/auth-context";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [userCount, setUserCount] = useState(0);
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);
  const [showTraditionalLogin, setShowTraditionalLogin] = useState(false);

  const { login } = useAuth();
  const router = useRouter();

  useEffect(() => {
    checkStatus();
    const storedUsers = localStorage.getItem("dumos_recent_users");
    if (storedUsers) {
      try {
        setRecentUsers(JSON.parse(storedUsers));
      } catch (e) {
        console.error("Failed to parse recent users", e);
      }
    }
  }, []);

  const checkStatus = async () => {
    try {
      const exists = await checkIfTableExists("users");
      if (!exists) {
        setUserCount(0);
        return;
      }

      const count = await getActiveUserCount();
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
      const cleanUsername = username.trim().toLowerCase();
      const success = await login(cleanUsername, pin);
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

  if (isCheckingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden bg-background"
      style={{ paddingTop: "calc(var(--tauri-top, 0px) + 1rem)" }}
    >
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/60" />
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md z-10"
      >
        <Link
          href="/"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors group"
        >
          <ArrowLeft className="h-4 w-4 mr-2 transform group-hover:-translate-x-1 transition-transform" />
          Back to Home
        </Link>

        <Card className="border-border shadow-2xl bg-card/60 backdrop-blur-2xl">
          <CardHeader className="space-y-1 flex flex-col items-center text-center pb-1 pt-5">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{
                type: "spring",
                stiffness: 260,
                damping: 20,
                delay: 0.2,
              }}
              className="mb-3 overflow-hidden"
            >
              <Image
                src="/logo.png"
                alt="Logo"
                width={150}
                height={58}
                className="object-contain"
                style={{ filter: "var(--logo-filter)", height: "auto" }}
              />
            </motion.div>

            {userCount === 0 && (
              <>
                <CardTitle className="text-xl font-bold mt-2">
                  No Local Accounts Found
                </CardTitle>
                <CardDescription className="text-muted-foreground mt-2">
                  This device hasn't been set up yet. Would you like to create a
                  new store or restore from a backup?
                </CardDescription>
              </>
            )}
          </CardHeader>

          {userCount === 0 ? (
            <CardContent className="flex flex-col space-y-3 pt-4 pb-6">
              <Link href="/setup?from=login">
                <Button className="w-full h-11 text-base font-bold shadow-lg">
                  Setup New Store
                </Button>
              </Link>
              <Link href="/setup?step=backup&from=login">
                <Button
                  variant="outline"
                  className="w-full h-11 text-base font-bold"
                >
                  Restore from Backup
                </Button>
              </Link>
              <div className="pt-2 text-center font-semibold text-xs text-muted-foreground">
                Already have a cloud account?{" "}
                <Link
                  href="/setup?step=cloud&from=login"
                  className="underline hover:text-primary transition-colors"
                >
                  Sync Now
                </Link>
              </div>
            </CardContent>
          ) : recentUsers.length > 0 && !showTraditionalLogin ? (
            <CardContent className="pt-1 pb-6 px-6">
              <LockScreen
                recentUsers={recentUsers}
                onLoginAsOther={() => setShowTraditionalLogin(true)}
              />
            </CardContent>
          ) : (
            <form onSubmit={handleLogin}>
              <CardContent className="space-y-3 pt-4">
                <div className="space-y-1.5">
                  <Label htmlFor="username">Username</Label>
                  <div className="relative group">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                    <Input
                      id="username"
                      placeholder="admin"
                      className="pl-10 bg-background/50 border-border focus:border-primary/50 focus:ring-primary/20 transition-all lowercase"
                      value={username}
                      onChange={(e) => setUsername(e.target.value.toLowerCase())}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pin">PIN</Label>
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

                <div className="pt-1 text-center text-xs text-muted-foreground flex flex-col items-center gap-1">
                  <span>Moving from another device?</span>
                  <div className="flex items-center gap-2">
                    <Link
                      href="/setup?step=backup&from=login"
                      className="font-semibold hover:underline hover:text-primary transition-colors"
                    >
                      Restore from Backup
                    </Link>
                    <span>•</span>
                    <Link
                      href="/setup?step=cloud&from=login"
                      className="font-semibold hover:underline hover:text-primary transition-colors"
                    >
                      Sync from Cloud
                    </Link>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex flex-col space-y-4 pt-4 pb-6">
                <Button
                  type="submit"
                  className="w-full h-11 text-base font-bold shadow-lg active:scale-[0.98]"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  ) : (
                    "Authorize Entry"
                  )}
                </Button>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-widest">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  System Online • Encrypted Session
                </div>
                <div className="flex justify-center w-full mt-2 border-t border-border pt-3">
                  <span className="text-[10px] text-muted-foreground font-medium">
                    v{APP_VERSION}
                  </span>
                </div>
              </CardFooter>
            </form>
          )}
        </Card>

        {userCount > 0 && (
          <div className="mt-4 flex items-center justify-center gap-2 text-xs font-medium text-muted-foreground/60 uppercase tracking-widest">
            <Lock className="w-3 h-3" />
            Terminal Access • Secure Login
          </div>
        )}
      </motion.div>
    </div>
  );
}
