"use client";

import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import Image from "next/image";
import { LoginTab } from "@/components/auth/login-tab";
import { SetupTab } from "@/components/auth/setup-tab";
import { useLoginPageState } from "./use-login-page";

export default function LoginPage() {
  const {
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
  } = useLoginPageState();

  if (isChecking || showAccountSelection) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 flex flex-col sm:items-center sm:justify-center p-0 sm:p-4 overflow-hidden bg-background"
      style={{
        paddingTop: "calc(var(--tauri-top, env(safe-area-inset-top, 0px)))",
        paddingBottom:
          "calc(var(--tauri-bottom, env(safe-area-inset-bottom, 0px)))",
      }}
    >
      {/* Mobile Top Background Layer */}
      <div className="absolute top-0 left-0 right-0 h-[50dvh] bg-primary sm:hidden z-0" />

      {/* Desktop Background Effects */}
      <div className="absolute inset-0 z-0 hidden sm:block">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/60" />
      </div>

      {/* Mobile Top Section (1/4 height) */}
      <div className="sm:hidden relative z-10 flex flex-col items-center justify-center shrink-0 min-h-[25dvh] py-4">
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
        >
          <Image
            src="/logo.png"
            alt="Logo"
            width={160}
            height={60}
            className="object-contain brightness-0 invert"
            style={{ height: "auto" }}
          />
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full h-full sm:h-auto sm:max-w-md z-10 flex flex-col mx-auto"
      >
        {activeTab === "login" ? (
          <LoginTab
            authHeader={authHeader}
            userCount={userCount}
            showRecentUserSelection={showRecentUserSelection}
            recentUsers={recentUsers}
            isNewCredentialsMode={isNewCredentialsMode}
            onGoToRegister={registerHandler}
            onGoToCloud={cloudSetupHandler}
            onCancel={cancelHandler}
            {...loginState}
          />
        ) : (
          <SetupTab authHeader={authHeader} onboarding={onboarding} />
        )}
      </motion.div>
    </div>
  );
}
