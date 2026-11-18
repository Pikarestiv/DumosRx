"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminSkeleton } from "@/components/admin/admin-skeleton";
import { UserProfilePanel } from "@/components/admin/users/user-profile-panel";
import { useAdminUsers } from "@/lib/api/admin-hooks";

function UserDetailsContent() {
  const router = useRouter();
  const userId = useSearchParams()?.get("id") ?? null;
  const { data, isLoading, isError, refetch } = useAdminUsers(1, userId ?? "");
  const user = userId ? (data?.data.find((candidate) => candidate.id === userId) ?? null) : null;

  const backToUsers = (
    <Button variant="ghost" className="font-bold -ml-3 text-slate-500" onClick={() => router.push("/admin/users/")}>
      <ArrowLeft className="h-4 w-4 mr-2" />
      Users
    </Button>
  );

  if (userId && isLoading) return <AdminSkeleton />;

  if (!userId || isError || !user) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <ShieldAlert className="h-10 w-10 text-rose-500" />
        <p className="font-bold text-rose-500">{isError ? "Could not load this user." : "No user was found."}</p>
        <div className="flex gap-2">
          {backToUsers}
          {isError ? (
            <Button variant="outline" onClick={() => void refetch()}>
              Retry
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {backToUsers}
      <UserProfilePanel user={user} />
    </div>
  );
}

export default function UserDetailsPage() {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <UserDetailsContent />
    </Suspense>
  );
}
