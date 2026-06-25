"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Loader2,
  AlertCircle,
  Building,
  Mail,
  Phone,
  Lock,
  User,
  ShieldCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { webApiClient } from "@/lib/api/client";
import { motion } from "framer-motion";
import React from "react";
import { toast } from "sonner";

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

const registerSchema = z
  .object({
    store_name: z
      .string()
      .min(2, { message: "Store name must be at least 2 characters" }),
    store_type: z.enum(["pharmacy", "supermarket", "grocery", "general"]),
    first_name: z
      .string()
      .min(2, { message: "First name must be at least 2 characters" }),
    last_name: z
      .string()
      .min(2, { message: "Last name must be at least 2 characters" }),
    email: z.email({ message: "Invalid email address" }),
    username: z
      .string()
      .min(3, { message: "Username must be at least 3 characters" })
      .optional(),
    phone: z
      .string()
      .min(10, { message: "Phone number must be at least 10 digits" }),
    pin: z.string().length(4, { message: "PIN must be exactly 4 digits" }),
    password: z
      .string()
      .min(8, { message: "Password must be at least 8 characters" }),
    password_confirmation: z.string(),
  })
  .refine((data) => data.password === data.password_confirmation, {
    message: "Passwords do not match",
    path: ["password_confirmation"],
  });

export function RegisterForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSubmittingRef = React.useRef(false);

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      store_name: "",
      store_type: "pharmacy",
      first_name: "",
      last_name: "",
      email: "",
      username: "",
      phone: "",
      pin: "",
      password: "",
      password_confirmation: "",
    },
  });

  async function onSubmit(values: z.infer<typeof registerSchema>) {
    if (isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const response = await webApiClient.register(values);
      localStorage.setItem("drx_token", response.token);
      
      if (response.user?.require_email_verification) {
        toast.success("Account created successfully! Please check your email inbox and spam folder for the verification link.");
      } else {
        toast.success("Account created successfully!");
      }
      
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  }

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
        delayChildren: 0.1,
      },
    },
  };

  const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <div className="w-full">
      {error && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mb-6"
        >
          <Alert
            variant="destructive"
            className="bg-destructive/10 border-destructive/20 text-destructive"
          >
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Registration Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </motion.div>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="space-y-4"
          >
            <motion.div variants={item}>
              <FormField
                control={form.control}
                name="store_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-300">
                      Store / Store Name
                    </FormLabel>
                    <FormControl>
                      <div className="relative group">
                        <Building className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 group-focus-within:text-accent transition-colors" />
                        <Input
                          placeholder="Dumos Store"
                          className="pl-10 bg-white/5 border-white/10 text-white focus:border-accent/50 focus:ring-accent/20 h-11"
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
                name="store_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-300">Store Type</FormLabel>
                    <FormControl>
                      <select
                        className="flex h-11 w-full rounded-md bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:border-accent/50 focus:ring-accent/20 focus:outline-none transition-colors"
                        {...field}
                      >
                        <option value="pharmacy" className="text-gray-900">
                          Pharmacy
                        </option>
                        <option value="supermarket" className="text-gray-900">
                          Supermarket
                        </option>
                        <option value="grocery" className="text-gray-900">
                          Grocery
                        </option>
                        <option value="general" className="text-gray-900">
                          General Store
                        </option>
                      </select>
                    </FormControl>
                    <FormMessage className="text-xs text-red-400" />
                  </FormItem>
                )}
              />
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <motion.div variants={item}>
                <FormField
                  control={form.control}
                  name="first_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-300">
                        First Name
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="John"
                          className="bg-white/5 border-white/10 text-white focus:border-accent/50 focus:ring-accent/20 h-11"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage className="text-xs text-red-400" />
                    </FormItem>
                  )}
                />
              </motion.div>

              <motion.div variants={item}>
                <FormField
                  control={form.control}
                  name="last_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-300">Last Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Doe"
                          className="bg-white/5 border-white/10 text-white focus:border-accent/50 focus:ring-accent/20 h-11"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage className="text-xs text-red-400" />
                    </FormItem>
                  )}
                />
              </motion.div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <motion.div variants={item}>
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-300">
                        Email Address
                      </FormLabel>
                      <FormControl>
                        <div className="relative group">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 group-focus-within:text-accent transition-colors" />
                          <Input
                            placeholder="name@example.com"
                            type="email"
                            className="pl-10 bg-white/5 border-white/10 text-white focus:border-accent/50 focus:ring-accent/20 h-11"
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
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-300">
                        Phone Number
                      </FormLabel>
                      <FormControl>
                        <div className="relative group">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 group-focus-within:text-accent transition-colors" />
                          <Input
                            placeholder="08012345678"
                            type="tel"
                            className="pl-10 bg-white/5 border-white/10 text-white focus:border-accent/50 focus:ring-accent/20 h-11"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage className="text-xs text-red-400" />
                    </FormItem>
                  )}
                />
              </motion.div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <motion.div variants={item}>
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-300">Password</FormLabel>
                      <FormControl>
                        <div className="relative group">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 group-focus-within:text-accent transition-colors" />
                          <Input
                            type="password"
                            placeholder="******"
                            className="pl-10 bg-white/5 border-white/10 text-white focus:border-accent/50 focus:ring-accent/20 h-11"
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
                  name="password_confirmation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-300">
                        Confirm Password
                      </FormLabel>
                      <FormControl>
                        <div className="relative group">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 group-focus-within:text-accent transition-colors" />
                          <Input
                            type="password"
                            placeholder="******"
                            className="pl-10 bg-white/5 border-white/10 text-white focus:border-accent/50 focus:ring-accent/20 h-11"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage className="text-xs text-red-400" />
                    </FormItem>
                  )}
                />
              </motion.div>
            </div>

            <motion.div variants={item} className="my-6">
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                <h4 className="text-sm font-semibold text-primary mb-1">
                  Local POS Access
                </h4>
                <p className="text-xs text-gray-400 mb-4">
                  These credentials are used by you and your staff to quickly
                  log into the local desktop terminal, separately from your
                  cloud web account.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-300">
                          Username
                        </FormLabel>
                        <FormControl>
                          <div className="relative group">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 group-focus-within:text-primary transition-colors" />
                            <Input
                              placeholder="jdoe_rx"
                              className="pl-10 bg-white/5 border-white/10 text-white focus:border-primary/50 focus:ring-primary/20 h-11"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage className="text-xs text-red-400" />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="pin"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-300">
                          Terminal PIN (4 Digits)
                        </FormLabel>
                        <FormControl>
                          <div className="relative group">
                            <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 group-focus-within:text-primary transition-colors" />
                            <Input
                              placeholder="1234"
                              maxLength={4}
                              className="pl-10 bg-white/5 border-white/10 text-white focus:border-primary/50 focus:ring-primary/20 h-11 font-mono tracking-widest"
                              {...field}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.value.replace(/\D/g, ""),
                                )
                              }
                            />
                          </div>
                        </FormControl>
                        <FormMessage className="text-xs text-red-400" />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </motion.div>

            <motion.div variants={item} className="pt-4">
              <Button
                type="submit"
                className="w-full h-12 text-lg font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/10 transition-all active:scale-[0.98]"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  "Create Secure Account"
                )}
              </Button>
            </motion.div>

            <motion.div variants={item} className="text-center pt-2">
              <p className="text-sm text-gray-500">
                Already registered?{" "}
                <Link
                  href="/login"
                  className="font-bold text-accent/80 hover:text-accent transition-colors cursor-pointer"
                >
                  Sign In
                </Link>
              </p>
            </motion.div>
          </motion.div>
        </form>
      </Form>
    </div>
  );
}
