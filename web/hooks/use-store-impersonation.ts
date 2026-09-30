import { useState } from "react";
import { toast } from "sonner";
import { useImpersonateStoreMutation } from "@/lib/api/admin-hooks-stores";
import { webApiClient } from "@/lib/api/client";
import { getBaseURL } from "@/lib/api/base-client";
import { getAppURL, APP_URL } from "@/lib/constants";
import { getCurrentEnvironmentName } from "@/components/ui/server-selector";
import { useAdminAuthStore } from "@/lib/store/use-admin-auth-store";
import type { AdminStoreSummary } from "@/lib/types/admin";

/** The Store Fleet row action that signs an admin into the app as a store
 * owner. See docs/ADMIN_IMPERSONATION.md for why the environment mismatch is
 * challenged, why the two handoff codes are minted one at a time, and why
 * they travel in the URL fragment. */
export function useStoreImpersonation() {
  const [impersonateTarget, setImpersonateTarget] = useState<AdminStoreSummary | null>(null);
  const impersonateMutation = useImpersonateStoreMutation();

  const [environmentChallenge, setEnvironmentChallenge] = useState<{
    store: AdminStoreSummary;
    message: string;
  } | null>(null);

  const environmentMismatchMessage = () => {
    const apiEnv = getCurrentEnvironmentName(getBaseURL());
    const appUrl = getAppURL();

    if (apiEnv === "Production Server" || appUrl !== APP_URL) return null;

    return (
      `You're on ${apiEnv}, but the impersonation "App URL" is still set ` +
      `to production (${appUrl}). Continuing will send a real handoff ` +
      `code there. Set the App URL under "Server Config" first unless ` +
      `you mean to do this.`
    );
  };

  const handOff = async (userToken: string, userName: string) => {
    const adminToken = useAdminAuthStore.getState().token;
    if (!adminToken) {
      toast.error("Impersonation Failed", {
        description: "No active admin session to hand back to.",
      });
      return;
    }

    const { code: userCode } = await webApiClient.createHandoffCode(userToken);

    let returnCode: string;
    try {
      ({ code: returnCode } = await webApiClient.createHandoffCode(adminToken));
    } catch (mintErr) {
      let burned = false;
      try {
        await webApiClient.consumeHandoffCode(userCode);
        burned = true;
      } catch (burnErr) {
        console.error(
          "[impersonation] return-code mint failed and the user handoff code could not be burned; it stays redeemable for up to 60s",
          { mintErr, burnErr },
        );
      }
      toast.error("Impersonation Failed", {
        description: burned
          ? "Could not create the return session. The handoff code was invalidated; nothing was exposed."
          : "Could not create the return session, and the handoff code could not be invalidated - it may stay usable for up to 60 seconds.",
      });
      return;
    }

    toast.success("Impersonation Successful", {
      description: `Logged in as ${userName}. Redirecting...`,
    });

    window.location.href = `${getAppURL()}/auth/callback#code=${encodeURIComponent(userCode)}&return_code=${encodeURIComponent(returnCode)}`;
  };

  const runImpersonation = (store: AdminStoreSummary) => {
    impersonateMutation.mutate(store.id, {
      onSuccess: (data) => {
        void handOff(data.token, data.user.name).catch(() => {
          toast.error("Impersonation Failed", {
            description: "Could not hand off session to the app.",
          });
        });
      },
      onError: (err) => {
        toast.error("Impersonation Failed", {
          description: err.message || "Failed to start impersonation session.",
        });
      },
    });
  };

  const startImpersonation = (store: AdminStoreSummary) => {
    const message = environmentMismatchMessage();
    if (message) {
      setEnvironmentChallenge({ store, message });
      return;
    }
    runImpersonation(store);
  };

  const confirmEnvironmentChallenge = () => {
    const pending = environmentChallenge?.store;
    setEnvironmentChallenge(null);
    if (pending) runImpersonation(pending);
  };

  return {
    impersonateTarget,
    handleImpersonate: setImpersonateTarget,
    clearImpersonateTarget: () => setImpersonateTarget(null),
    startImpersonation,
    environmentChallenge,
    confirmEnvironmentChallenge,
    dismissEnvironmentChallenge: () => setEnvironmentChallenge(null),
  };
}
