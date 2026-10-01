/**
 * Retries a request only when no HTTP response was ever received (a thrown
 * network/timeout error, which `base-client.ts`'s `request()` never attaches
 * a `.status` to) - never on an HTTP status, including 5xx. A real response
 * means the server already decided the outcome; retrying it risks acting on
 * a request that can never succeed (e.g. a genuine unique-constraint race
 * surfaces as a 500, not a 422) and burns the shared `throttle:auth` bucket
 * for nothing. Exponential backoff between the (default) 3 attempts.
 */
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
