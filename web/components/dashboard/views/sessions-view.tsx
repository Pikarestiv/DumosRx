"use client";

import { useState } from "react";
import { useSessions, useRevokeSessionMutation, useRevokeAllSessionsMutation } from "@/lib/api/hooks";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Monitor, Smartphone, Globe, Loader2, LogOut, Laptop, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

export function SessionsView() {
  const { data: sessions, isLoading } = useSessions();
  const revokeMutation = useRevokeSessionMutation();
  const revokeAllMutation = useRevokeAllSessionsMutation();
  const [visibleCount, setVisibleCount] = useState(5);

  const handleRevoke = (id: string) => {
    revokeMutation.mutate(id, {
      onSuccess: () => toast.success("Session revoked successfully"),
      onError: () => toast.error("Failed to revoke session"),
    });
  };

  const handleRevokeAll = () => {
    revokeAllMutation.mutate(undefined, {
      onSuccess: () => toast.success("All other sessions revoked"),
      onError: () => toast.error("Failed to revoke sessions"),
    });
  };

  const getDeviceIcon = (userAgent: string) => {
    if (!userAgent) return <Globe className="h-5 w-5" />;
    const ua = userAgent.toLowerCase();
    if (ua.includes("mobile") || ua.includes("android") || ua.includes("iphone")) {
      return <Smartphone className="h-5 w-5" />;
    }
    if (ua.includes("mac") || ua.includes("windows") || ua.includes("linux")) {
      return <Laptop className="h-5 w-5" />;
    }
    return <Monitor className="h-5 w-5" />;
  };

  const parseDeviceName = (userAgent: string) => {
    if (!userAgent) return "Unknown Device";
    
    // Simple naive parser
    let os = "Unknown OS";
    if (userAgent.includes("Windows NT 10.0")) os = "Windows 10/11";
    else if (userAgent.includes("Windows NT")) os = "Windows";
    else if (userAgent.includes("Mac OS X")) os = "macOS";
    else if (userAgent.includes("Android")) os = "Android";
    else if (userAgent.includes("iPhone")) os = "iOS";
    else if (userAgent.includes("Linux")) os = "Linux";

    let browser = "Unknown Browser";
    if (userAgent.includes("Chrome") && !userAgent.includes("Edg")) browser = "Chrome";
    else if (userAgent.includes("Safari") && !userAgent.includes("Chrome")) browser = "Safari";
    else if (userAgent.includes("Firefox")) browser = "Firefox";
    else if (userAgent.includes("Edg")) browser = "Edge";

    return `${browser} on ${os}`;
  };

  const visibleSessions = sessions?.slice(0, visibleCount) || [];
  const hasMore = sessions && sessions.length > visibleCount;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.25 }}
      className="md:col-span-2"
    >
      <Card className="bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="h-5 w-5 text-primary" />
              Active Sessions
            </CardTitle>
            <CardDescription>
              Manage devices currently logged into your DumosRx account.
            </CardDescription>
          </div>
          {sessions && sessions.length > 1 && (
            <Button 
              variant="outline" 
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={handleRevokeAll}
              disabled={revokeAllMutation.isPending}
            >
              {revokeAllMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LogOut className="h-4 w-4 mr-2" />}
              Log out of all other devices
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : sessions?.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No active sessions found.</p>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-border/50 divide-y divide-border/50 overflow-hidden bg-background/50">
                  {visibleSessions.map((session) => (
                    <div key={session.id} className="p-4 flex items-center justify-between gap-4 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                          {getDeviceIcon(session.user_agent || "")}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-sm text-foreground">
                              {parseDeviceName(session.user_agent || "")}
                            </p>
                            {session.is_current && (
                              <span className="inline-flex items-center whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] sm:text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                                Current Device
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {session.ip_address || "Unknown IP"} • Last active: {session.last_used_at || session.created_at ? new Date(session.last_used_at || session.created_at || "").toLocaleString() : "Unknown"}
                          </p>
                        </div>
                      </div>
                      {!session.is_current && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRevoke(session.id)}
                          disabled={revokeMutation.isPending}
                          className="text-muted-foreground hover:text-red-600"
                        >
                          Log out
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
                
                {hasMore && (
                  <Button 
                    variant="ghost" 
                    className="w-full text-muted-foreground" 
                    onClick={() => setVisibleCount(prev => prev + 5)}
                  >
                    <ChevronDown className="h-4 w-4 mr-2" />
                    Show More ({sessions.length - visibleCount} remaining)
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
