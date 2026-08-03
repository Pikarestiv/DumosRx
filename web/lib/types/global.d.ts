import type { ApiLogEntry } from "@/lib/api/logger";

/** Callable Smartsupp global — the loader snippet attaches a `_` queue array
 * directly onto the function itself before the real script has loaded. */
export interface SmartsuppFn {
  (...args: unknown[]): void;
  _: unknown[][];
}

declare global {
  interface Window {
    __DRX_API_LOGS__?: ApiLogEntry[];
    _smartsupp?: { key?: string };
    smartsupp?: SmartsuppFn;
  }
}

export {};
