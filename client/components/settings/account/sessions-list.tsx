"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Monitor, Smartphone, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useSessions, useRevokeSessionMutation, useRevokeAllSessionsMutation } from "@/lib/hooks/use-sessions";
import type { Session } from "@/lib/types/user";

function getDeviceIcon(session: Session) {
  const ua = (session.user_agent || "").toLowerCase();
  if (ua.includes("android") || ua.includes("iphone")) return Smartphone;
  return Monitor;
}

function parseDeviceName(session: Session) {
  // Prefer the device_name supplied at login (e.g. client/'s own "Client App")
  // over UA-sniffing — client's own login already sends a meaningful name,
  // unlike web's, which relies entirely on UA parsing as its only signal.
  if (session.name && session.name.toLowerCase() !== "unknown") return session.name;
  const ua = session.user_agent || "";
  if (!ua) return "Unknown Device";
  let os = "Unknown OS";
  if (ua.includes("Windows NT 10.0")) os = "Windows 10/11";
  else if (ua.includes("Windows NT")) os = "Windows";
  else if (ua.includes("Mac OS X")) os = "macOS";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone")) os = "iOS";
  else if (ua.includes("Linux")) os = "Linux";
  let browser = "Unknown Browser";
  if (ua.includes("Edg")) browser = "Edge";
  else if (ua.includes("Chrome")) browser = "Chrome";
  else if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Safari")) browser = "Safari";
  return `${browser} on ${os}`;
}

export function SessionsList() {
  const { data: sessions = [], isLoading, isError } = useSessions();
  const revokeSession = useRevokeSessionMutation();
  const revokeAll = useRevokeAllSessionsMutation();

  const handleRevoke = async (id: string) => {
    try {
      await revokeSession.mutateAsync(id);
      toast.success("Session revoked");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to revoke session");
    }
  };

  const handleRevokeAll = async () => {
    try {
      await revokeAll.mutateAsync();
      toast.success("Logged out of all other devices");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to log out other devices");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Sessions & Devices</CardTitle>
          <CardDescription>Everywhere you&apos;re currently logged in.</CardDescription>
        </div>
        {sessions.length > 1 && (
          <Button variant="outline" size="sm" onClick={handleRevokeAll} disabled={revokeAll.isPending}>
            {revokeAll.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Log out of all other devices
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {isError && (
          <p className="text-sm text-destructive text-center py-6">
            Failed to load sessions — check your connection and try again.
          </p>
        )}
        {!isLoading && !isError && sessions.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">No active sessions found.</p>
        )}
        {!isLoading &&
          sessions.map((session) => {
            const Icon = getDeviceIcon(session);
            return (
              <div
                key={session.id}
                className="flex items-center justify-between gap-4 rounded-lg border p-3"
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{parseDeviceName(session)}</span>
                      {session.is_current && (
                        <Badge className="h-5 px-1.5 text-[10px] bg-emerald-500 hover:bg-emerald-600">
                          Current Device
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {session.ip_address || "Unknown IP"} • Last active:{" "}
                      {new Date(session.last_used_at || session.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                {!session.is_current && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRevoke(session.id)}
                    disabled={revokeSession.isPending}
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Log out
                  </Button>
                )}
              </div>
            );
          })}
      </CardContent>
    </Card>
  );
}
