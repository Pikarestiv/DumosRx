export interface ServerEnvironment {
  name: string;
  url: string;
}

export const API_ENVIRONMENTS: ServerEnvironment[] = [
  {
    name: "Production Server",
    url: process.env.NEXT_PUBLIC_API_URL_PROD || "https://api.dumosrx.com/api/v1",
  },
  {
    name: "Staging / Dev Server",
    url: process.env.NEXT_PUBLIC_API_URL_STAGING || "https://api.dev.dumosrx.com/api/v1",
  },
  {
    name: "Local Development Server (Herd)",
    url: process.env.NEXT_PUBLIC_API_URL_LOCAL_HERD || "https://dumosrx.test/api/v1",
  },
  {
    name: "Local Development Server (localhost)",
    url: process.env.NEXT_PUBLIC_API_URL_LOCAL_NODE || "http://localhost:8000/api/v1",
  },
];

export const APP_ENVIRONMENTS: ServerEnvironment[] = [
  {
    name: "Production App",
    url: process.env.NEXT_PUBLIC_APP_URL || "https://app.dumosrx.com",
  },
  {
    name: "Staging / Dev App",
    url: process.env.NEXT_PUBLIC_APP_URL_STAGING || "https://app.dev.dumosrx.com",
  },
  {
    name: "Local App (Next dev server)",
    url: process.env.NEXT_PUBLIC_APP_URL_LOCAL || "http://localhost:3001",
  },
];

interface OverrideOptions {
  isProduction: boolean;
  fallback: string;
}

const canonicalise = (url: string) => url.trim().replace(/\/+$/, "");

function resolveOverride(
  stored: string | null,
  allowed: ServerEnvironment[],
  { isProduction, fallback }: OverrideOptions,
): string {
  if (!stored) return fallback;

  if (!isProduction) return stored;

  const match = allowed.find((env) => canonicalise(env.url) === canonicalise(stored));

  return match ? match.url : fallback;
}

export function resolveApiOverride(stored: string | null, options: OverrideOptions): string {
  return resolveOverride(stored, API_ENVIRONMENTS, options);
}

export function resolveAppOverride(stored: string | null, options: OverrideOptions): string {
  return resolveOverride(stored, APP_ENVIRONMENTS, options);
}
