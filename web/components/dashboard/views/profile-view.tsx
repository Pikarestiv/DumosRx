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
  Edit2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useDashboard } from "@/app/dashboard/use-dashboard";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { webApiClient } from "@/lib/api/client";
import { SecuritySettings } from "@/components/dashboard/views/security-settings";
import { SessionsView } from "@/components/dashboard/views/sessions-view";
import { DangerZoneCard } from "@/components/dashboard/views/danger-zone-card";

export function ProfileView() {
  const { user } = useDashboard();
  const queryClient = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);
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
  }, [user, isEditing]);

  const profileMutation = useMutation({
    mutationFn: (data: typeof profileData) => webApiClient.updateProfile(data),
    onSuccess: () => {
      toast.success("Profile updated successfully");
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      setIsEditing(false);
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
          className="md:col-span-2"
        >
          <Card className="h-full bg-card/50 backdrop-blur-sm border-border/50">
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5 text-primary" />
                  Profile Details
                </CardTitle>
                <CardDescription className="mt-1">
                  Your personal information used across the platform.
                </CardDescription>
              </div>
              {!isEditing ? (
                <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                  <Edit2 className="mr-2 h-4 w-4" />
                  Edit Profile
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
              )}
            </CardHeader>
            
            {!isEditing ? (
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-muted/30 p-6 rounded-2xl border border-border/50">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">First Name</p>
                    <p className="text-lg font-semibold">{user?.first_name || "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Last Name</p>
                    <p className="text-lg font-semibold">{user?.last_name || "N/A"}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-2">
                      <Mail className="h-4 w-4" /> Email Address
                    </p>
                    <p className="text-lg font-semibold">{user?.email}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-2">
                      <Phone className="h-4 w-4" /> Phone Number
                    </p>
                    <p className="text-lg font-semibold">{user?.phone || "N/A"}</p>
                  </div>
                </div>
              </CardContent>
            ) : (
              <form onSubmit={handleUpdateProfile}>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="first_name">First Name</Label>
                      <Input
                        id="first_name"
                        value={profileData.first_name}
                        onChange={(e) =>
                          setProfileData({ ...profileData, first_name: e.target.value })
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
                          setProfileData({ ...profileData, last_name: e.target.value })
                        }
                        placeholder="Doe"
                        required
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="email"
                          value={user?.email || ""}
                          disabled
                          className="pl-10 opacity-70 cursor-not-allowed"
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground">Emails cannot be changed.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone Number</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="phone"
                          value={profileData.phone}
                          onChange={(e) =>
                            setProfileData({ ...profileData, phone: e.target.value })
                          }
                          placeholder="+234..."
                          className="pl-10"
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="bg-muted/10 border-t border-border/50 pt-6">
                  <Button
                    type="submit"
                    className="ml-auto"
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
            )}
          </Card>
        </motion.div>

        {/* Security Settings (Merged Terminal PIN & Password) */}
        <SecuritySettings />

        {/* Sessions & Devices */}
        <SessionsView />

        {/* Danger Zone */}
        <DangerZoneCard />
      </div>
    </div>
  );
}
