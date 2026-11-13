import type { CSSProperties } from "react";

const HIDDEN_BAR = {
  "--toast-bar-color": "transparent",
  "--toast-track-color": "transparent",
} as CSSProperties;

export function toastTiming(durationMs: number): { duration: number; style: CSSProperties } {
  if (!Number.isFinite(durationMs)) return { duration: durationMs, style: HIDDEN_BAR };
  return {
    duration: durationMs,
    style: { "--toast-timer-duration": `${durationMs}ms` } as CSSProperties,
  };
}
