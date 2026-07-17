"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Lock, Loader2, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { LockScreen } from "@/components/auth/lock-screen";
import { TraditionalLoginForm } from "@/components/auth/traditional-login-form";
import {
  SetupPromptHeader,
  SetupPromptContent,
} from "@/components/auth/setup-prompt";
import { useLogin } from "@/hooks/use-login";

export default function LoginPage() {
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
    setShowTraditionalLogin,
    handleLogin,
  } = useLogin();

  if (isCheckingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center p-0 sm:p-4 overflow-hidden bg-background"
      style={{
        paddingTop:
          "calc(var(--tauri-top, env(safe-area-inset-top, 0px)) + 1rem)",
        paddingBottom:
          "calc(var(--tauri-bottom, env(safe-area-inset-bottom, 0px)) + 1rem)",
      }}
    >
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/60" />
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full h-full sm:h-auto sm:max-w-md z-10 flex flex-col sm:justify-center"
      >
        {(!recentUsers.length || showTraditionalLogin) && (
          <Link
            href="/"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4 sm:mt-0 transition-colors group px-4 pt-4 sm:p-0"
          >
            <ArrowLeft className="h-4 w-4 mr-2 transform group-hover:-translate-x-1 transition-transform" />
            Back
          </Link>
        )}

        <Card className="flex-1 sm:flex-initial flex flex-col border border-border/50 shadow-xl sm:shadow-2xl bg-card/60 backdrop-blur-2xl rounded-3xl sm:rounded-xl mx-4 mt-2 mb-4 sm:m-0 overflow-hidden relative">
          <CardHeader className="space-y-1 flex flex-col items-center text-center pb-1 pt-5">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{
                type: "spring",
                stiffness: 260,
                damping: 20,
                delay: 0.2,
              }}
              className="mb-3 overflow-hidden"
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

            {userCount === 0 && <SetupPromptHeader />}
          </CardHeader>

          {userCount === 0 ? (
            <SetupPromptContent />
          ) : recentUsers.length > 0 && !showTraditionalLogin ? (
            <CardContent className="flex-1 flex flex-col pt-1 pb-0 px-4 sm:pb-6 sm:px-6">
              <LockScreen
                recentUsers={recentUsers}
                onLoginAsOther={() => setShowTraditionalLogin(true)}
              />
            </CardContent>
          ) : (
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

        {userCount > 0 && showTraditionalLogin && (
          <div className="mt-4 flex items-center justify-center gap-2 text-xs font-medium text-muted-foreground/60 uppercase tracking-widest">
            <Lock className="w-3 h-3" />
            Terminal Access • Secure Login
          </div>
        )}
      </motion.div>
    </div>
  );
}
