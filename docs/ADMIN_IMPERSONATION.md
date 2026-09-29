# Admin impersonation handoff

The Store Fleet row action that signs a super admin into the app as a store
owner. Implemented by `web/hooks/use-store-impersonation.ts`; the server
side is `POST /admin/stores/{id}/impersonate` plus `AuthHandoffController`.

## Environment mismatch challenge

A dev/staging admin session (talking to a non-production API) whose "App
URL" override was never set falls back to the hardcoded production
`app.dumosrx.com`, which would send a real handoff code to production from
a session the admin believes is fully sandboxed. The hook challenges
exactly that mismatch — non-production API plus an un-overridden production
app URL — and leaves a genuine production session alone.

## Two codes, minted one at a time

Impersonation needs two handoff codes: one for the owner's session and one
to get back to the admin's own session. They are minted sequentially rather
than with `Promise.all` so that if the second mint fails we still hold the
first code and can burn it. Consuming a code is the only invalidation
`AuthHandoffController` exposes (`consume` is an atomic `Cache::pull`
get-and-delete), so the hook redeems and discards it instead of leaving a
live code in the cache for the rest of its 60 s TTL. If the burn also
fails, the toast says so explicitly.

## Codes travel in the URL fragment

The redirect puts both codes after `#`, never in the query string. A
fragment is not sent to the destination server and never appears in its
access logs or in a `Referer` header, so the `return_code` — which wraps
the super admin's own live token — stays client-side only.
