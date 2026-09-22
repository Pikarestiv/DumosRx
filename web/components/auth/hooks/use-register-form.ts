import { useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { webApiClient } from "@/lib/api/client";
import { getAppURL } from "@/lib/constants";

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
  const searchParams = useSearchParams();
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
      // Attribution for a platform staff member's (super_admin/platform_admin/
      // agent) referral link, e.g. dumosrx.com/register?agent_ref=AGT-XXXXXX.
      // Separate from the customer referral program, which this form doesn't
      // currently wire up at all (a pre-existing gap, not touched here).
      const agentRef = searchParams.get("agent_ref");
      const payload = agentRef ? { ...values, agent_ref: agentRef } : values;
      const response = await webApiClient.register(payload);

      // `token` is read purely as a success signal: a 200 with no usable
      // token means the account wasn't really provisioned, and saying so
      // here beats letting the user discover it at the app. It is
      // deliberately NOT stored anywhere on this origin - see below.
      const token: unknown = response?.token;
      if (typeof token !== "string" || token.length === 0) {
        throw new Error(
          "Registration did not return a valid session. Please try signing in, or contact support if the problem persists."
        );
      }

      if (response.user?.require_email_verification) {
        toast.success(
          "Account created successfully! Please check your email inbox and spam folder for the verification link."
        );
      } else {
        toast.success("Account created successfully!");
      }

      // The registration bearer token is never written to this origin's
      // localStorage. dumosrx.com is a public marketing site that also loads
      // third-party JS (see smartsupp-widget.tsx), and nothing on this origin
      // has used that token since web/'s own dashboard was removed - so
      // persisting it only left a live, replayable api.dumosrx.com credential
      // sitting in localStorage indefinitely for any XSS foothold to read.
      //
      // The user is sent to app.dumosrx.com, which is where they already ended
      // up before (router.push("/dashboard") hit a stub that immediately did
      // window.location.href = getAppURL()). No handoff code is minted for this
      // hop on purpose: the app's only handoff consumer is
      // client/app/auth/callback/page.tsx, and its loginFromHandoff() marks the
      // arriving session as an IMPERSONATED one (sets isImpersonating, writes
      // dumos_impersonated_user, and deliberately skips setDbUser) - which for a
      // brand-new registrant would disable sync, show the impersonation banner
      // and leave them with no local user record. A fresh registrant's correct
      // entry point is the app's own onboarding (/setup), which links the cloud
      // account with the credentials they just chose.
      window.location.href = getAppURL();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed. Please try again.");
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
