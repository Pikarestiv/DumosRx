"use client";

import { useEffect, useState } from "react";
import { getBaseURL } from "@/lib/api/base-client";
import { getCurrentEnvironmentName } from "@/components/ui/server-selector";

/**
 * Which API server this session is actually talking to - not which build this
 * is. NEXT_PUBLIC_APP_ENV is baked in at build time and so cannot see a
 * super admin's server override, which a production build now honours; it
 * serves only as the pre-mount default that keeps SSR and the first client
 * render agreeing.
 */
export function useApiEnvironmentName() {
  const deployedEnv = process.env.NEXT_PUBLIC_APP_ENV;
  const [environmentName, setEnvironmentName] = useState(
    deployedEnv === "development" ? "Staging / Dev" : "Production",
  );

  useEffect(() => {
    // getBaseURL() reflects the Server Config selector's localStorage
    // preference, which isn't available during SSR - must read post-mount
    // to avoid a hydration mismatch against the server-rendered default.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnvironmentName(getCurrentEnvironmentName(getBaseURL()).replace(" Server", ""));
  }, []);

  return { environmentName, isProduction: environmentName === "Production" };
}
