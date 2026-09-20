"use client";

import { useEffect, useState } from "react";
import { getBaseURL } from "@/lib/api/base-client";
import { getCurrentEnvironmentName } from "@/components/ui/server-selector";

/**
 * Which API server this session is actually talking to - not which build this
 * is. Deployed builds (dumosrx.com / dev.dumosrx.com) bake
 * NEXT_PUBLIC_APP_ENV in at build time, so trust it there; locally that var
 * isn't set, so fall back to inspecting the URL the Server Config selector
 * points at. Anything derived from NODE_ENV alone lies as soon as a local
 * build is pointed at production.
 */
export function useApiEnvironmentName() {
  const deployedEnv = process.env.NEXT_PUBLIC_APP_ENV;
  const [environmentName, setEnvironmentName] = useState(
    deployedEnv === "development" ? "Staging / Dev" : "Production",
  );

  useEffect(() => {
    if (!deployedEnv) {
      // getBaseURL() reflects the Server Config selector's localStorage
      // preference, which isn't available during SSR - must read post-mount
      // to avoid a hydration mismatch against the server-rendered default.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEnvironmentName(getCurrentEnvironmentName(getBaseURL()).replace(" Server", ""));
    }
  }, [deployedEnv]);

  return { environmentName, isProduction: environmentName === "Production" };
}
