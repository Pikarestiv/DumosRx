const beforeReload = new Set<() => Promise<void>>();

export function registerBeforeReload(fn: () => Promise<void>): () => void {
  beforeReload.add(fn);
  return () => beforeReload.delete(fn);
}

export async function runBeforeReload(timeoutMs: number): Promise<void> {
  const flushes = Promise.allSettled([...beforeReload].map((fn) => fn()));
  await Promise.race([flushes, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
}
