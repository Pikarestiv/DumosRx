"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { useLogin } from "@/hooks/use-login";
import { useDeviceAuthStatus } from "@/hooks/use-device-auth-status";
import { useOnboarding } from "@/app/setup/use-onboarding";
import { AuthTabHeader } from "@/components/auth/auth-tab-header";
import { usePostRestoreCloudLinkNotice } from "@/lib/hooks/use-post-restore-cloud-link-notice";

// All derived state/orchestration for /login:
// Rationale: docs/CLIENT_COMMENTS.md#block-app-login-use-login-page-tsx-L12
export function useLoginPageState() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // "New credentials" mode (from the dashboard lock overlay's "Login as someone else"), distinct from a plain /login visit,…
  // Rationale: docs/CLIENT_COMMENTS.md#line-app-login-use-login-page-tsx-L22
  const isNewCredentialsMode = searchParams.get("mode") === "new";

  const { isChecking, userCount, recentUsers, removeRecentUser, refetch } =
    useDeviceAuthStatus();
  const { isAuthenticated } = useAuth();
  const loginState = useLogin();
  const { showTraditionalLogin } = loginState;
  // Keeps userCount/recentUsers fresh through onboarding - see A-154, docs/FIXED_BUGS.md.
  const onboarding = useOnboarding(refetch);

  // Known bug #10, Part B:
  // Rationale: docs/CLIENT_COMMENTS.md#line-app-login-use-login-page-tsx-L36
  usePostRestoreCloudLinkNotice({
    onLinkCloud: () => onboarding.setStep("cloud"),
  });

  // Login and Setup are tabs on this one page, not separate routes:
  // Rationale: docs/CLIENT_COMMENTS.md#line-app-login-use-login-page-tsx-L46
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

  // Only bounce to the dashboard's own lock overlay when there's actually a live (but idle-locked) session to hand off to, i…
  // Rationale: docs/CLIENT_COMMENTS.md#line-app-login-use-login-page-tsx-L73
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
      // Cancels the account switch: the original session is untouched, so
      // /dashboard resumes it (still locked if it was locked).
      router.push("/dashboard");
    } else {
      router.push("/");
    }
  };

  const headerActiveTab: "login" | "setup" =
    activeTab === "login" ? "login" : "setup";

  // Header (Back + Login/Setup switcher) is hidden entirely for ?mode=new:
  // Rationale: docs/CLIENT_COMMENTS.md#line-app-login-use-login-page-tsx-L115
  const authHeader = isNewCredentialsMode ? null : (
    <AuthTabHeader
      active={headerActiveTab}
      showBack={showBack}
      onBack={handleBack}
      setupHref={setupHref}
    />
  );

  // ?mode=new only re-authenticates as a different existing user on an already-set-up device:
  // Rationale: docs/CLIENT_COMMENTS.md#line-app-login-use-login-page-tsx-L128
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
    removeRecentUser,
    showRecentUserSelection,
    loginState,
    registerHandler,
    cloudSetupHandler,
    cancelHandler,
  };
}
