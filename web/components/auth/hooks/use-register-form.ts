import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { webApiClient } from "@/lib/api/client";

export const registerSchema = z
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

export type RegisterFormValues = z.infer<typeof registerSchema>;

export function useRegisterForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);

  const form = useForm<RegisterFormValues>({
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

  async function onSubmit(values: RegisterFormValues) {
    if (isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const response = await webApiClient.register(values);
      localStorage.setItem("drx_token", response.token);

      if (response.user?.require_email_verification) {
        toast.success(
          "Account created successfully! Please check your email inbox and spam folder for the verification link."
        );
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

  return {
    form,
    loading,
    error,
    onSubmit,
  };
}
