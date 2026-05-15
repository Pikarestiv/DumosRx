"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Loader2 } from "lucide-react";
import { AdminLoginForm } from "../../../components/auth/admin-login-form";
import { Suspense } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { useAdminAuthStore } from "@/lib/store/use-admin-auth-store";

export default function AdminLoginPage() {
  const router = useRouter();
  const { user, fetchUser, token } = useAdminAuthStore();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      if (!user) {
        await fetchUser();
      }
      
      // After fetch attempt, check user role
      if (user?.role === 'super_admin') {
        router.push("/admin");
      } else {
        setChecking(false);
      }
    };
    checkAuth();
  }, [user, fetchUser, router]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <Loader2 className="h-10 w-10 text-indigo-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-slate-950">
      {/* Dynamic Background */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-0 -left-4 w-72 h-72 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob" />
        <div className="absolute top-0 -right-4 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-2000" />
        <div className="absolute -bottom-8 left-20 w-72 h-72 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-4000" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="w-full max-w-lg z-10"
      >
        <Link
          href="/"
          className="inline-flex items-center text-sm text-slate-400 hover:text-white mb-8 transition-colors group"
        >
          <ArrowLeft className="h-4 w-4 mr-2 transform group-hover:-translate-x-1 transition-transform" />
          Back to Portal
        </Link>

        <div className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 shadow-2xl relative group">
          <div className="flex flex-col items-center text-center space-y-2 mb-8">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{
                type: "spring",
                stiffness: 260,
                damping: 20,
                delay: 0.2,
              }}
              className="bg-indigo-500/20 p-3 rounded-2xl mb-4 border border-indigo-500/30 group-hover:scale-110 transition-transform duration-500"
            >
                <Image 
                    src="/logo.png" 
                    alt="DumosRx Logo" 
                    width={150} 
                    height={40} 
                    className="h-10 w-auto object-contain brightness-0 invert"
                />
            </motion.div>
            <h2 className="text-3xl font-bold text-white tracking-tight">
              Platform Governance
            </h2>
            <p className="text-slate-400">
              Administrative Command & Control Center
            </p>
          </div>

          <Suspense
            fallback={
              <div className="text-white text-center">
                Establishing secure uplink...
              </div>
            }
          >
            <AdminLoginForm />
          </Suspense>
        </div>

        <div className="mt-8 flex items-center justify-center gap-4 text-xs text-slate-500 uppercase tracking-widest font-bold">
            <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3 text-indigo-500" /> End-to-End Encrypted</span>
            <span className="w-1 h-1 bg-slate-700 rounded-full" />
            <span>v1.0.4-PROD</span>
        </div>
      </motion.div>
    </div>
  );
}
