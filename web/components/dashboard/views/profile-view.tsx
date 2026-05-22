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
import { TerminalPinForm } from "@/components/dashboard/views/terminal-pin-form";
import { SessionsView } from "@/components/dashboard/views/sessions-view";
import { PasswordChangeForm } from "@/components/dashboard/views/password-change-form";
import { DangerZoneCard } from "@/components/dashboard/views/danger-zone-card";

export function ProfileView() {
  const { user } = useDashboard();
  const queryClient = useQueryClient();

  const [profileData, setProfileData] = useState({
    first_name: "",
    last_name: "",
    phone: "",
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

  const handleUpdateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    profileMutation.mutate(profileData);
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
        <TerminalPinForm />

        {/* Password Change */}
        <PasswordChangeForm />

        {/* Sessions & Devices */}
        <SessionsView />

        {/* Danger Zone */}
        <DangerZoneCard />
      </div>
    </div>
  );
}
