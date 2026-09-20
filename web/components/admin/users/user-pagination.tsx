import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PaginationMeta } from "@/lib/types/admin";

interface UserPaginationProps {
  userMeta: PaginationMeta | undefined;
  handlePageChange: (newPage: number) => void;
}

const WINDOW_SIZE = 5;

/** Up to WINDOW_SIZE page numbers centred on the current page, clamped to the
 * real range - so past page 5 the numbers keep moving with you instead of
 * being stuck on 1..5 with no way back out except repeated "Next" clicks. */
function pageWindow(currentPage: number, lastPage: number) {
  const size = Math.min(WINDOW_SIZE, lastPage);
  let start = Math.max(1, currentPage - Math.floor(size / 2));
  if (start + size - 1 > lastPage) {
    start = lastPage - size + 1;
  }
  return Array.from({ length: size }, (_, i) => start + i);
}

export function UserPagination({ userMeta, handlePageChange }: UserPaginationProps) {
  if (!userMeta || userMeta.last_page <= 1) return null;

  const { current_page: currentPage, last_page: lastPage } = userMeta;
  const pages = pageWindow(currentPage, lastPage);
  const showLastPageJump = pages[pages.length - 1] < lastPage;
  const showEllipsis = pages[pages.length - 1] < lastPage - 1;

  return (
    <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
        Page {currentPage} of {lastPage}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage === 1}
          onClick={() => handlePageChange(currentPage - 1)}
          className="h-8 border-2 font-black text-xs uppercase tracking-tighter"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Prev
        </Button>
        <div className="flex gap-1">
          {pages.map((pageNum) => (
            <Button
              key={pageNum}
              variant={pageNum === currentPage ? "default" : "ghost"}
              size="sm"
              aria-current={pageNum === currentPage ? "page" : undefined}
              onClick={() => handlePageChange(pageNum)}
              className={`h-8 w-8 p-0 font-bold ${pageNum === currentPage ? "bg-indigo-600 hover:bg-indigo-700 text-white" : ""}`}
            >
              {pageNum}
            </Button>
          ))}
          {showEllipsis && <span className="px-2 text-slate-400">...</span>}
          {showLastPageJump && (
            <Button
              variant={lastPage === currentPage ? "default" : "ghost"}
              size="sm"
              aria-current={lastPage === currentPage ? "page" : undefined}
              onClick={() => handlePageChange(lastPage)}
              className={`h-8 w-8 p-0 font-bold ${lastPage === currentPage ? "bg-indigo-600 hover:bg-indigo-700 text-white" : ""}`}
            >
              {lastPage}
            </Button>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage === lastPage}
          onClick={() => handlePageChange(currentPage + 1)}
          className="h-8 border-2 font-black text-xs uppercase tracking-tighter"
        >
          Next
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
