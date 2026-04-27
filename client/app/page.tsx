"use client";

import { LoginForm } from "@/components/auth/login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { motion } from "framer-motion";
import Image from "next/image";

export default function HomePage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-[#0a0a0a]">
      {/* Premium Background Layer */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/medical_saas_dashboard_bg_1777553049717.png"
          alt="Background"
          fill
          className="object-cover opacity-20 filter blur-[2px] scale-105"
          priority
        />
        {/* Animated Mesh Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 via-transparent to-accent/20 animate-pulse duration-[10s]" />
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-primary/30 rounded-full blur-[120px] mix-blend-screen animate-blob" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-accent/20 rounded-full blur-[120px] mix-blend-screen animate-blob animation-delay-2000" />
      </div>

      <div className="absolute top-6 right-6 z-30">
        <ThemeToggle />
      </div>

      <main className="w-full max-w-[1200px] grid grid-cols-1 lg:grid-cols-2 gap-12 items-center z-10">
        {/* Hero Content */}
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: "circOut" }}
          className="hidden lg:block space-y-8"
        >
          <div className="space-y-4">
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.8 }}
              className="text-6xl font-serif font-black text-white leading-tight tracking-tighter"
            >
              The Future of <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">
                Retail & Pharmacy
              </span>
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.8 }}
              className="text-xl text-gray-400 max-w-lg leading-relaxed"
            >
              Streamline your operations, manage inventory with precision, and provide world-class service with DumosRx.
            </motion.p>
          </div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.8 }}
            className="flex items-center gap-8 pt-4"
          >
            <div className="flex flex-col">
              <span className="text-3xl font-bold text-white">99.9%</span>
              <span className="text-xs text-gray-500 uppercase tracking-widest">Uptime</span>
            </div>
            <div className="w-px h-10 bg-gray-800" />
            <div className="flex flex-col">
              <span className="text-3xl font-bold text-white">256-bit</span>
              <span className="text-xs text-gray-500 uppercase tracking-widest">Encryption</span>
            </div>
            <div className="w-px h-10 bg-gray-800" />
            <div className="flex flex-col">
              <span className="text-3xl font-bold text-white">Instant</span>
              <span className="text-xs text-gray-500 uppercase tracking-widest">Sync</span>
            </div>
          </motion.div>
        </motion.div>

        {/* Login Card */}
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, ease: "circOut" }}
          className="w-full max-w-md mx-auto"
        >
          <Card className="border-white/10 shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] bg-black/40 backdrop-blur-2xl overflow-hidden relative group">
            {/* Subtle card glow */}
            <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/50 to-accent/50 rounded-xl opacity-0 group-hover:opacity-10 transition duration-1000" />
            
            <CardHeader className="space-y-1 relative pt-8">
              <div className="flex justify-center mb-4 lg:hidden">
                 <h1 className="font-serif font-black text-3xl text-white">DumosRx</h1>
              </div>
              <CardTitle className="font-serif font-bold text-3xl text-center text-white">Welcome Back</CardTitle>
              <CardDescription className="text-center text-gray-400">
                Authorized access only. Enter your credentials.
              </CardDescription>
            </CardHeader>
            <CardContent className="relative pb-8">
              <LoginForm />
            </CardContent>
          </Card>
          
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="mt-6 text-center text-[10px] uppercase tracking-[0.2em] text-gray-500"
          >
            © 2019 - 2026 • Powered by Dumos Technologies
          </motion.p>
        </motion.div>
      </main>

      {/* Global CSS for custom animations */}
      <style jsx global>{`
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
      `}</style>
    </div>
  );
}
