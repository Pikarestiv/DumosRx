"use client";

import { useAuth } from "@/lib/context/auth-context";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isAuthenticated && pathname !== "/login") {
      router.push("/login");
    }
  }, [isAuthenticated, router, pathname]);

  if (!isAuthenticated && pathname !== "/login") {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <div className="animate-pulse flex flex-col items-center">
          <div className="h-12 w-12 bg-accent rounded-full mb-4"></div>
          <p className="text-muted-foreground font-serif">Checking authorization...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
