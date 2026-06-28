"use client";

import { useState } from "react";
import { RecentUser } from "@/lib/context/auth-context";
import { getUserInitials } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Lock, ArrowLeft, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold tracking-tight">
                Select your account
              </h2>
              <p className="text-sm text-muted-foreground">
                Choose an account to quickly unlock the register
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {recentUsers.map((user) => (
                <Button
                  key={user.id}
                  variant="outline"
                  className="h-auto p-4 flex flex-col items-center justify-center gap-3 hover:border-2 hover:border-primary hover:bg-primary/5 hover:text-foreground transition-all"
                  onClick={() => setSelectedUser(user)}
                >
                  <Avatar className="h-12 w-12 border-2 border-background shadow-sm">
                    <AvatarFallback className="bg-primary/10 text-primary text-xl font-semibold">
                      {getUserInitials(user.first_name, user.last_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-center w-full overflow-hidden">
                    <p className="font-semibold truncate">
                      {user.first_name} {user.last_name}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize truncate">
                      {user.role.replace(/_/g, " ")}
                    </p>
                  </div>
                </Button>
              ))}
            </div>

            <div className="pt-4 flex justify-center border-t">
              <Button
                variant="ghost"
                className="text-sm"
                onClick={onLoginAsOther}
              >
                Log in as someone else
              </Button>
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
            <div className="flex flex-col items-center space-y-4">
              <Avatar className="h-16 w-16 border-4 border-background shadow-md">
                <AvatarFallback className="bg-primary/10 text-primary text-xl">
                  {getUserInitials(selectedUser.first_name, selectedUser.last_name)}
                </AvatarFallback>
              </Avatar>
              <div className="text-center space-y-1">
                <h2 className="text-xl font-bold">
                  Welcome back, {selectedUser.first_name}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Enter your PIN to unlock
                </p>
              </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pin" className="sr-only">
                  PIN
                </Label>
                <div className="relative group">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input
                    id="pin"
                    type="password"
                    placeholder="••••"
                    className="pl-10 h-12 text-center text-lg tracking-widest bg-background/50 border-border focus:border-primary/50 focus:ring-primary/20 transition-all"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
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
                  className="h-11"
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
