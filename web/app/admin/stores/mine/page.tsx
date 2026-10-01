"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminSkeleton } from "@/components/admin/admin-skeleton";
import { MyStoresTable } from "@/components/admin/stores/my-stores-table";
import { useMyRegisteredStores } from "@/lib/api/admin-hooks-stores";
import { useDebounce } from "@/hooks/use-debounce";

export default function MyStoresPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput, 400);
  const { data, isLoading, error, refetch } = useMyRegisteredStores(
    page,
    search,
  );

  const stores = data?.data ?? [];
  const meta = data?.meta;

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
          {error instanceof Error ? error.message : "Failed to load your stores"}
        </p>
        <Button onClick={() => void refetch()} variant="outline">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">
            My Stores
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">
            Every store you registered on the platform
            {meta ? ` (${meta.total})` : ""}.
          </p>
        </div>
        <Button
          className="bg-indigo-600 hover:bg-indigo-700 font-bold shadow-lg shadow-indigo-600/20"
          onClick={() => router.push("/admin/stores/new")}
        >
          <Plus className="h-4 w-4 mr-2" />
          Register Store
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          aria-label="Search my stores"
          placeholder="Search by store, owner or email"
          className="pl-9"
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            setPage(1);
          }}
        />
      </div>

      <MyStoresTable stores={stores} />

      {meta && meta.last_page > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {meta.current_page} of {meta.last_page}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={page >= meta.last_page}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
