import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingOverlayProps {
  message?: string;
  /** 0-100. Omit for an indeterminate spinner only - use this when there
   * are real stages to report (see useStagedProgress below). PDF rendering
   * itself blocks the main thread with no progress hook, so the bar will
   * typically sit at its pre-render value until the render finishes and
   * jumps to 100 - that's expected, not a bug. */
  progress?: number;
}

/** Full-viewport overlay for work that blocks the main thread long enough
 * (e.g. rendering a large PDF) that the app would otherwise look hung with
 * no feedback at all. Mount it, then yield a frame (e.g.
 * `await new Promise(r => requestAnimationFrame(r))`) before starting the
 * blocking work, so the overlay actually gets to paint first. */
export function LoadingOverlay({ message = "Working...", progress }: LoadingOverlayProps) {
  const showBar = typeof progress === "number";
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      {showBar && (
        <div className="w-56">
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        </div>
      )}
      <p className={cn("text-sm text-muted-foreground", showBar && "tabular-nums")}>
        {message}
        {showBar && ` (${Math.round(progress)}%)`}
      </p>
    </div>
  );
}
