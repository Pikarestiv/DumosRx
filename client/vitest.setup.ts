import { installConsoleNoiseFilter } from "./test-support/console-noise";

installConsoleNoiseFilter(console, Boolean(process.env.CI));

// jsdom implements no matchMedia, and anything rendering the house Tooltip
// (now including every product name) reads it to detect a touch device.
// Defaults to the pointer path; a test wanting the touch path overrides it.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
