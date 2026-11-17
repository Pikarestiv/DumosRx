import * as Sentry from "@sentry/nextjs";

interface IdentityUser {
  id: string;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  role?: string | null;
}

interface IdentityStore {
  id?: string | null;
  name?: string | null;
  store_type?: string | null;
}

const fullName = (user: IdentityUser) => [user.first_name, user.last_name].filter(Boolean).join(" ").trim();

export function applySentryIdentity(user: IdentityUser | null, store: IdentityStore | null | undefined): void {
  Sentry.setTag("store_id", store?.id ?? undefined);
  Sentry.setTag("store_name", store?.name ?? undefined);
  Sentry.setTag("store_type", store?.store_type ?? undefined);

  if (!user) {
    Sentry.setUser(null);
    Sentry.setTag("staff_name", undefined);
    Sentry.setTag("staff_role", undefined);
    return;
  }

  const name = fullName(user) || user.username || undefined;
  Sentry.setUser({ id: user.id, username: user.username ?? undefined, name, role: user.role ?? undefined } as Sentry.User);
  Sentry.setTag("staff_name", name);
  Sentry.setTag("staff_role", user.role ?? undefined);
}
