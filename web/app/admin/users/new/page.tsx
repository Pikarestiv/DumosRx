"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Loader2,
  AlertCircle,
  Mail,
  Phone,
  Lock,
  ChevronLeft,
  Save,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCreatePlatformAdminMutation } from "@/lib/api/admin-hooks";

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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ROLE_OPTIONS = [
  { value: "platform_admin", label: "Platform Admin", description: "Partner/co-founder: can register accounts and grant trials" },
  { value: "agent", label: "Agent", description: "Onboarding agent: can register accounts, has a referral link" },
  { value: "super_admin", label: "Super Admin", description: "Full platform access, including managing other platform accounts" },
] as const;

const adminSchema = z
  .object({
    first_name: z
      .string()
      .min(2, { message: "First name must be at least 2 characters" }),
    last_name: z
      .string()
      .min(2, { message: "Last name must be at least 2 characters" }),
    email: z.string().email({ message: "Invalid email address" }),
    phone: z.string().optional(),
    role: z.enum(["super_admin", "platform_admin", "agent"]),
    password: z
      .string()
      .min(8, { message: "Password must be at least 8 characters" })
      // Deliberately modest: these accounts can impersonate stores, so a
      // purely alphabetic or purely numeric 8-character password isn't good
      // enough - but this is not meant to be a full strength meter.
      .regex(/[A-Za-z]/, { message: "Password must contain at least one letter" })
      .regex(/[0-9]/, { message: "Password must contain at least one number" }),
    password_confirmation: z.string(),
  })
  .refine((data) => data.password === data.password_confirmation, {
    message: "Passwords do not match",
    path: ["password_confirmation"],
  });

type AdminFormValues = z.infer<typeof adminSchema>;

export default function AdminNewUserPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // Creating a super_admin hands out impersonation access to every store on
  // the platform, so it takes an explicit second confirmation rather than
  // being one dropdown option away like the other two roles.
  const [pendingSuperAdmin, setPendingSuperAdmin] = useState<AdminFormValues | null>(
    null,
  );

  const form = useForm<z.infer<typeof adminSchema>>({
    resolver: zodResolver(adminSchema),
    defaultValues: {
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      role: "platform_admin",
      password: "",
      password_confirmation: "",
    },
  });

  const createAdminMutation = useCreatePlatformAdminMutation();
  const loading = createAdminMutation.isPending;

  function createAccount(values: AdminFormValues) {
    setError(null);
    createAdminMutation.mutate(values, {
      onSuccess: () => {
        setPendingSuperAdmin(null);
        router.push("/admin/users");
      },
      onError: (err) => {
        setPendingSuperAdmin(null);
        setError(err.message || "Failed to create platform admin.");
      },
    });
  }

  function onSubmit(values: AdminFormValues) {
    if (values.role === "super_admin") {
      setError(null);
      setPendingSuperAdmin(values);
      return;
    }
    createAccount(values);
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          className="rounded-xl"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
            Add Platform Account
          </h1>
          <p className="text-slate-500 font-medium">
            Create a new super admin, platform admin, or agent account
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-8 shadow-sm border border-slate-200 dark:border-slate-800">
        {error && (
          <Alert
            variant="destructive"
            className="mb-6 bg-rose-500/10 border-rose-500/20 text-rose-500 rounded-2xl"
          >
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form onSubmit={(e) => void form.handleSubmit(onSubmit)(e)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="first_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-600 dark:text-slate-400 font-bold uppercase text-[10px] tracking-widest">
                      First Name
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="John"
                        className="bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl h-12 font-bold focus-visible:ring-indigo-500"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="last_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-600 dark:text-slate-400 font-bold uppercase text-[10px] tracking-widest">
                      Last Name
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Doe"
                        className="bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl h-12 font-bold focus-visible:ring-indigo-500"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-600 dark:text-slate-400 font-bold uppercase text-[10px] tracking-widest">
                      Email Address
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                          placeholder="admin@platform.com"
                          type="email"
                          className="pl-11 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl h-12 font-bold focus-visible:ring-indigo-500"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-600 dark:text-slate-400 font-bold uppercase text-[10px] tracking-widest">
                      Phone Number (Optional)
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                          placeholder="08012345678"
                          type="tel"
                          className="pl-11 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl h-12 font-bold focus-visible:ring-indigo-500"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-600 dark:text-slate-400 font-bold uppercase text-[10px] tracking-widest">
                      Role
                    </FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl h-12 font-bold focus-visible:ring-indigo-500 w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ROLE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            <div>
                              <div className="font-semibold">{opt.label}</div>
                              <div className="text-xs text-muted-foreground">{opt.description}</div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-600 dark:text-slate-400 font-bold uppercase text-[10px] tracking-widest">
                      Password
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                          type="password"
                          placeholder="******"
                          className="pl-11 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl h-12 font-bold focus-visible:ring-indigo-500"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password_confirmation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-slate-600 dark:text-slate-400 font-bold uppercase text-[10px] tracking-widest">
                      Confirm Password
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                          type="password"
                          placeholder="******"
                          className="pl-11 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl h-12 font-bold focus-visible:ring-indigo-500"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end pt-4">
              <Button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700 h-14 px-8 rounded-2xl text-lg font-black shadow-lg shadow-indigo-600/20 active:scale-95 transition-all"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <Save className="mr-2 h-5 w-5" />
                )}
                Create Account
              </Button>
            </div>
          </form>
        </Form>
      </div>

      <Dialog
        open={!!pendingSuperAdmin}
        onOpenChange={(open) => {
          if (!open && !loading) setPendingSuperAdmin(null);
        }}
      >
        <DialogContent className="rounded-3xl border-red-200 dark:border-red-900 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black flex items-center gap-3 text-red-600 dark:text-red-500">
              <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-red-600" />
              </div>
              Create a Super Admin?
            </DialogTitle>
            <DialogDescription className="text-slate-500 dark:text-slate-400 font-medium pt-2">
              This grants{" "}
              <span className="font-bold text-slate-900 dark:text-white">
                {pendingSuperAdmin?.first_name} {pendingSuperAdmin?.last_name} (
                {pendingSuperAdmin?.email})
              </span>{" "}
              full platform access, including impersonating any store on the
              platform and managing every other platform account. Only continue
              if that is genuinely intended.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setPendingSuperAdmin(null)}
              disabled={loading}
              className="rounded-xl border-2 font-bold h-12"
            >
              Cancel
            </Button>
            <Button
              onClick={() => pendingSuperAdmin && createAccount(pendingSuperAdmin)}
              disabled={loading}
              className="rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold h-12 shadow-lg shadow-red-600/20"
            >
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Yes, Create Super Admin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
