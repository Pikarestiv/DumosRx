/** Filesystem-safe fragment of a store name: a filename is also how the
 * owner tells two stores' exports apart in a Downloads folder. */
function slugifyStoreName(name: string | undefined | null): string {
  const slug = (name ?? "")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 40)
    .replace(/^-+|-+$/g, "");

  return slug || "Store";
}

/** Local date and time, not UTC: the stamp has to match the clock the person
 * reading the filename is looking at. */
function localStamp(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}` +
    `_${pad(at.getHours())}${pad(at.getMinutes())}`
  );
}

/**
 * `DumosRx_<Store>_<Kind>_<YYYY-MM-DD_HHmm>.<ext>`. Two exports on the same
 * day, or from two stores, must not collide — a date-only name silently
 * overwrote the earlier file. See docs/KNOWN_BUGS.md.
 */
export function buildExportFilename(options: {
  kind: string;
  extension: string;
  storeName?: string | null;
  at?: Date;
}): string {
  const { kind, extension, storeName, at = new Date() } = options;

  return `DumosRx_${slugifyStoreName(storeName)}_${kind}_${localStamp(at)}.${extension}`;
}
