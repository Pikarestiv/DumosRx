"use client";

import { useState } from "react";
import {
  Check,
  Copy,
  Link2,
  Loader2,
  Pencil,
  ShieldAlert,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useMyReferrals,
  checkReferralCode,
  useUpdateReferralCodeMutation,
} from "@/lib/api/admin-hooks";
import {
  useAdminAuthStore,
  checkIsSuperAdmin,
} from "@/lib/store/use-admin-auth-store";
import { AdminSkeleton } from "@/components/admin/admin-skeleton";

export default function MyReferralsPage() {
  const { user } = useAdminAuthStore();
  const isSuperAdmin = checkIsSuperAdmin(user?.role);
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const { data, isLoading, error, refetch } = useMyReferrals();
  const updateCode = useUpdateReferralCodeMutation();

  const handleCopy = () => {
    if (!data?.referral_link) return;
    navigator.clipboard.writeText(data.referral_link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startEditing = () => {
    setCodeInput(data?.platform_referral_code || "");
    setIsEditing(true);
  };

  const handleSave = async () => {
    const trimmed = codeInput.trim();
    if (!trimmed) return;

    try {
      const { available, code } = await checkReferralCode(trimmed, user?.id);
      if (!available) {
        toast.error(`"${code}" is already taken. Try another.`);
        return;
      }
      await updateCode.mutateAsync({ code: trimmed });
      toast.success("Referral code updated");
      setIsEditing(false);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to check code availability",
      );
    }
  };

  if (isLoading && !data) {
    return <AdminSkeleton />;
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="p-4 bg-rose-500/10 text-rose-500 rounded-full">
          <ShieldAlert className="h-10 w-10" />
        </div>
        <p className="text-rose-500 font-bold">
          {error instanceof Error ? error.message : "Failed to load referrals"}
        </p>
        <Button onClick={() => refetch()} variant="outline">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">
          My Referrals
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">
          {isSuperAdmin
            ? "Accounts you've registered or that signed up via your link. Commission/remittance is handled outside the platform."
            : "Accounts you've registered or that signed up via your link."}
        </p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-8 shadow-sm border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-indigo-500" />
            <h2 className="font-bold text-slate-900 dark:text-white">
              Your Referral Link
            </h2>
          </div>
          {!isEditing && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={startEditing}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
        </div>
        <p className="text-sm text-slate-500 mb-4">
          Share this with a new pharmacy. Accounts that sign up through it are
          automatically attributed to you.
        </p>

        {isEditing ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-2">
              <span className="text-sm font-mono text-slate-400 shrink-0">
                .../register?agent_ref=
              </span>
              <Input
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                placeholder="e.g. pikarestiv"
                className="border-0 bg-transparent shadow-none focus-visible:ring-0 px-0 font-mono h-8"
                autoFocus
              />
            </div>
            <p className="text-xs text-slate-400 px-1">
              Lowercase letters, numbers, and hyphens only, 3–32 characters.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={updateCode.isPending || !codeInput.trim()}
                className="rounded-xl"
              >
                {updateCode.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Save"
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsEditing(false)}
                disabled={updateCode.isPending}
                className="rounded-xl"
              >
                <X className="h-4 w-4" />
                Cancel
              </Button>
            </div>
          </div>
        ) : data?.referral_link ? (
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3">
            <span className="flex-1 text-sm font-mono text-slate-700 dark:text-slate-300 truncate">
              {data.referral_link}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="h-4 w-4 text-emerald-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-slate-400">
            No referral code on this account yet.
          </p>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-8 shadow-sm border border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2 mb-6">
          <Users className="h-4 w-4 text-indigo-500" />
          <h2 className="font-bold text-slate-900 dark:text-white">
            Accounts ({data?.total ?? 0})
          </h2>
        </div>

        {!data?.accounts.length ? (
          <p className="text-sm text-slate-400 text-center py-8">
            No accounts registered or referred yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-widest font-bold border-b border-slate-200 dark:border-slate-800">
                  <th className="pb-3 pr-4">Name</th>
                  <th className="pb-3 pr-4">Email</th>
                  <th className="pb-3 pr-4">Store</th>
                  <th className="pb-3">Registered</th>
                </tr>
              </thead>
              <tbody>
                {data.accounts.map((a) => (
                  <tr
                    key={a.id}
                    className="border-b border-slate-100 dark:border-slate-800/50 last:border-0"
                  >
                    <td className="py-3 pr-4 font-semibold text-slate-900 dark:text-white">
                      {a.name}
                    </td>
                    <td className="py-3 pr-4 text-slate-500">{a.email}</td>
                    <td className="py-3 pr-4 text-slate-500">
                      {a.store_name || "N/A"}
                    </td>
                    <td className="py-3 text-slate-500">
                      {new Date(a.registered_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
