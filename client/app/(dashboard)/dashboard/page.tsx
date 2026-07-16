"use client";

import { useEffect, useState } from "react";

import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { useAuth } from "@/lib/context/auth-context";

export default function DashboardPage() {
  const { isAuthenticated, user: _user } = useAuth();

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);


  if (!mounted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <>
      <DashboardOverview />
    </>
  );
}
