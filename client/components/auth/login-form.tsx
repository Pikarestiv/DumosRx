"use client";

import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useAuth } from "@/lib/context/auth-context";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

type UserRole =
  | "super_admin"
  | "manager"
  | "specialist"
  | "sales_staff"
  | "auditor";

interface LoginFormData {
  username: string;
  password: string;
  role: UserRole | "";
}

export function LoginForm() {
  const [formData, setFormData] = useState<LoginFormData>({
    username: "",
    password: "",
    role: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Basic validation
    if (!formData.username || !formData.password) {
      setError("Please fill in all fields");
      return;
    }

    try {
      setIsLoading(true);
      await login(formData.username, formData.password);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Invalid credentials. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <motion.form
      initial="hidden"
      animate="visible"
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren: 0.1,
            delayChildren: 0.3,
          },
        },
      }}
      onSubmit={handleSubmit}
      className="space-y-4"
    >
      {error && (
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </motion.div>
      )}

      <motion.div
        variants={{
          hidden: { opacity: 0, y: 10 },
          visible: { opacity: 1, y: 0 },
        }}
        className="space-y-2"
      >
        <Label htmlFor="username">Email or Username</Label>
        <Input
          id="username"
          type="text"
          placeholder="Enter email or username"
          value={formData.username}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, username: e.target.value }))
          }
          className="bg-input border-border focus:ring-accent"
          required
        />
      </motion.div>

      <motion.div
        variants={{
          hidden: { opacity: 0, y: 10 },
          visible: { opacity: 1, y: 0 },
        }}
        className="space-y-2"
      >
        <Label htmlFor="password">Secure PIN</Label>
        <div className="flex justify-center pt-2 pb-4">
          <InputOTP
            maxLength={4}
            value={formData.password}
            onChange={(value) => setFormData((prev) => ({ ...prev, password: value }))}
          >
            <InputOTPGroup className="gap-2">
              <InputOTPSlot index={0} className="w-12 h-11 text-xl font-semibold rounded-md border border-input bg-background/50 transition-all focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary shadow-sm" />
              <InputOTPSlot index={1} className="w-12 h-11 text-xl font-semibold rounded-md border border-input bg-background/50 transition-all focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary shadow-sm" />
              <InputOTPSlot index={2} className="w-12 h-11 text-xl font-semibold rounded-md border border-input bg-background/50 transition-all focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary shadow-sm" />
              <InputOTPSlot index={3} className="w-12 h-11 text-xl font-semibold rounded-md border border-input bg-background/50 transition-all focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary shadow-sm" />
            </InputOTPGroup>
          </InputOTP>
        </div>
      </motion.div>

      <motion.div
        variants={{
          hidden: { opacity: 0, y: 10 },
          visible: { opacity: 1, y: 0 },
        }}
      >
          <Button
            type="submit"
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium cursor-pointer"
            disabled={isLoading}
          >
            {isLoading ? "Signing In..." : "Sign In"}
          </Button>
      </motion.div>

      <motion.div
        variants={{
          hidden: { opacity: 0 },
          visible: { opacity: 1 },
        }}
        className="text-center"
      >
        <Button
          variant="link"
          className="text-accent hover:text-accent/80 text-sm cursor-pointer"
        >
          Forgot your password?
        </Button>
      </motion.div>
    </motion.form>
  );
}
