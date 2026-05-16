"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Mail, Loader2, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { webApiClient } from "@/lib/api/client";
import { toast } from "sonner";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    try {
      await webApiClient.post("/forgot-password", { email });
      setSubmitted(true);
      toast.success("Reset link sent!");
    } catch (error: any) {
      toast.error(error.message || "Failed to send reset link");
    } finally {
      setLoading(false);
    }
  };

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
          href="/login"
          className="inline-flex items-center text-sm text-gray-500 hover:text-white mb-8 transition-colors group"
        >
          <ArrowLeft className="h-4 w-4 mr-2 transform group-hover:-translate-x-1 transition-transform" />
          Back to Login
        </Link>

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
              Reset Password
            </h2>
            <p className="text-gray-400">
              Enter your email to receive a recovery link
            </p>
          </div>

          {!submitted ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Email Address</label>
                <div className="relative group">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 group-focus-within:text-primary transition-colors" />
                  <Input
                    placeholder="name@example.com"
                    type="email"
                    required
                    className="pl-10 bg-white/5 border-white/10 text-white focus:border-primary/50 focus:ring-primary/20 transition-all h-11"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full h-12 text-lg font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/10 transition-all active:scale-[0.98]"
                disabled={loading}
              >
                {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "Send Reset Link"}
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
              <p className="text-gray-300">
                If an account exists for <span className="text-white font-bold">{email}</span>, you will receive a password reset link shortly.
              </p>
              <Button 
                variant="outline" 
                className="w-full border-white/10 hover:bg-white/5 text-white"
                onClick={() => setSubmitted(false)}
              >
                Try another email
              </Button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
