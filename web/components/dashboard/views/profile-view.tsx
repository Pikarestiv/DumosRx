"use client";

import { useState, useEffect } from "react";
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
  User,
  Lock,
  Key,
  Shield,
  Save,
  Loader2,
  Phone,
  Mail,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useDashboard } from "@/app/dashboard/use-dashboard";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { webApiClient } from "@/lib/api/client";

export function ProfileView() {
  const { user } = useDashboard();
  const queryClient = useQueryClient();

  const [profileData, setProfileData] = useState({
    first_name: "",
    last_name: "",
    phone: "",
  });

  const [pinData, setPinData] = useState({
    pin: "",
  });

  const [passwordData, setPasswordData] = useState({
    current_password: "",
    new_password: "",
    new_password_confirmation: "",
  });

  useEffect(() => {
    if (user) {
       
      setProfileData({
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        phone: user.phone || "",
      });
    }
  }, [user]);

  const profileMutation = useMutation({
    mutationFn: (data: typeof profileData) => webApiClient.updateProfile(data),
    onSuccess: () => {
      toast.success("Profile updated successfully");
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to update profile");
    },
  });

  const pinMutation = useMutation({
    mutationFn: (pin: string) => webApiClient.setPin(pin),
    onSuccess: () => {
      toast.success("Security PIN updated successfully");
      setPinData({ pin: "" });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to update PIN");
    },
  });

  const passwordMutation = useMutation({
    mutationFn: (data: typeof passwordData) =>
      webApiClient.changePassword(data),
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

  const handleUpdateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    profileMutation.mutate(profileData);
  };

  const handleUpdatePin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinData.pin.length !== 4) {
      toast.error("PIN must be 4 digits");
      return;
    }
    pinMutation.mutate(pinData.pin);
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordData.new_password !== passwordData.new_password_confirmation) {
      toast.error("Passwords do not match");
      return;
    }
    passwordMutation.mutate(passwordData);
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-12">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Account Settings</h2>
        <p className="text-muted-foreground">
          Manage your profile, security settings, and terminal access.
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        {/* Profile Information */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Card className="h-full bg-card/50 backdrop-blur-sm border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                Profile Details
              </CardTitle>
              <CardDescription>
                Update your personal information used across the platform.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleUpdateProfile}>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="first_name">First Name</Label>
                    <Input
                      id="first_name"
                      value={profileData.first_name}
                      onChange={(e) =>
                        setProfileData({
                          ...profileData,
                          first_name: e.target.value,
                        })
                      }
                      placeholder="John"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="last_name">Last Name</Label>
                    <Input
                      id="last_name"
                      value={profileData.last_name}
                      onChange={(e) =>
                        setProfileData({
                          ...profileData,
                          last_name: e.target.value,
                        })
                      }
                      placeholder="Doe"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address (Primary)</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      value={user?.email || ""}
                      disabled
                      className="pl-10 opacity-70 cursor-not-allowed"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="phone"
                      value={profileData.phone}
                      onChange={(e) =>
                        setProfileData({
                          ...profileData,
                          phone: e.target.value,
                        })
                      }
                      placeholder="+234..."
                      className="pl-10"
                    />
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  type="submit"
                  className="w-full mt-4"
                  disabled={profileMutation.isPending}
                >
                  {profileMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save Changes
                </Button>
              </CardFooter>
            </form>
          </Card>
        </motion.div>

        {/* Terminal PIN */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <Card className="h-full bg-card/50 backdrop-blur-sm border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Terminal Security
              </CardTitle>
              <CardDescription>
                Set a 4-digit PIN for quick access to the Desktop/Mobile app.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleUpdatePin}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="pin">Security PIN (4 Digits)</Label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="pin"
                      type="password"
                      maxLength={4}
                      value={pinData.pin}
                      onChange={(e) =>
                        setPinData({ pin: e.target.value.replace(/\D/g, "") })
                      }
                      placeholder="1234"
                      className="pl-10 tracking-[1em] font-mono text-lg"
                      required
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground italic mt-1">
                    This PIN allows you to log in to offline terminals without
                    your full password.
                  </p>
                </div>
              </CardContent>
              <CardFooter className="pt-6">
                <Button
                  type="submit"
                  variant="secondary"
                  className="w-full"
                  disabled={pinMutation.isPending}
                >
                  {pinMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Lock className="mr-2 h-4 w-4" />
                  )}
                  Update Security PIN
                </Button>
              </CardFooter>
            </form>
          </Card>
        </motion.div>

        {/* Password Change */}
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
      </div>
    </div>
  );
}
