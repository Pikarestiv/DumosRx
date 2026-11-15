"use client";

import { useEffect, useState } from "react";

import { legacyStoreTarget } from "@/lib/storefront-legacy-path";

export function LegacyStoreRedirect() {
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    const next = legacyStoreTarget(window.location.pathname) + window.location.search + window.location.hash;
    setTarget(next);
    window.location.replace(next);
  }, []);

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
