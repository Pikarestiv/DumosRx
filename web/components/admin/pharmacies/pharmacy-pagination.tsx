"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PaginationMeta {
  current_page: number;
  last_page: number;
  total: number;
}

interface PharmacyPaginationProps {
  meta: PaginationMeta;
  onPageChange: (page: number) => void;
}

export function PharmacyPagination({ meta, onPageChange }: PharmacyPaginationProps) {
  if (meta.last_page <= 1) return null;

  return (
    <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
        Page {meta.current_page} of {meta.last_page}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={meta.current_page === 1}
          onClick={() => onPageChange(meta.current_page - 1)}
          className="h-8 border-2 font-black text-xs uppercase tracking-tighter"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Prev
        </Button>
        <div className="flex gap-1">
          {Array.from(
            { length: Math.min(5, meta.last_page) },
            (_, i) => {
              const pageNum = i + 1;
              return (
                <Button
                  key={i}
                  variant={
                    pageNum === meta.current_page
                      ? "default"
                      : "ghost"
                  }
                  size="sm"
                  onClick={() => onPageChange(pageNum)}
                  className={`h-8 w-8 p-0 font-bold ${pageNum === meta.current_page ? "bg-indigo-600" : ""}`}
                >
                  {pageNum}
                </Button>
              );
            },
          )}
          {meta.last_page > 5 && (
            <span className="px-2 text-slate-400">...</span>
          )}
          {meta.last_page > 5 && (
            <Button
              variant={
                meta.last_page === meta.current_page
                  ? "default"
                  : "ghost"
              }
              size="sm"
              onClick={() => onPageChange(meta.last_page)}
              className={`h-8 w-8 p-0 font-bold ${meta.last_page === meta.current_page ? "bg-indigo-600" : ""}`}
            >
              {meta.last_page}
            </Button>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={
            meta.current_page === meta.last_page
          }
          onClick={() => onPageChange(meta.current_page + 1)}
          className="h-8 border-2 font-black text-xs uppercase tracking-tighter"
        >
          Next
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
