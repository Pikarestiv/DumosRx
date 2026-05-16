"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { webApiClient } from "@/lib/api/client";
import { toast } from "sonner";
import { Suspense } from "react";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  
  const token = searchParams.get("token");
  const email = searchParams.get("email");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || !confirmPassword) return;
    
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      await webApiClient.post("/reset-password", { 
        token, 
        email, 
        password, 
        password_confirmation: confirmPassword 
      });
      setSubmitted(true);
      toast.success("Password reset successfully!");
      setTimeout(() => router.push("/login"), 3000);
    } catch (error: any) {
      toast.error(error.message || "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  if (!token || !email) {
    return (
      <div className="text-center py-4 space-y-4">
        <div className="flex justify-center">
          <AlertCircle className="h-16 w-16 text-destructive" />
        </div>
        <h3 className="text-xl font-bold text-white">Invalid Reset Link</h3>
        <p className="text-gray-400">
          This password reset link is invalid or has expired.
        </p>
        <Link href="/forgot-password">
          <Button variant="outline" className="w-full mt-4 border-white/10 hover:bg-white/5 text-white">
            Request new link
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <>
      {!submitted ? (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">New Password</label>
            <div className="relative group">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 group-focus-within:text-primary transition-colors" />
              <Input
                placeholder="******"
                type="password"
                required
                className="pl-10 bg-white/5 border-white/10 text-white focus:border-primary/50 focus:ring-primary/20 transition-all h-11"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Confirm New Password</label>
            <div className="relative group">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 group-focus-within:text-primary transition-colors" />
              <Input
                placeholder="******"
                type="password"
                required
                className="pl-10 bg-white/5 border-white/10 text-white focus:border-primary/50 focus:ring-primary/20 transition-all h-11"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>

          <Button 
            type="submit" 
            className="w-full h-12 text-lg font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/10 transition-all active:scale-[0.98]"
            disabled={loading}
          >
            {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "Reset Password"}
          </Button>
        </form>
      ) : (
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center py-4 space-y-4"
        >
          <div className="flex justify-center">
            <CheckCircle2 className="h-16 w-16 text-green-500" />
          </div>
          <h3 className="text-xl font-bold text-white">Success!</h3>
          <p className="text-gray-300">
            Your password has been reset. Redirecting to login...
          </p>
          <Link href="/login">
            <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
              Login Now
            </Button>
          </Link>
        </motion.div>
      )}
    </>
  );
}

export default function ResetPasswordPage() {
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
        <div className="bg-black/60 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 shadow-2xl relative group">
          <div className="flex flex-col items-center text-center space-y-2 mb-8">
            <Image 
              src="/logo.png" 
              alt="DumosRx Logo" 
              width={120} 
              height={40} 
              className="h-10 w-auto mb-6"
            />
            <h2 className="text-3xl font-serif font-black text-white">
              New Password
            </h2>
            <p className="text-gray-400">
              Set a secure password for your account
            </p>
          </div>

          <Suspense fallback={<div className="flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </motion.div>
    </div>
  );
}
