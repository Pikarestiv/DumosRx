"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { Lock, Loader2, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { TraditionalLoginForm } from "@/components/auth/traditional-login-form";
import {
  SetupPromptHeader,
  SetupPromptContent,
} from "@/components/auth/setup-prompt";
import { useLogin } from "@/hooks/use-login";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // "New credentials" mode (from the dashboard lock overlay's "Login as
  // someone else") — distinct from a plain /login visit, which otherwise
  // redirects straight to the dashboard's own lock overlay when recent
  // accounts already exist, to avoid ever showing two separate lock screens.
  const isNewCredentialsMode = searchParams.get("mode") === "new";

  const {
    username,
    setUsername,
    pin,
    setPin,
    isLoading,
    isCheckingStatus,
    userCount,
    recentUsers,
    showTraditionalLogin,
    handleLogin,
  } = useLogin();

  const showAccountSelection =
    userCount > 0 &&
    recentUsers.length > 0 &&
    !showTraditionalLogin &&
    !isNewCredentialsMode;

  useEffect(() => {
    if (showAccountSelection) {
      router.replace("/dashboard");
    }
  }, [showAccountSelection, router]);

  if (isCheckingStatus || showAccountSelection) {
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
      <div className="sm:hidden relative z-10 flex flex-col items-center justify-center shrink-0 min-h-[25dvh] pt-4 pb-6">
        {(!recentUsers.length ||
          showTraditionalLogin ||
          isNewCredentialsMode) && (
          <Link
            href="/"
            className="absolute left-6 top-6 inline-flex items-center text-sm font-medium text-primary-foreground/90 hover:text-primary-foreground transition-colors group"
          >
            <ArrowLeft className="h-5 w-5 mr-1 transform group-hover:-translate-x-1 transition-transform" />
            Back
          </Link>
        )}
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
        {/* Desktop Back Link */}
        {(!recentUsers.length ||
          showTraditionalLogin ||
          isNewCredentialsMode) && (
          <div className="hidden sm:block px-4 sm:px-0">
            <Link
              href="/"
              className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors group"
            >
              <ArrowLeft className="h-4 w-4 mr-2 transform group-hover:-translate-x-1 transition-transform" />
              Back
            </Link>
          </div>
        )}

        <Card className="flex-1 sm:flex-initial flex flex-col border-none sm:border-solid sm:border-border shadow-[0_-20px_40px_rgba(0,0,0,0.15)] sm:shadow-2xl bg-background sm:bg-card/60 sm:backdrop-blur-2xl rounded-t-[2.5rem] sm:rounded-xl overflow-hidden relative">
          {/* Desktop Logo */}
          <div className="hidden sm:flex flex-col items-center pt-6 pb-2">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{
                type: "spring",
                stiffness: 260,
                damping: 20,
                delay: 0.2,
              }}
              className="mb-1 overflow-hidden"
            >
              <Image
                src="/logo.png"
                alt="Logo"
                width={150}
                height={58}
                className="object-contain"
                style={{ filter: "var(--logo-filter)", height: "auto" }}
              />
            </motion.div>
          </div>

          {userCount === 0 && (
            <CardHeader className="pt-8 sm:pt-2 pb-2 items-center text-center">
              <SetupPromptHeader />
            </CardHeader>
          )}

          {userCount === 0 && <SetupPromptContent />}

          {userCount > 0 &&
            (recentUsers.length === 0 ||
              showTraditionalLogin ||
              isNewCredentialsMode) && (
              <TraditionalLoginForm
                username={username}
                setUsername={setUsername}
                pin={pin}
                setPin={setPin}
                isLoading={isLoading}
                onSubmit={handleLogin}
              />
            )}
        </Card>

        {userCount > 0 && (showTraditionalLogin || isNewCredentialsMode) && (
          <div className="hidden sm:flex mt-4 items-center justify-center gap-2 text-xs font-medium text-muted-foreground/60 uppercase tracking-widest">
            <Lock className="w-3 h-3" />
            Terminal Access • Secure Login
          </div>
        )}
      </motion.div>
    </div>
  );
}
