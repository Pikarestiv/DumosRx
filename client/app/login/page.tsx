"use client";

import { useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Pill, Lock, User, Loader2, ArrowLeft } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { toast } from "sonner";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const success = await login(username, pin);
      if (success) {
        toast.success("Welcome back!");
        router.push("/dashboard");
      } else {
        toast.error("Invalid credentials. Try 'admin' to start.");
      }
    } catch {
      toast.error("Login failed. Database might not be initialized.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-[#0a0a0a]">
       {/* Background Layer */}
       <div className="absolute inset-0 z-0">
        <Image
          src="/medical_saas_dashboard_bg_1777553049717.png"
          alt="Background"
          fill
          className="object-cover opacity-10 filter blur-[4px]"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/60" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="w-full max-w-md z-10"
      >
        <Link href="/" className="inline-flex items-center text-sm text-gray-500 hover:text-white mb-8 transition-colors group">
          <ArrowLeft className="h-4 w-4 mr-2 transform group-hover:-translate-x-1 transition-transform" />
          Back to Landing
        </Link>

        <Card className="border-white/10 shadow-2xl bg-black/60 backdrop-blur-2xl">
          <CardHeader className="space-y-1 flex flex-col items-center text-center pb-2">
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.2 }}
              className="mb-6 overflow-hidden"
            >
              <Image src="/logo.png" alt="Logo" width={200} height={80} className="object-contain" />
            </motion.div>
            <CardDescription className="text-gray-400">Terminal Access • Secure Login</CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4 pt-6">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-gray-300">Username</Label>
                <div className="relative group">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 group-focus-within:text-primary transition-colors" />
                  <Input 
                    id="username" 
                    placeholder="admin" 
                    className="pl-10 bg-white/5 border-white/10 text-white focus:border-primary/50 focus:ring-primary/20 transition-all"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required 
                  />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="pin" className="text-gray-300">PIN / Password</Label>
                </div>
                <div className="relative group">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 group-focus-within:text-primary transition-colors" />
                  <Input 
                    id="pin" 
                    type="password" 
                    placeholder="••••" 
                    className="pl-10 bg-white/5 border-white/10 text-white focus:border-primary/50 focus:ring-primary/20 transition-all"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col space-y-6 pt-6 pb-8">
              <Button type="submit" className="w-full h-12 text-lg font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 transition-all active:scale-[0.98]" disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "Authorize Entry"}
              </Button>
              <div className="flex items-center gap-2 text-[10px] text-gray-500 uppercase tracking-widest">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                System Online • Encrypted Session
              </div>
            </CardFooter>
          </form>
        </Card>
      </motion.div>
    </div>
  );
}
