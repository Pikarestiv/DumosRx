"use client";

import { generateId, setActiveStoreId } from "@/lib/db/core";
import { getLocalStores } from "@/lib/db/queries/setup";
import { sync, syncSubscriptionStatus } from "@/lib/db/sync-engine";
import { apiClient } from "@/lib/api/client";
import { withNetworkRetry } from "@/lib/api/retry-on-network-error";
import { toast } from "sonner";
import { hashPin } from "@/lib/utils/pin-hash";
import { setStoredActiveStoreId } from "@/lib/storage-keys";
import {
  seedCloudLinkedStoreAndAdmin,
  seedOfflineStoreAndAdmin,
  type PendingNewRegistration,
} from "./onboarding-local-writes";

interface OnboardingRegisterDeps {
  login: (username: string, pin?: string) => Promise<boolean>;
  navigate: (path: string) => void;
  registerIsCloudLinked: boolean;
  setIsLoading: (loading: boolean) => void;
  notifyDeviceDataChanged: () => void;
  onLocalStoreConflict: (localStoreName: string, registration: PendingNewRegistration) => void;
}

export function useOnboardingRegister({
  login,
  navigate,
  registerIsCloudLinked,
  setIsLoading,
  notifyDeviceDataChanged,
  onLocalStoreConflict,
}: OnboardingRegisterDeps) {
  // Owns its own error handling so either caller's failure gets this step's message and clears isLoading.
  // Rationale: docs/CLIENT_COMMENTS.md#line-app-setup-use-onboarding-ts-finish-new-account-setup
  const finishNewAccountSetup = async (registration: PendingNewRegistration) => {
    const { store, username, pin, storeName } = registration;
    const now = new Date().toISOString();

    try {
      await seedCloudLinkedStoreAndAdmin(store, registration, now);

      // Seeds the trial status before the background sync() - see A-156, docs/FIXED_BUGS.md.
      try {
        await syncSubscriptionStatus();
      } catch (err) {
        console.error("Failed to seed initial subscription status", err);
      }

      setStoredActiveStoreId(store.id);
      setActiveStoreId(store.id);
      toast.success(`${storeName} created and linked to your cloud account!`);

      const success = await login(username, pin);
      // Refetches /login's own stale mount snapshot - see A-154, docs/FIXED_BUGS.md.
      notifyDeviceDataChanged();
      if (success) {
        sync(false, true).catch(console.error);
        navigate("/dashboard");
      } else {
        setIsLoading(false);
      }
    } catch (err) {
      console.error("Failed to finish new account setup", err);
      toast.error("Your account was created, but we couldn't finish setting up this device. Please contact support.");
      setIsLoading(false);
    }
  };

  const handleRegister = async (
    firstName: string,
    lastName: string,
    username: string,
    pin: string,
    storeName: string,
    existingStoreId?: string,
    email?: string,
    password?: string,
    storeType?: string,
    phone?: string,
  ) => {
    setIsLoading(true);
    try {
      const now = new Date().toISOString();
      const hashedPin = hashPin(pin);

      // Brand-new setup creates the cloud account first so local rows carry the server's real ids.
      // Rationale: docs/CLIENT_COMMENTS.md#line-app-setup-use-onboarding-ts-cloud-first-register
      if (!registerIsCloudLinked) {
        if (!email || !password) {
          toast.error("Email and password are required to create your account");
          setIsLoading(false);
          return;
        }

        if (typeof navigator !== "undefined" && !navigator.onLine) {
          toast.error("You're offline. Connect to the internet to create your cloud account.");
          setIsLoading(false);
          return;
        }

        let response: { token: string; user: { id: string } };
        try {
          response = await withNetworkRetry(() =>
            apiClient.register({
              first_name: firstName,
              last_name: lastName,
              email,
              username,
              pin,
              password,
              store_name: storeName,
              store_type: storeType,
              phone,
            }),
          );
        } catch (err) {
          const status = err instanceof Error ? (err as Error & { status?: number }).status : undefined;
          const isEmailTaken = status === 422 && err instanceof Error && /email.*already.*taken/i.test(err.message);
          if (!isEmailTaken) throw err;

          // Self-heals a lost-response retry instead of dead-ending (see
          // client/AGENTS.md's "Cloud setup/registration network calls").
          const loginResponse = await withNetworkRetry(() => apiClient.login(email, password));
          response = { token: loginResponse.token, user: { id: loginResponse.user.id } };
        }

        apiClient.setToken(response.token);

        const stores = await withNetworkRetry(() => apiClient.getStores());
        const store = stores[0];
        if (!store) {
          toast.error("Account created, but no store was returned. Please contact support.");
          setIsLoading(false);
          return;
        }

        const newRegistration: PendingNewRegistration = {
          store, userId: response.user.id, firstName, lastName, username, pin, hashedPin, storeName,
        };
        // Leftover data from a previously linked account - see client/AGENTS.md's clearDatabaseForNewStore() note.
        const localStores = await getLocalStores();
        if (localStores.length > 0) {
          onLocalStoreConflict(localStores[0].name, newRegistration);
          setIsLoading(false);
          return;
        }

        await finishNewAccountSetup(newRegistration);
        return;
      }

      // Already cloud-linked (the zero-local-users fallback): a fresh local id is adopted by the next push.
      const userId = generateId();
      const storeId = existingStoreId || generateId();
      await seedOfflineStoreAndAdmin(
        storeId,
        storeName,
        Boolean(existingStoreId),
        { userId, firstName, lastName, username, hashedPin },
        now,
      );

      toast.success(`${storeName} configured and administrator created!`);

      const success = await login(username, pin);
      notifyDeviceDataChanged();
      if (success) {
        toast.info("Pushing your account to cloud...");
        sync(false, true).catch(console.error);
        navigate("/dashboard");
      }
    } catch (_err) {
      console.error("Registration failed", _err);
      const message = _err instanceof Error ? _err.message : "";
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        toast.error("You're offline. Connect to the internet to create your cloud account.");
      } else if (message) {
        toast.error(message);
      } else {
        toast.error("Failed to complete setup");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return { finishNewAccountSetup, handleRegister };
}
