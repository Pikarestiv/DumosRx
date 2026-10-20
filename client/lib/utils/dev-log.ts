// console.log gated to non-production builds:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-dev-log-ts-L1
export function devLog(...args: unknown[]) {
  if (process.env.NODE_ENV !== "production") {
    console.log(...args);
  }
}
