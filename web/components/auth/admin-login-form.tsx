"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2, AlertCircle, Mail, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { webApiClient } from "@/lib/api/client";
import { motion } from "framer-motion";
import { useAdminAuthStore } from "@/lib/store/use-admin-auth-store";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const loginSchema = z.object({
  email: z.email({ message: "Invalid email address" }),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
});
export function AdminLoginForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setToken, setUser } = useAdminAuthStore();

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: z.infer<typeof loginSchema>) {
    setLoading(true);
    setError(null);

    try {
      const response = await webApiClient.login(values);
      
      if (response.user.role !== 'super_admin') {
        throw new Error("Access Denied: Administrative privileges required.");
      }

      localStorage.setItem("drx_admin_token", response.token);
      setToken(response.token);
      setUser(response.user);
      router.push("/admin");
    } catch (err: any) {
      setError(err.message || "Invalid administrative credentials.");
    } finally {
      setLoading(false);
    }
  }

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const item = {
    hidden: { opacity: 0, x: -20 },
    show: { opacity: 1, x: 0 },
  };

  return (
    <div className="w-full">
      {error && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="mb-6">
          <Alert variant="destructive" className="bg-red-500/10 border-red-500/20 text-red-500">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Security Violation</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </motion.div>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
            <motion.div variants={item}>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300">Admin Identifier</FormLabel>
                    <FormControl>
                      <div className="relative group">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-indigo-500 transition-colors" />
                        <Input
                          placeholder="admin@dumosrx.com"
                          className="pl-10 bg-white/5 border-white/10 text-white focus:border-indigo-500/50 focus:ring-indigo-500/20 h-12"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage className="text-xs text-red-400" />
                  </FormItem>
                )}
              />
            </motion.div>

            <motion.div variants={item}>
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-300">Security Clearance Key</FormLabel>
                    <FormControl>
                      <div className="relative group">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-indigo-500 transition-colors" />
                        <Input
                          type="password"
                          placeholder="••••••••"
                          className="pl-10 bg-white/5 border-white/10 text-white focus:border-indigo-500/50 focus:ring-indigo-500/20 h-12"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage className="text-xs text-red-400" />
                  </FormItem>
                )}
              />
            </motion.div>

            <motion.div variants={item} className="pt-2">
              <Button type="submit" className="w-full h-12 text-lg font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 transition-all active:scale-[0.98]" disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "Authenticate & Access"}
              </Button>
            </motion.div>
          </motion.div>
        </form>
      </Form>
    </div>
  );
}
