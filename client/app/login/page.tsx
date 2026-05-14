"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, User, Loader2, ArrowLeft, UserPlus, CloudDownload, FileUp, Sparkles, RefreshCw } from "lucide-react";
import { APP_NAME, APP_VERSION } from "@/lib/constants";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { query, execute, generateId } from "@/lib/db/local-database";
import { ThemeToggle } from "@/components/ui/theme-toggle";

type OnboardingStep = "welcome" | "register" | "cloud" | "backup";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isFreshInstall, setIsFreshInstall] = useState<boolean | null>(null);
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>("welcome");
  
  const { login, linkCloudAccount } = useAuth();
  const router = useRouter();

  useEffect(() => {
    checkUsers();
  }, []);

  const checkUsers = async () => {
    try {
      // Check if the table exists first
      const tables = await query<any>("SELECT name FROM sqlite_master WHERE type='table' AND name='users'");
      if (tables.length === 0) {
        setIsFreshInstall(true);
        return;
      }

      const result = await query<any>("SELECT COUNT(*) as count FROM users WHERE is_active = 1");
      const count = result[0]?.count || 0;
      setIsFreshInstall(count === 0);
    } catch (e) {
      console.error("Failed to check users", e);
      // If table doesn't exist, it's a fresh install
      setIsFreshInstall(true);
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
        [id, name, username, pin, "admin", 1]
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
        toast.success("Cloud account linked! Syncing your data...");
        router.push("/dashboard");
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      toast.error("Cloud connection failed");
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
        if (window.confirm(`Version ${update.version} is available. Install now?`)) {
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

  if (isFreshInstall === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden bg-background">
       {/* Background Layer */}
       <div className="absolute inset-0 z-0">
        <Image
          src="/medical_saas_dashboard_bg_1777553049717.png"
          alt="Background"
          fill
          className="object-cover opacity-[0.03] dark:opacity-10 filter blur-[4px]"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/60" />
      </div>

      <div className="absolute z-20" style={{ top: "calc(var(--tauri-top, 0px) + 2rem)", right: "2rem" }}>
        <ThemeToggle />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="w-full max-w-md z-10"
      >
        <Link href="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors group">
          <ArrowLeft className="h-4 w-4 mr-2 transform group-hover:-translate-x-1 transition-transform" />
          Back to Landing
        </Link>

        <AnimatePresence mode="wait">
          {isFreshInstall && onboardingStep === "welcome" ? (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <Card className="border-border shadow-2xl bg-card/60 backdrop-blur-2xl">
                <CardHeader className="text-center">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4 border border-primary/10">
                    <Sparkles className="h-8 w-8 text-primary" />
                  </div>
                  <CardTitle className="text-2xl font-bold">Welcome to {APP_NAME}</CardTitle>
                  <CardDescription>How would you like to get started?</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 pt-4">
                  <Button 
                    variant="outline" 
                    className="h-auto p-4 flex flex-col items-start text-left gap-1 hover:border-primary/50 hover:bg-primary/5"
                    onClick={() => setOnboardingStep("register")}
                  >
                    <div className="flex items-center gap-2 font-bold text-foreground">
                      <UserPlus className="h-4 w-4 text-primary" />
                      Create New Store
                    </div>
                    <p className="text-xs text-muted-foreground">Setup a fresh local database for a new business.</p>
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    className="h-auto p-4 flex flex-col items-start text-left gap-1 hover:border-primary/50 hover:bg-primary/5"
                    onClick={() => setOnboardingStep("cloud")}
                  >
                    <div className="flex items-center gap-2 font-bold text-foreground">
                      <CloudDownload className="h-4 w-4 text-primary" />
                      Sync from Cloud
                    </div>
                    <p className="text-xs text-muted-foreground">Existing account? Pull your data from the DumosRx cloud.</p>
                  </Button>

                  <Button 
                    variant="outline" 
                    className="h-auto p-4 flex flex-col items-start text-left gap-1 hover:border-primary/50 hover:bg-primary/5"
                    onClick={() => setOnboardingStep("backup")}
                  >
                    <div className="flex items-center gap-2 font-bold text-foreground">
                      <FileUp className="h-4 w-4 text-primary" />
                      Restore from Backup
                    </div>
                    <p className="text-xs text-muted-foreground">Upload a manual backup file to restore your database.</p>
                  </Button>
                </CardContent>
                <CardFooter>
                  <p className="text-[10px] text-muted-foreground text-center w-full uppercase tracking-widest font-medium">
                    Secure Offline-First Intelligence
                  </p>
                </CardFooter>
              </Card>
            </motion.div>
          ) : isFreshInstall && onboardingStep === "register" ? (
            <motion.div
              key="register"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <Card className="border-border shadow-2xl bg-card/60 backdrop-blur-2xl">
                <CardHeader className="space-y-1 flex flex-col items-center text-center pb-2">
                  <div className="flex items-center justify-between w-full mb-4">
                    <Button variant="ghost" size="sm" onClick={() => setOnboardingStep("welcome")} className="h-8 w-8 p-0">
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <UserPlus className="h-6 w-6 text-primary" />
                    <div className="w-8" />
                  </div>
                  <CardTitle className="text-2xl font-bold">New Administrator</CardTitle>
                  <CardDescription className="text-muted-foreground">Create your master local account</CardDescription>
                </CardHeader>
                <form onSubmit={handleRegister}>
                  <CardContent className="space-y-4 pt-4">
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
                    <Button type="submit" className="w-full h-12 text-lg font-bold shadow-lg" disabled={isLoading}>
                      {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "Complete Setup"}
                    </Button>
                  </CardFooter>
                </form>
              </Card>
            </motion.div>
          ) : isFreshInstall && onboardingStep === "cloud" ? (
            <motion.div
              key="cloud"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <Card className="border-border shadow-2xl bg-card/60 backdrop-blur-2xl">
                <CardHeader className="space-y-1 flex flex-col items-center text-center pb-2">
                  <div className="flex items-center justify-between w-full mb-4">
                    <Button variant="ghost" size="sm" onClick={() => setOnboardingStep("welcome")} className="h-8 w-8 p-0">
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <CloudDownload className="h-6 w-6 text-primary" />
                    <div className="w-8" />
                  </div>
                  <CardTitle className="text-2xl font-bold">Cloud Restore</CardTitle>
                  <CardDescription className="text-muted-foreground">Login with your DumosRx Cloud ID</CardDescription>
                </CardHeader>
                <form onSubmit={handleCloudRestore}>
                  <CardContent className="space-y-4 pt-4">
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
                    <Button type="submit" className="w-full h-12 text-lg font-bold shadow-lg" disabled={isLoading}>
                      {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "Start Cloud Sync"}
                    </Button>
                  </CardFooter>
                </form>
              </Card>
            </motion.div>
          ) : isFreshInstall && onboardingStep === "backup" ? (
            <motion.div
              key="backup"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <Card className="border-border shadow-2xl bg-card/60 backdrop-blur-2xl">
                <CardHeader className="space-y-1 flex flex-col items-center text-center pb-2">
                  <div className="flex items-center justify-between w-full mb-4">
                    <Button variant="ghost" size="sm" onClick={() => setOnboardingStep("welcome")} className="h-8 w-8 p-0">
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <FileUp className="h-6 w-6 text-primary" />
                    <div className="w-8" />
                  </div>
                  <CardTitle className="text-2xl font-bold">Local Backup</CardTitle>
                  <CardDescription className="text-muted-foreground">Restore from a previous backup file</CardDescription>
                </CardHeader>
                <CardContent className="py-8">
                   <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl p-8 bg-background/30 hover:bg-background/50 transition-colors cursor-pointer group">
                      <FileUp className="h-10 w-10 text-muted-foreground group-hover:text-primary transition-colors mb-4" />
                      <p className="text-sm font-medium text-foreground">Click to select backup file</p>
                      <p className="text-xs text-muted-foreground mt-1">.sql or .db files supported</p>
                   </div>
                </CardContent>
                <CardFooter className="pb-8">
                   <Button variant="outline" className="w-full" onClick={() => setOnboardingStep("welcome")}>
                      Cancel
                   </Button>
                </CardFooter>
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key="login"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <Card className="border-border shadow-2xl bg-card/60 backdrop-blur-2xl">
                <CardHeader className="space-y-1 flex flex-col items-center text-center pb-2">
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.2 }}
                    className="mb-6 overflow-hidden"
                  >
                    <Image src="/logo.png" alt="Logo" width={180} height={70} className="object-contain" style={{ filter: 'var(--logo-filter)' }} />
                  </motion.div>
                  <CardDescription className="text-muted-foreground">Terminal Access • Secure Login</CardDescription>
                </CardHeader>
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
                  </CardContent>
                  <CardFooter className="flex flex-col space-y-6 pt-6 pb-8">
                    <Button type="submit" className="w-full h-12 text-lg font-bold shadow-lg active:scale-[0.98]" disabled={isLoading}>
                      {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "Authorize Entry"}
                    </Button>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-widest">
                      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      System Online • Encrypted Session
                    </div>
                    <div className="flex items-center justify-between w-full mt-4 border-t border-border pt-4">
                      <span className="text-[10px] text-muted-foreground font-medium">v{APP_VERSION}</span>
                      <button 
                        type="button"
                        onClick={handleCheckForUpdates}
                        disabled={isCheckingUpdate}
                        className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors disabled:opacity-50"
                      >
                        <RefreshCw className={`h-3 w-3 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
                        {isCheckingUpdate ? "Checking..." : "Check for Updates"}
                      </button>
                    </div>
                  </CardFooter>
                </form>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
