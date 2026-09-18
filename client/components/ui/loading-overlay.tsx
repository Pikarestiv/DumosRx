import { Loader2 } from "lucide-react";

/** Full-viewport overlay for work that blocks the main thread long enough
 * (e.g. rendering a large PDF) that the app would otherwise look hung with
 * no feedback at all. Mount it, then yield a frame (e.g.
 * `await new Promise(r => requestAnimationFrame(r))`) before starting the
 * blocking work, so the overlay actually gets to paint first. */
export function LoadingOverlay({ message = "Working..." }: { message?: string }) {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
