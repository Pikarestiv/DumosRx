"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function AdminSkeleton() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-10 w-[300px]" />
          <Skeleton className="h-4 w-[250px]" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-10 w-[150px]" />
          <Skeleton className="h-10 w-[180px]" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-3xl" />
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <Skeleton className="h-[500px] w-full rounded-3xl" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-[250px] w-full rounded-3xl" />
          <Skeleton className="h-[300px] w-full rounded-3xl" />
        </div>
      </div>
    </div>
  );
}
