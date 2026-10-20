import { create } from "zustand";

// Whether the POS screen is in its "fullscreen" focus mode (browser Fullscreen API active + the app's own sidebar hidden).
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-pos-fullscreen-ts-L3
interface PosFullscreenState {
  isFullscreen: boolean;
  setFullscreen: (value: boolean) => void;
}

export const usePosFullscreenStore = create<PosFullscreenState>((set) => ({
  isFullscreen: false,
  setFullscreen: (value) => set({ isFullscreen: value }),
}));
