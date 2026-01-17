"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/lib/auth/store";

export function AuthListener() {
  const checkAuth = useAuthStore((state) => state.checkAuth);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return null;
}
