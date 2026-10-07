/**
 * Log prefixes the app writes from fire-and-forget async work. These carry no
 * information a test run needs, and writing one after the last test has
 * finished is what strands a console rpc at worker teardown. See
 * client/AGENTS.md, "Console noise is suppressed in CI".
 */
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

/**
 * Wraps `log` and `warn` so a suppressible line is never written. `info` and
 * `error` are deliberately untouched: five test files assert on them, and
 * they are low-volume enough not to be worth the risk.
 *
 * A no-op when `enabled` is false, which is how a local run keeps the output
 * a developer debugs with.
 */
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
