export const LEGACY_STORE_PAGES: readonly (readonly string[])[] = [
  [],
  ["catalog"],
  ["checkout"],
  ["order"],
  ["about"],
  ["faq"],
  ["locations"],
  ["track"],
  ["prescription"],
];

export const legacyStoreTarget = (pathname: string): string => pathname.replace(/^\/store(?=\/|$)/, "/s");
