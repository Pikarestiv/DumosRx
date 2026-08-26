"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { useLogin } from "@/hooks/use-login";
import { useDeviceAuthStatus } from "@/hooks/use-device-auth-status";
import { useOnboarding } from "@/app/setup/use-onboarding";
import { AuthTabHeader } from "@/components/auth/auth-tab-header";

/**
 * All derived state/orchestration for /login: which tab is active, whether
 * setup is a safe entry point, back-button rules, and the shared header.
 * Pulled out of page.tsx so that file is just layout/JSX. Composes the
 * page's sub-hooks (auth status, login form, onboarding) itself, the same
 * way those sub-hooks compose their own lower-level pieces.
 */
export function useLoginPageState() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // "New credentials" mode (from the dashboard lock overlay's "Login as
  // someone else"), distinct from a plain /login visit, which otherwise
  // redirects straight to the dashboard's own lock overlay when recent
  // accounts already exist, to avoid ever showing two separate lock screens.
  const isNewCredentialsMode = searchParams.get("mode") === "new";

  const { isChecking, userCount, recentUsers } = useDeviceAuthStatus();
  const { isAuthenticated } = useAuth();
  const loginState = useLogin();
  const { showTraditionalLogin } = loginState;
  const onboarding = useOnboarding();

  // Login and Setup are tabs on this one page, not separate routes: no
  // navigation, no remount, no second loading spinner when switching.
  // Guard: a device that already has accounts can't land on setup's
  // welcome/select-store steps (that flow assumes a brand-new device and
  // risks clobbering real local data); only backup/cloud/syncing/register
  // are safe entry points there. `register` is included because
  // handleRegister() is purely additive (inserts a new store + admin) even
  // when the device already has other local accounts. Unlike
  // select-store's cloud-switch flow, it never wipes existing data.
  // Computed here instead of redirecting after mount, so an unsafe request
  // never flashes setup content before bouncing back.
  const requestedTab = searchParams.get("tab") === "setup" ? "setup" : "login";
  const step = searchParams.get("step");
  const isSafeSetupEntry =
    step === "backup" ||
    step === "cloud" ||
    step === "syncing" ||
    step === "register";
  const activeTab: "login" | "setup" =
    requestedTab === "setup" && userCount > 0 && !isSafeSetupEntry
      ? "login"
      : requestedTab;

  const setupHref =
    userCount > 0 ? "/login?tab=setup&step=cloud" : "/login?tab=setup";

  // Only bounce to the dashboard's own lock overlay when there's actually a
  // live (but idle-locked) session to hand off to, i.e. `isAuthenticated`.
  // Without this check, a real logout (user cleared, recentUsers/userCount
  // untouched) looked identical to "idle-locked", so /login redirected to
  // /dashboard, which immediately redirected back to /login (no `user`),
  // forever: the flicker loop. When there's no live session, this page
  // renders its own account-tile picker (LockScreen) instead of redirecting.
  const canHandOffToDashboardLock =
    activeTab === "login" &&
    userCount > 0 &&
    recentUsers.length > 0 &&
    !showTraditionalLogin &&
    !isNewCredentialsMode;
  const showAccountSelection = canHandOffToDashboardLock && isAuthenticated;
  const showRecentUserSelection = canHandOffToDashboardLock && !isAuthenticated;

  useEffect(() => {
    if (showAccountSelection) {
      router.replace("/dashboard");
    }
  }, [showAccountSelection, router]);

  const setupAllowsBack = onboarding.onboardingStep !== "syncing";
  const loginAllowsBack =
    !recentUsers.length || showTraditionalLogin || isNewCredentialsMode;
  const showBack = activeTab === "setup" ? setupAllowsBack : loginAllowsBack;

  const handleBack = () => {
    if (activeTab === "setup") {
      onboarding.goBack();
    } else if (isNewCredentialsMode) {
      // Arrived here via "Login as someone else": that only calls
      // unlock() before navigating, it never logs the current user out, so
      // `user` is still set and /dashboard renders normally. Backing out
      // just cancels the account switch and resumes the existing session,
      // rather than going to "/" (which has nothing to do with this flow).
      router.push("/dashboard");
    } else {
      router.push("/");
    }
  };

  const headerActiveTab: "login" | "setup" =
    activeTab === "login" ? "login" : "setup";

  // Header (Back + Login/Setup switcher) is hidden entirely for ?mode=new:
  // a lone back arrow with no switcher looked unbalanced, especially on
  // mobile. The way off this screen instead is a secondary "Cancel" button
  // in the login form itself (see TraditionalLoginForm's onCancel).
  const authHeader = isNewCredentialsMode ? null : (
    <AuthTabHeader
      active={headerActiveTab}
      showBack={showBack}
      onBack={handleBack}
      setupHref={setupHref}
    />
  );

  // ?mode=new only re-authenticates as a different existing user on an
  // already-set-up device: registering, cloud setup, and cancelling all
  // mean something else there (or nothing), so these are only wired up
  // outside that mode.
  const registerHandler = isNewCredentialsMode
    ? undefined
    : onboarding.goToRegister;
  const cloudSetupHandler = isNewCredentialsMode
    ? undefined
    : () => onboarding.setStep("cloud");
  const cancelHandler = isNewCredentialsMode ? handleBack : undefined;

  return {
    isChecking,
    showAccountSelection,
    activeTab,
    authHeader,
    onboarding,
    isNewCredentialsMode,
    userCount,
    recentUsers,
    showRecentUserSelection,
    loginState,
    registerHandler,
    cloudSetupHandler,
    cancelHandler,
  };
}
