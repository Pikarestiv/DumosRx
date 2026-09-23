import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingOverlayProps {
  message?: string;
  /** 0-100. Omit for an indeterminate spinner only - pass this when there
   * are real stages to report. Steps with no progress hook of their own
   * (e.g. a PDF worker that only reports back once, at the end) will hold
   * the bar at its pre-step value and jump when they resolve - that's
   * expected, not a bug. */
  progress?: number;
  /** Shows a Cancel button when provided. Only wire this up for steps that
   * can actually be aborted cleanly (e.g. terminating a Web Worker) - for a
   * synchronous main-thread step there's nothing to cancel into. */
  onCancel?: () => void;
}

/** Full-viewport overlay for work that runs long enough to look like the app
 * hung with no feedback at all - whether that's genuinely blocking the main
 * thread, or just a slow off-thread/async step with nothing else on screen
 * to show for it. Mount it, then yield a frame (e.g.
 * `await new Promise(r => requestAnimationFrame(r))`) before starting a
 * synchronous step, so the overlay actually gets to paint first. */
export function LoadingOverlay({ message = "Working...", progress, onCancel }: LoadingOverlayProps) {
  const showBar = typeof progress === "number";
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm">
      <Loader2 className="h-14 w-14 animate-spin text-primary" />
      {showBar && (
        <div className="w-56">
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300 ease-out animate-progress-stripes"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        </div>
      )}
      <p className={cn("text-sm text-muted-foreground", showBar && "tabular-nums")}>
        {message}
        {showBar && ` (${Math.round(progress)}%)`}
      </p>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="mt-1 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
