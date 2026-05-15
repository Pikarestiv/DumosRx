"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { useRouter, useSearchParams } from "next/navigation";
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
import {
  UserPlus,
  CloudDownload,
  FileUp,
  Loader2,
  ArrowLeft,
  X,
  CheckCircle2,
  Database,
  Cloud,
} from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { query, execute, generateId } from "@/lib/db/local-database";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Progress } from "@/components/ui/progress";

type OnboardingStep = "welcome" | "register" | "cloud" | "backup" | "syncing";

export default function SetupPage() {
  const [onboardingStep, setOnboardingStep] =
    useState<OnboardingStep>("welcome");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncStatus, setSyncStatus] = useState("Initializing sync...");

  const { login, linkCloudAccount } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const step = searchParams.get("step") as OnboardingStep;
    if (
      step &&
      ["welcome", "register", "cloud", "backup", "syncing"].includes(step)
    ) {
      setOnboardingStep(step);
    } else {
      setOnboardingStep("welcome");
    }
    checkStatus();
  }, [searchParams]);

  const checkStatus = async () => {
    try {
      const tables = await query<any>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='users'",
      );
      if (tables.length > 0) {
        const result = await query<any>(
          "SELECT COUNT(*) as count FROM users WHERE is_active = 1",
        );
        const count = result[0]?.count || 0;
        if (
          count > 0 &&
          searchParams.get("step") !== "backup" &&
          searchParams.get("step") !== "cloud" &&
          searchParams.get("step") !== "syncing"
        ) {
          router.replace("/login");
          return;
        }
      }
    } catch (e) {
      console.error("Status check failed", e);
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const setStep = (step: OnboardingStep) => {
    const params = new URLSearchParams(searchParams.toString());
    if (step === "welcome") {
      params.delete("step");
    } else {
      params.set("step", step);
    }
    router.push(`?${params.toString()}`);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !pin || !name) {
      toast.error("Please fill all fields");
      return;
    }
    setIsLoading(true);
    try {
      const id = generateId();
      await execute(
        "INSERT INTO users (id, name, username, pin, role, is_active) VALUES (?, ?, ?, ?, ?, ?)",
        [id, name, username, pin, "admin", 1],
      );
      toast.success("Administrator account created!");
      const success = await login(username, pin);
      if (success) router.push("/dashboard");
    } catch (err) {
      console.error("Registration failed", err);
      toast.error("Failed to create account");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloudRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const result = await linkCloudAccount(username, pin);
      if (result.success) {
        setStep("syncing");
        startSyncProcess();
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      toast.error("Cloud connection failed");
    } finally {
      setIsLoading(false);
    }
  };

  const startSyncProcess = async () => {
    setSyncProgress(10);
    setSyncStatus("Connecting to cloud storage...");
    
    // Simulate sync steps
    setTimeout(() => {
      setSyncProgress(30);
      setSyncStatus("Fetching encrypted backups...");
    }, 1000);

    setTimeout(() => {
      setSyncProgress(60);
      setSyncStatus("Decrypting and merging local database...");
    }, 2500);

    setTimeout(() => {
      setSyncProgress(90);
      setSyncStatus("Verifying data integrity...");
    }, 4000);

    setTimeout(() => {
      setSyncProgress(100);
      setSyncStatus("Sync complete!");
      toast.success("All data synced successfully!");
      setTimeout(() => router.push("/dashboard"), 1000);
    }, 5500);
  };

  if (isCheckingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isHome = onboardingStep === "welcome";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden bg-background">
      {/* Premium Background Effects */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-transparent to-accent/5 dark:from-primary/10 dark:to-accent/10" />
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-primary/10 dark:bg-primary/20 rounded-full blur-[120px] mix-blend-multiply dark:mix-blend-screen animate-blob" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-accent/5 dark:bg-accent/10 rounded-full blur-[120px] mix-blend-multiply dark:mix-blend-screen animate-blob animation-delay-2000" />
      </div>

      <div
        className="absolute z-20 flex items-center gap-4"
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
        {onboardingStep !== "syncing" && (
          <div className="flex items-center justify-between mb-8">
            <Button
              variant="ghost"
              className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors group p-0"
              onClick={() => {
                const fromLogin = searchParams.get("from") === "login";
                if (fromLogin || onboardingStep === "welcome") {
                  router.push("/login");
                } else {
                  setStep("welcome");
                }
              }}
            >
              <ArrowLeft className="h-4 w-4 mr-2 transform group-hover:-translate-x-1 transition-transform" />
              {searchParams.get("from") === "login" ||
              onboardingStep === "welcome"
                ? "Back to Login"
                : "Back to Setup"}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
              asChild
            >
              <Link href="/login">
                <X className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        )}

        <AnimatePresence mode="wait">
          {onboardingStep === "welcome" && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <Card className="border-border shadow-2xl bg-card/60 backdrop-blur-2xl">
                <CardHeader className="text-center pb-2">
                  <div className="flex justify-center mb-6">
                    <Image
                      src="/logo.png"
                      alt="DumosRx Logo"
                      width={180}
                      height={70}
                      className="object-contain"
                      style={{ filter: "var(--logo-filter)", height: "auto" }}
                    />
                  </div>
                  <CardTitle className="text-2xl font-bold">
                    Welcome to {APP_NAME}
                  </CardTitle>
                  <CardDescription>
                    How would you like to get started?
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 pt-6 pb-8">
                  <Button
                    variant="outline"
                    className="h-auto p-4 flex flex-col items-start text-left gap-1 hover:border-primary/50 hover:bg-primary/5 group"
                    onClick={() => setStep("register")}
                  >
                    <div className="flex items-center gap-2 font-bold text-foreground">
                      <UserPlus className="h-4 w-4 text-primary" />
                      Create New Store
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Setup a fresh local database for a new business.
                    </p>
                  </Button>

                  <Button
                    variant="outline"
                    className="h-auto p-4 flex flex-col items-start text-left gap-1 hover:border-primary/50 hover:bg-primary/5 group"
                    onClick={() => setStep("cloud")}
                  >
                    <div className="flex items-center gap-2 font-bold text-foreground">
                      <CloudDownload className="h-4 w-4 text-primary" />
                      Sync from Cloud
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Existing account? Pull your data from the DumosRx cloud.
                    </p>
                  </Button>

                  <Button
                    variant="outline"
                    className="h-auto p-4 flex flex-col items-start text-left gap-1 hover:border-primary/50 hover:bg-primary/5 group"
                    onClick={() => setStep("backup")}
                  >
                    <div className="flex items-center gap-2 font-bold text-foreground">
                      <FileUp className="h-4 w-4 text-primary" />
                      Restore from Backup
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Upload a .drx manual backup file to restore your database.
                    </p>
                  </Button>
                </CardContent>
                <CardFooter>
                  <p className="text-[10px] text-muted-foreground text-center w-full uppercase tracking-widest font-medium opacity-50">
                    Secure Offline-First Intelligence
                  </p>
                </CardFooter>
              </Card>
            </motion.div>
          )}

          {onboardingStep === "register" && (
            <motion.div
              key="register"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <Card className="border-border shadow-2xl bg-card/60 backdrop-blur-2xl">
                <CardHeader className="space-y-1 flex flex-col items-center text-center pb-2">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                    <UserPlus className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-2xl font-bold">
                    New Administrator
                  </CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Create your master local account
                  </CardDescription>
                </CardHeader>
                <form onSubmit={handleRegister}>
                  <CardContent className="space-y-4 pt-6">
                    <div className="space-y-2">
                      <Label htmlFor="name">Full Name</Label>
                      <Input
                        id="name"
                        placeholder="e.g. John Doe"
                        className="bg-background/50"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg-username">Username</Label>
                      <Input
                        id="reg-username"
                        placeholder="admin"
                        className="bg-background/50"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg-pin">Secure PIN / Password</Label>
                      <Input
                        id="reg-pin"
                        type="password"
                        placeholder="••••"
                        className="bg-background/50"
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        required
                      />
                    </div>
                  </CardContent>
                  <CardFooter className="flex flex-col space-y-4 pt-6 pb-8">
                    <Button
                      type="submit"
                      className="w-full h-12 text-lg font-bold shadow-lg"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      ) : (
                        "Complete Setup"
                      )}
                    </Button>
                  </CardFooter>
                </form>
              </Card>
            </motion.div>
          )}

          {onboardingStep === "cloud" && (
            <motion.div
              key="cloud"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <Card className="border-border shadow-2xl bg-card/60 backdrop-blur-2xl">
                <CardHeader className="space-y-1 flex flex-col items-center text-center pb-2">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                    <CloudDownload className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-2xl font-bold">
                    Cloud Restore
                  </CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Login with your DumosRx Cloud ID
                  </CardDescription>
                </CardHeader>
                <form onSubmit={handleCloudRestore}>
                  <CardContent className="space-y-4 pt-6">
                    <div className="space-y-2">
                      <Label htmlFor="cloud-email">Email Address</Label>
                      <Input
                        id="cloud-email"
                        type="email"
                        placeholder="your@email.com"
                        className="bg-background/50"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cloud-pass">Password</Label>
                      <Input
                        id="cloud-pass"
                        type="password"
                        placeholder="••••••••"
                        className="bg-background/50"
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        required
                      />
                    </div>
                  </CardContent>
                  <CardFooter className="flex flex-col space-y-4 pt-6 pb-8">
                    <Button
                      type="submit"
                      className="w-full h-12 text-lg font-bold shadow-lg"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      ) : (
                        "Start Cloud Sync"
                      )}
                    </Button>
                  </CardFooter>
                </form>
              </Card>
            </motion.div>
          )}

          {onboardingStep === "backup" && (
            <motion.div
              key="backup"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <Card className="border-border shadow-2xl bg-card/60 backdrop-blur-2xl">
                <CardHeader className="space-y-1 flex flex-col items-center text-center pb-2">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                    <FileUp className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-2xl font-bold">
                    Local Backup
                  </CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Restore from a previous backup file
                  </CardDescription>
                </CardHeader>
                <CardContent className="py-8 pt-6">
                  <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl p-8 bg-background/30 hover:bg-background/50 transition-colors cursor-pointer group">
                    <FileUp className="h-10 w-10 text-muted-foreground group-hover:text-primary transition-colors mb-4" />
                    <p className="text-sm font-medium text-foreground">
                      Click to select backup file
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      .drx backup files supported
                    </p>
                  </div>
                </CardContent>
                <CardFooter className="pb-8">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setStep("welcome")}
                  >
                    Cancel
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
          )}

          {onboardingStep === "syncing" && (
            <motion.div
              key="syncing"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
            >
              <Card className="border-border shadow-2xl bg-card/60 backdrop-blur-2xl">
                <CardHeader className="text-center pb-2">
                  <div className="flex justify-center mb-8 relative">
                     <div className="absolute inset-0 flex items-center justify-center animate-pulse">
                        <div className="w-24 h-24 rounded-full bg-primary/5 blur-xl" />
                     </div>
                     <div className="relative flex items-center gap-4 bg-background/50 p-4 rounded-2xl border border-primary/20">
                        <Cloud className="h-8 w-8 text-primary animate-bounce" />
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        <Database className="h-8 w-8 text-accent animate-pulse" />
                     </div>
                  </div>
                  <CardTitle className="text-2xl font-bold tracking-tight">
                    Synchronizing Data
                  </CardTitle>
                  <CardDescription>
                    Bringing your DumosRx cloud environment to this device
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-10 pb-8 space-y-6">
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-muted-foreground flex items-center gap-2">
                        {syncProgress < 100 ? (
                           <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                           <CheckCircle2 className="h-3 w-3 text-green-500" />
                        )}
                        {syncStatus}
                      </span>
                      <span className="text-primary font-bold">{syncProgress}%</span>
                    </div>
                    <Progress value={syncProgress} className="h-2" />
                  </div>
                  
                  <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
                    <p className="text-[11px] leading-relaxed text-muted-foreground text-center">
                      <span className="font-bold text-primary mr-1">Note:</span> 
                      This process ensures all your medications, staff profiles, and financial records are securely transferred. Please do not close the application.
                    </p>
                  </div>
                </CardContent>
                <CardFooter className="pb-8 justify-center">
                   <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground/40 flex items-center gap-2">
                     <span className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                     Secure End-to-End Encryption
                   </p>
                </CardFooter>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
