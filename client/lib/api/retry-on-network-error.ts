// Retries a request only when no HTTP response was ever received (a thrown network/timeout error, which `base-client.ts`'s `request()` never a…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#api-retry-on-network-error-ts-L1
export async function withNetworkRetry<T>(
  fn: () => Promise<T>,
  { attempts = 3, baseDelayMs = 500 }: { attempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const hasStatus = error instanceof Error && "status" in error && (error as Error & { status?: number }).status !== undefined;
      if (hasStatus || attempt === attempts) {
        throw error;
      }
      const delay = baseDelayMs * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
