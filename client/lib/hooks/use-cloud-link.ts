import { useCallback, type Dispatch, type SetStateAction } from "react";
import { apiClient } from "@/lib/api/client";
import { withNetworkRetry } from "@/lib/api/retry-on-network-error";
import { clearImpersonatedSession } from "@/lib/utils/impersonation";
import { setStoredUser } from "@/lib/storage-keys";
import type { User } from "@/lib/context/auth-context";

export interface CloudLinkResult {
  success: boolean;
  message: string;
}

interface CloudLinkState {
  user: User | null;
  setUser: Dispatch<SetStateAction<User | null>>;
  setIsCloudLinked: (linked: boolean) => void;
  setIsImpersonating: (impersonating: boolean) => void;
}

const failureMessage = (e: unknown) => (e instanceof Error ? e.message : "Failed to connect to cloud");

export function useCloudLink({ user, setUser, setIsCloudLinked, setIsImpersonating }: CloudLinkState) {
  const adoptCloudToken = useCallback(
    (token: string) => {
      apiClient.setToken(token);
      setIsCloudLinked(true);
      // A credentialed cloud link is by definition not a superadmin handoff, and it replaces whatever token an impersonated session was carrying.
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-context-auth-context-tsx-L762
      clearImpersonatedSession();
      setIsImpersonating(false);
    },
    [setIsCloudLinked, setIsImpersonating],
  );

  const linkCloudAccount = useCallback(
    async (email: string, password: string): Promise<CloudLinkResult> => {
      try {
        if (user?.email && user.email.toLowerCase() !== email.toLowerCase()) {
          return {
            success: false,
            message: `Account mismatch. This device is already linked to ${user.email}. Please use that account.`,
          };
        }

        const response = await withNetworkRetry(() => apiClient.login(email, password));
        if (!response.token) {
          return { success: false, message: "Invalid credentials" };
        }

        adoptCloudToken(response.token);
        if (user) {
          const updatedUser = { ...user, email };
          setUser(updatedUser);
          setStoredUser(updatedUser);
        }
        return { success: true, message: "Cloud account linked successfully!" };
      } catch (e) {
        return { success: false, message: failureMessage(e) };
      }
    },
    [user, setUser, adoptCloudToken],
  );

  const linkWithRelinkCode = useCallback(
    async (code: string): Promise<CloudLinkResult> => {
      try {
        const response = await apiClient.consumeRelinkCode(code.trim().toUpperCase());
        if (!response.token) {
          return { success: false, message: "Invalid or expired code." };
        }

        adoptCloudToken(response.token);
        return { success: true, message: "Till re-linked to DumosRx Cloud!" };
      } catch (e) {
        return { success: false, message: failureMessage(e) };
      }
    },
    [adoptCloudToken],
  );

  return { linkCloudAccount, linkWithRelinkCode };
}
