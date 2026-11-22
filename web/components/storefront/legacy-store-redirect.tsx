"use client";

import { useEffect, useSyncExternalStore } from "react";

import { legacyStoreTarget } from "@/lib/storefront-legacy-path";

const emptySubscribe = () => () => {};

export function LegacyStoreRedirect() {
  const target = useSyncExternalStore(
    emptySubscribe,
    () => legacyStoreTarget(window.location.pathname) + window.location.search + window.location.hash,
    () => null,
  );

  useEffect(() => {
    if (target) {
      window.location.replace(target);
    }
  }, [target]);

  return (
    <main className="flex min-h-screen items-center justify-center p-6 text-center">
      <p>
        This store has moved.{" "}
        {target ? (
          <a className="underline" href={target}>
            Continue to the store
          </a>
        ) : null}
      </p>
    </main>
  );
}
