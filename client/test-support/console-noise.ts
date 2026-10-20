// Log prefixes the app writes from fire-and-forget async work.
// Rationale: docs/CLIENT_COMMENTS.md#block-test-support-console-noise-ts-L1
const SUPPRESSIBLE_PREFIXES = [
  "[Logger]",
  "[Sync]",
  "[DB]",
  "[LicenseGuard]",
  "[API Error]",
  "API request failed:",
];

export function isSuppressibleTestNoise(args: unknown[]): boolean {
  const [first] = args;

  if (typeof first !== "string") {
    return false;
  }

  return SUPPRESSIBLE_PREFIXES.some((prefix) => first.startsWith(prefix));
}

type Writer = (...args: unknown[]) => void;

export interface FilterableConsole {
  log: Writer;
  warn: Writer;
}

// Wraps `log` and `warn` so a suppressible line is never written.
// Rationale: docs/CLIENT_COMMENTS.md#block-test-support-console-noise-ts-L33
export function installConsoleNoiseFilter(target: FilterableConsole, enabled: boolean): void {
  if (!enabled) {
    return;
  }

  const original = { log: target.log, warn: target.warn };

  target.log = (...args: unknown[]) => {
    if (!isSuppressibleTestNoise(args)) original.log(...args);
  };

  target.warn = (...args: unknown[]) => {
    if (!isSuppressibleTestNoise(args)) original.warn(...args);
  };
}
