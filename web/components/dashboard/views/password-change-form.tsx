"use client";

import { useState } from "react";
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
import { Lock, Shield, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import { webApiClient } from "@/lib/api/client";

export function PasswordChangeForm() {
  const [passwordData, setPasswordData] = useState({
    current_password: "",
    new_password: "",
    new_password_confirmation: "",
  });

  const passwordMutation = useMutation({
    mutationFn: (data: typeof passwordData) => webApiClient.changePassword(data),
    onSuccess: () => {
      toast.success("Password changed successfully");
      setPasswordData({
        current_password: "",
        new_password: "",
        new_password_confirmation: "",
      });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to change password");
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className="md:col-span-2"
    >
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            Change Password
          </CardTitle>
          <CardDescription>
            Ensure your cloud account is protected with a strong password.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleChangePassword}>
          <CardContent className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="current_password">Current Password</Label>
              <Input
                id="current_password"
                type="password"
                value={passwordData.current_password}
                onChange={(e) =>
                  setPasswordData({
                    ...passwordData,
                    current_password: e.target.value,
                  })
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new_password">New Password</Label>
              <Input
                id="new_password"
                type="password"
                value={passwordData.new_password}
                onChange={(e) =>
                  setPasswordData({
                    ...passwordData,
                    new_password: e.target.value,
                  })
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm_password">Confirm New Password</Label>
              <Input
                id="confirm_password"
                type="password"
                value={passwordData.new_password_confirmation}
                onChange={(e) =>
                  setPasswordData({
                    ...passwordData,
                    new_password_confirmation: e.target.value,
                  })
                }
                required
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-end border-t border-border/50 pt-6">
            <Button
              type="submit"
              variant="destructive"
              disabled={passwordMutation.isPending}
            >
              {passwordMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Shield className="mr-2 h-4 w-4" />
              )}
              Update Password
            </Button>
          </CardFooter>
        </form>
      </Card>
    </motion.div>
  );
}
