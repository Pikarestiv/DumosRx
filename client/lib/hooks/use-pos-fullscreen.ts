import { create } from "zustand";

/** Whether the POS screen is in its "fullscreen" focus mode (browser
 * Fullscreen API active + the app's own sidebar hidden). Deliberately not
 * persisted: fullscreen never survives a reload/navigation on its own (the
 * browser exits it), so a stale "true" here would hide the sidebar with no
 * way back in until the toggle is clicked again. Session-only, shared
 * between POSLayoutHeader (which drives it) and DashboardLayout (which
 * reads it to hide the sidebar). */
interface PosFullscreenState {
  isFullscreen: boolean;
  setFullscreen: (value: boolean) => void;
}

export const usePosFullscreenStore = create<PosFullscreenState>((set) => ({
  isFullscreen: false,
  setFullscreen: (value) => set({ isFullscreen: value }),
}));
