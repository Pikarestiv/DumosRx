/** console.log gated to non-production builds: keeps debug/trace output out
 * of the console on app.dumosrx.com while still showing during `next dev`.
 * Use console.error/warn directly for things that should surface regardless
 * of environment. */
export function devLog(...args: unknown[]) {
  if (process.env.NODE_ENV !== "production") {
    console.log(...args);
  }
}
