const LOCAL_HOST = /^(localhost|127\.0\.0\.1)(:|\/|$)/;

export function storefrontUrl(base: string, slug: string): string {
  const root = base.replace(/\/+$/, "");
  const withScheme = /^https?:\/\//.test(root)
    ? root
    : `${LOCAL_HOST.test(root) ? "http" : "https"}://${root}`;
  return `${withScheme}/${slug}`;
}
