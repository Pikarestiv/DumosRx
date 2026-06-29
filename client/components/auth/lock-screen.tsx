"use client";

import { useState } from "react";
import { RecentUser } from "@/lib/context/auth-context";
import { getUserInitials, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Lock, ArrowLeft, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { PinPad } from "@/components/ui/pin-pad";
import { useAuth } from "@/lib/context/auth-context";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface LockScreenProps {
  recentUsers: RecentUser[];
  onLoginAsOther: () => void;
  onUnlockSuccess?: () => void;
}

export function LockScreen({ recentUsers, onLoginAsOther, onUnlockSuccess }: LockScreenProps) {
  const [selectedUser, setSelectedUser] = useState<RecentUser | null>(null);
  const [pin, setPin] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    setIsLoading(true);
    try {
      const success = await login(selectedUser.username, pin);
      if (success) {
        toast.success(`Welcome back, ${selectedUser.first_name}!`);
        if (onUnlockSuccess) {
          onUnlockSuccess();
        } else {
          router.push("/dashboard");
        }
      } else {
        toast.error("Invalid PIN. Please try again.");
      }
    } catch {
      toast.error("Login failed. Database might not be initialized.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full">
      <AnimatePresence mode="wait">
        {!selectedUser ? (
          <motion.div
            key="grid"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="text-center space-y-1.5 pb-2">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                Welcome Back
              </h2>
              <p className="text-sm text-muted-foreground font-medium">
                Select an account to access the register
              </p>
            </div>

            <div className={cn("grid gap-4", recentUsers.length === 1 ? "grid-cols-1 max-w-[240px] mx-auto" : "grid-cols-2")}>
              {recentUsers.map((user) => (
                <button
                  key={user.id}
                  onClick={() => setSelectedUser(user)}
                  className="group relative flex h-auto flex-col items-center justify-center gap-3 rounded-2xl border border-border/50 bg-card p-5 text-center shadow-sm transition-all duration-300 hover:border-primary/40 hover:bg-primary/5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2"
                >
                  <Avatar className="h-14 w-14 shadow-sm transition-transform duration-300 group-hover:scale-105 group-hover:shadow-md">
                    <AvatarFallback className="bg-primary/10 text-primary text-lg font-medium">
                      {getUserInitials(user.first_name, user.last_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="w-full space-y-1">
                    <p className="truncate text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                      {user.first_name} {user.last_name}
                    </p>
                    <p className="truncate text-xs font-medium text-muted-foreground capitalize">
                      {user.role.replace(/_/g, " ")}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            <div className="pt-6 flex justify-center">
              <button
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                onClick={onLoginAsOther}
              >
                Log in as someone else
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="pin"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-6"
          >
            <div className="flex flex-col items-center space-y-5 pb-2">
              <Avatar className="h-16 w-16 shadow-md ring-1 ring-border/50">
                <AvatarFallback className="bg-primary/10 text-primary text-xl font-medium">
                  {getUserInitials(selectedUser.first_name, selectedUser.last_name)}
                </AvatarFallback>
              </Avatar>
              <div className="text-center space-y-1.5">
                <h2 className="text-xl font-semibold text-foreground">
                  Welcome back, {selectedUser.first_name}
                </h2>
                <p className="text-sm font-medium text-muted-foreground">
                  Enter your PIN to unlock
                </p>
              </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pin" className="sr-only">
                  PIN
                </Label>
                  <div className="flex justify-center mb-6">
                    <InputOTP
                      maxLength={4}
                      value={pin}
                      onChange={(value) => {
                        setPin(value);
                      }}
                      onComplete={() => {
                        // We don't auto-submit here because handleLogin expects an event, 
                        // but we can simulate it or just let the button do it.
                      }}
                      autoFocus
                      // Use inputMode none on mobile to prevent native keyboard from showing,
                      // and numeric on desktop
                      className="md:input-mode-numeric"
                      containerClassName="gap-2"
                    >
                      <InputOTPGroup className="gap-3">
                        <InputOTPSlot index={0} className="w-14 h-16 text-2xl font-semibold rounded-xl border border-border/60 shadow-sm transition-all focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary" />
                        <InputOTPSlot index={1} className="w-14 h-16 text-2xl font-semibold rounded-xl border border-border/60 shadow-sm transition-all focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary" />
                        <InputOTPSlot index={2} className="w-14 h-16 text-2xl font-semibold rounded-xl border border-border/60 shadow-sm transition-all focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary" />
                        <InputOTPSlot index={3} className="w-14 h-16 text-2xl font-semibold rounded-xl border border-border/60 shadow-sm transition-all focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary" />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  
                  {/* Custom Pin Pad specifically for touch/mobile devices */}
                  <div className="md:hidden mt-6 mb-4">
                    <PinPad 
                      value={pin} 
                      onChange={setPin} 
                      maxLength={4}
                    />
                  </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-lg border-border/60 font-medium hover:bg-muted/50"
                  onClick={() => {
                    setSelectedUser(null);
                    setPin("");
                  }}
                  disabled={isLoading}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button
                  type="submit"
                  className="h-11 rounded-lg font-medium shadow-sm transition-all hover:shadow-md"
                  disabled={isLoading || pin.length < 4}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Unlock"
                  )}
                </Button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
