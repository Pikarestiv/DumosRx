export function asAsync<A extends unknown[], R>(
  fn: (...args: A) => R,
): (...args: A) => Promise<R> {
  return (...args) => new Promise<R>((resolve) => resolve(fn(...args)));
}
