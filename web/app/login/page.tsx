"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { LoginForm } from "@/components/auth/login-form";
import { Suspense } from "react";
import { motion } from "framer-motion";
import Image from "next/image";

export default function LoginPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("drx_token");
    if (token) {
      router.push("/dashboard");
    } else {
      setChecking(false);
    }
  }, [router]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
        <Loader2 className="h-10 w-10 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-[#0a0a0a]">
      {/* Background Layer */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/auth-bg.png"
          alt="Background"
          fill
          className="object-cover opacity-15 filter blur-xs"
          priority
        />
        <div className="absolute inset-0 bg-linear-to-tr from-primary/20 via-transparent to-accent/20 animate-pulse duration-[10s]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="w-full max-w-md z-10"
      >
        <Link
          href="/"
          className="inline-flex items-center text-sm text-gray-500 hover:text-white mb-8 transition-colors group"
        >
          <ArrowLeft className="h-4 w-4 mr-2 transform group-hover:-translate-x-1 transition-transform" />
          Back to Home
        </Link>

        <div className="bg-black/60 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 shadow-2xl overflow-hidden relative group">
          {/* Subtle card glow */}
          <div className="pointer-events-none absolute -inset-0.5 bg-linear-to-r from-primary/30 to-accent/30 rounded-3xl opacity-0 group-hover:opacity-10 transition duration-1000" />

          <div className="flex flex-col items-center text-center space-y-2 relative mb-8">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{
                type: "spring",
                stiffness: 260,
                damping: 20,
                delay: 0.2,
              }}
              className="mb-6"
            >
              <Image 
                src="/logo.png" 
                alt="DumosRx Logo" 
                width={120} 
                height={40} 
                className="h-10 w-auto"
                priority
              />
            </motion.div>
            <h2 className="text-4xl font-serif font-black text-white">
              Sign In
            </h2>
            <p className="text-gray-400">
              Authorized access to your pharmacy portal
            </p>
          </div>

          <Suspense
            fallback={
              <div className="text-white text-center">Loading portal...</div>
            }
          >
            <LoginForm />
          </Suspense>
        </div>

        <p className="mt-8 text-center text-[10px] uppercase tracking-[0.2em] text-gray-600">
          © 2019 - 2026 • Secure Infrastructure
        </p>
      </motion.div>
    </div>
  );
}
