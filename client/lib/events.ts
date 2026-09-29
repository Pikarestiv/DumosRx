export const APP_EVENTS = {
  syncCompleted: "dumos_sync_completed",
  subscriptionUpdated: "dumos_subscription_updated",
  dbSaveFailed: "dumos_db_save_failed",
  dbReadOnlyWriteBlocked: "dumos_db_read_only_write_blocked",
  authTokenSet: "auth_token_set",
  authTokenCleared: "auth_token_cleared",
} as const;

export type AppEventName = (typeof APP_EVENTS)[keyof typeof APP_EVENTS];

export interface AppEventDetails {
  [APP_EVENTS.syncCompleted]: { updatedTables: string[] };
  [APP_EVENTS.subscriptionUpdated]: undefined;
  [APP_EVENTS.dbSaveFailed]: { error: unknown };
  [APP_EVENTS.dbReadOnlyWriteBlocked]: undefined;
  [APP_EVENTS.authTokenSet]: undefined;
  [APP_EVENTS.authTokenCleared]: undefined;
}

type DetailOf<K extends AppEventName> = AppEventDetails[K];

export function emitAppEvent<K extends AppEventName>(
  name: K,
  ...[detail]: DetailOf<K> extends undefined ? [] : [DetailOf<K>]
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export function onAppEvent<K extends AppEventName>(
  name: K,
  handler: (detail: DetailOf<K> | undefined) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const listener = (event: Event) => {
    handler((event as CustomEvent<DetailOf<K>>).detail);
  };

  window.addEventListener(name, listener);
  return () => window.removeEventListener(name, listener);
}
