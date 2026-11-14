# Product images

One image per product, shown in the catalog (list rows and detail panel), on
the POS product tiles and on the public storefront product cards. Service
images are out of scope for this release; nothing below is product-only
except the column and the endpoint path, so a `services.image_key` can follow
the same shape.

## Data model

| Column | Where | Meaning |
| --- | --- | --- |
| `products.image_key` | MySQL + local SQLite, nullable | The object key in the image bucket. The only source of truth. |
| `stores.pos_show_product_images` | MySQL + local SQLite, default `1` | Store display setting: draw images on the POS grid. Off for low-spec tills. |

- The public URL is never stored. It is derived at read time as
  `R2_PUBLIC_BASE_URL + "/" + image_key`, on the server for the storefront
  (`StorefrontProductResource::image_url`) and on the client from the base URL
  the server hands it (`GET /app/product-images/config`).
- Keys are `stores/{store_id}/products/{product_id}/{uuid}.{webp|jpg|png}`,
  built only from server values. Replacing an image issues a new key, so the
  key itself is the cache-busting version token; no separate
  `image_updated_at` column exists.
- `image_key` is server-owned. Sync push strips it from every `products`
  payload (`PushPayloadNormalizer::PRODUCT_SYNC_FORBIDDEN_FIELDS`), so a stale
  or forged push can never change it. The confirm/delete endpoints write it
  with `updated_at`/`_synced_at` stamped but without a `_version` bump, the
  documented exemption for a column the apply path never trusts from a client
  (laravel-server/AGENTS.md, A-245). Not bumping means a device's pending price
  edit is not turned into a conflict by someone else's image upload; the
  stamped `_synced_at` still moves the row into every device's next pull.
- Both columns ship in one migration. The feature reports itself enabled only
  when `products.image_key` exists, so the store toggle (and every write of
  the store column) is hidden until the migration has run (A-225).

## Configuration (env only)

| Variable | Purpose |
| --- | --- |
| `PRODUCT_IMAGES_ENABLED` | Feature flag. Off by default; while off every image surface is invisible and the write endpoints return 404. |
| `PRODUCT_IMAGES_DISK` | Filesystem disk name, default `r2`. Tests use `Storage::fake('r2')`. |
| `R2_ACCOUNT_ID` | Builds the S3 endpoint `https://{account}.r2.cloudflarestorage.com` (override with `R2_ENDPOINT`). |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | R2 API token, Object Read & Write on the one bucket. Never leaves the server. |
| `R2_BUCKET` | Bucket name. |
| `R2_PUBLIC_BASE_URL` | Public read origin (custom domain on the bucket). Required for the feature to count as configured. |

The `r2` disk is Laravel's `s3` driver (`league/flysystem-aws-s3-v3`) with a
custom endpoint, `region=auto` and path-style addressing.

## Flows (all online-only)

1. **Config.** `GET /api/v1/app/product-images/config` returns
   `{enabled, public_base_url, max_bytes, allowed_types}`. The client caches
   the last answer per API base URL in `localStorage`, so images render offline
   and an unconfigured server hides every surface.
2. **Upload.** The browser decodes the picked file, rejects non-images and
   anything over 5 MB, draws it into a canvas no larger than 512x512 and
   encodes WebP, stepping quality down until it is at most 120 KB (JPEG when
   the browser cannot encode WebP, e.g. older Safari). Then:
   - `POST /app/products/{id}/image/presign {content_type, content_length}`:
     auth, store ownership, `manage_products`; returns a presigned `PUT` URL
     (5 minute expiry, signed `Content-Type` and `Content-Length`) and the key.
     The issued key is remembered server-side for the same 5 minutes.
   - The browser `PUT`s the bytes straight to R2.
   - `POST /app/products/{id}/image/confirm {key}`: the key must be the one
     issued for this product and still remembered; the server checks the
     object exists, is at most `max_bytes` and has an allowed type, then writes
     `image_key`. The previous object is deleted only after that write commits.
     A failed check deletes the uploaded object and returns 422.
3. **Remove.** `DELETE /app/products/{id}/image` clears `image_key`, then
   deletes the object.
4. **Orphans.** `php artisan product-images:prune-orphans [--dry-run]`
   (scheduled daily) deletes objects under `stores/` older than 24 hours that
   no product row (including soft-deleted ones) references: abandoned uploads,
   failed post-commit deletes, force-deleted products.

All four write endpoints sit behind `throttle:product-images`
(30 per minute per user).

## Display and offline

- `ProductImage` (client) renders the image when the feature is enabled, the
  product has a key and it loads; otherwise the existing `CategoryIcon`. Fixed
  box, `width`/`height`, `loading="lazy"`, `decoding="async"`,
  `crossOrigin="anonymous"`.
- The service worker caches product image responses cache-first in their own
  cache (`dumosrx-product-images-v1`, exempt from the shell prune, trimmed to
  the newest 500 entries). Keys are immutable, so a cached entry is never
  stale. Tauri does not run the service worker and relies on the HTTP cache;
  an uncached image offline falls back to the icon.
- The POS grid draws images only when `stores.pos_show_product_images` is on.
- The storefront card uses a plain `<img>` (static export).

## Failure modes

| Situation | Behaviour |
| --- | --- |
| Feature flag off, or migration not run | Config says disabled; no image UI anywhere; write endpoints 404; storefront `image_url` null. |
| Offline | Upload/Replace/Remove are disabled with an explanation. The product form is unaffected. |
| Upload `PUT` fails (network, CORS, expired URL) | Error shown, nothing written; the half-uploaded object (if any) is collected by the orphan sweep. |
| Confirm fails | Error shown, product keeps its previous image. |
| Old object delete fails after confirm | Logged; the orphan sweep removes it. |
| Image fails to load (CDN down, uncached offline) | Category icon. |

## Plan gating

None. Images are available on every plan; `stores.online_store_enabled` and
the subscription gates were not reused because the catalog and POS surfaces
are not storefront features. Revisit if storage cost needs a tier.

## Out of scope

- Service images (same shape: `services.image_key`, `/app/services/{id}/image/*`).
- A "Download all images for offline" action.
- Images on receipts, cart lines or the customer display.
- Server-side re-encoding or virus scanning (the client output is re-validated
  for size and type only).
