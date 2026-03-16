"use client";

import Link from "next/link";
import { Pill, ArrowLeft, ShieldCheck } from "lucide-react";
import { RegisterForm } from "@/components/auth/register-form";
import { Suspense } from "react";
import { motion } from "framer-motion";
import Image from "next/image";

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-[#0a0a0a]">
       {/* Background Layer */}
       <div className="absolute inset-0 z-0">
        <Image
          src="/auth-bg.png"
          alt="Background"
          fill
          className="object-cover opacity-10 filter blur-[4px]"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-tr from-accent/10 via-transparent to-primary/10 animate-pulse duration-[12s]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="w-full max-w-lg z-10"
      >
        <Link href="/" className="inline-flex items-center text-sm text-gray-500 hover:text-white mb-8 transition-colors group">
          <ArrowLeft className="h-4 w-4 mr-2 transform group-hover:-translate-x-1 transition-transform" />
          Back to Home
        </Link>

        <div className="bg-black/60 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 shadow-2xl relative group">
           <div className="flex flex-col items-center text-center space-y-2 mb-8">
            <motion.div 
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.2 }}
              className="h-16 w-16 bg-accent/20 rounded-2xl flex items-center justify-center mb-4 border border-accent/30"
            >
              <ShieldCheck className="h-8 w-8 text-accent" />
            </motion.div>
            <h2 className="text-4xl font-serif font-black text-white tracking-tight">
              Join the Network
            </h2>
            <p className="text-gray-400">
              Modernize your pharmacy operations today
            </p>
          </div>

          <Suspense fallback={<div className="text-white text-center">Opening secure channel...</div>}>
            <RegisterForm />
          </Suspense>
        </div>

        <div className="mt-8 text-center text-xs text-gray-500">
          By joining, you agree to our{" "}
          <Link href="#" className="text-gray-400 underline hover:text-white transition-colors">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="#" className="text-gray-400 underline hover:text-white transition-colors">
            Privacy Policy
          </Link>
          .
        </div>
      </motion.div>
    </div>
  );
}
