"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { webApiClient } from "@/lib/api/client";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Shield, Key, Save, Loader2, Lock, Edit2, X, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function SecuritySettings() {
  const [isEditingPassword, setIsEditingPassword] = useState(false);
  const [isEditingPin, setIsEditingPin] = useState(false);

  const [passwordData, setPasswordData] = useState({
    current_password: "",
    new_password: "",
    new_password_confirmation: "",
  });

  const [pinData, setPinData] = useState({
    pin: "",
  });

  const passwordMutation = useMutation({
    mutationFn: (data: typeof passwordData) => webApiClient.changePassword(data),
    onSuccess: () => {
      toast.success("Password changed successfully");
      setPasswordData({ current_password: "", new_password: "", new_password_confirmation: "" });
      setIsEditingPassword(false);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to change password");
    },
  });

  const pinMutation = useMutation({
    mutationFn: (pin: string) => webApiClient.setPin(pin),
    onSuccess: () => {
      toast.success("Security PIN updated successfully");
      setPinData({ pin: "" });
      setIsEditingPin(false);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to update PIN");
    },
  });

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordData.new_password !== passwordData.new_password_confirmation) {
      toast.error("Passwords do not match");
      return;
    }
    passwordMutation.mutate(passwordData);
  };

  const handleUpdatePin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinData.pin.length !== 4) {
      toast.error("PIN must be 4 digits");
      return;
    }
    pinMutation.mutate(pinData.pin);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="md:col-span-2"
    >
      <Card className="bg-card/50 backdrop-blur-sm border-border/50 overflow-hidden">
        <CardHeader className="bg-muted/10 border-b border-border/50 pb-6">
          <CardTitle className="flex items-center gap-2 text-2xl">
            <Shield className="h-6 w-6 text-primary" />
            Security & Access Credentials
          </CardTitle>
          <CardDescription className="text-base mt-2">
            Manage your credentials for the Cloud Dashboard and Local Applications.
          </CardDescription>
        </CardHeader>
        
        <CardContent className="p-0 divide-y divide-border/50">
          {/* PASSWORD SECTION */}
          <div className="p-6 md:p-8">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Lock className="h-4 w-4 text-primary" /> Cloud Account Password
                </h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                  Used to log into the DumosRx web dashboard from any browser. It protects your entire account, billing, and subscription details.
                </p>
              </div>
              {!isEditingPassword ? (
                <Button variant="outline" size="sm" onClick={() => setIsEditingPassword(true)}>
                  <Edit2 className="mr-2 h-4 w-4" /> Change Password
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setIsEditingPassword(false)}>
                  <X className="mr-2 h-4 w-4" /> Cancel
                </Button>
              )}
            </div>

            {!isEditingPassword ? (
              <div className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-muted/30 rounded-xl border border-border/50 gap-2">
                <div className="text-2xl tracking-[0.3em] sm:tracking-[0.5em] font-mono text-muted-foreground pt-2">
                  ••••••••
                </div>
                <div className="text-sm text-muted-foreground">
                  Last changed: N/A
                </div>
              </div>
            ) : (
              <form onSubmit={handleChangePassword} className="bg-muted/20 p-6 rounded-2xl border border-border/50">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="current_password">Current Password</Label>
                    <Input
                      id="current_password"
                      type="password"
                      value={passwordData.current_password}
                      onChange={(e) => setPasswordData({ ...passwordData, current_password: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new_password">New Password</Label>
                    <Input
                      id="new_password"
                      type="password"
                      value={passwordData.new_password}
                      onChange={(e) => setPasswordData({ ...passwordData, new_password: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm_password">Confirm New Password</Label>
                    <Input
                      id="confirm_password"
                      type="password"
                      value={passwordData.new_password_confirmation}
                      onChange={(e) => setPasswordData({ ...passwordData, new_password_confirmation: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="mt-6 flex justify-end">
                  <Button type="submit" disabled={passwordMutation.isPending}>
                    {passwordMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Update Password
                  </Button>
                </div>
              </form>
            )}
          </div>

          {/* PIN SECTION */}
          <div className="p-6 md:p-8 bg-muted/5">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
              <div>
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Key className="h-4 w-4 text-primary" /> Terminal Security PIN
                </h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                  A quick 4-digit code used <strong>only on the offline Desktop and Mobile apps</strong>. It replaces your complex password for fast, daily access by cashiers and staff on authorized devices.
                </p>
              </div>
              {!isEditingPin ? (
                <Button variant="outline" size="sm" onClick={() => setIsEditingPin(true)}>
                  <Edit2 className="mr-2 h-4 w-4" /> Change PIN
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setIsEditingPin(false)}>
                  <X className="mr-2 h-4 w-4" /> Cancel
                </Button>
              )}
            </div>

            {!isEditingPin ? (
              <div className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-muted/30 rounded-xl border border-border/50 gap-2">
                <div className="text-3xl tracking-[0.3em] sm:tracking-[0.5em] font-mono text-muted-foreground pt-3">
                  ••••
                </div>
                <div className="text-sm text-muted-foreground">
                  Active
                </div>
              </div>
            ) : (
              <form onSubmit={handleUpdatePin} className="bg-muted/20 p-6 rounded-2xl border border-border/50">
                <div className="max-w-xs space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="pin">New 4-Digit PIN</Label>
                    <div className="relative">
                      <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="pin"
                        type="password"
                        maxLength={4}
                        value={pinData.pin}
                        onChange={(e) => setPinData({ pin: e.target.value.replace(/\D/g, "") })}
                        placeholder="e.g. 1234"
                        className="pl-10 tracking-widest text-lg font-mono"
                        required
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={pinMutation.isPending || pinData.pin.length !== 4}>
                    {pinMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save Terminal PIN
                  </Button>
                </div>
                
                <Alert className="mt-6 bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400">
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Changing your Terminal PIN here will instantly sync to all your connected offline apps during their next handshake.
                  </AlertDescription>
                </Alert>
              </form>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
