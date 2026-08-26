"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { NewStoreForm } from "@/components/admin/stores/new-store-form";

export default function AdminNewStorePage() {
  const router = useRouter();

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
            Register New Store
          </h1>
          <p className="text-slate-500 font-medium">
            Create a new partner store on the platform
          </p>
        </div>
      </div>

      <NewStoreForm />
    </div>
  );
}
