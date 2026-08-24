"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { getAppURL } from "@/lib/constants";

export default function LoginPage() {
  useEffect(() => {
    window.location.href = `${getAppURL()}/login`;
  }, []);

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 text-primary animate-spin" />
    </div>
  );
}
