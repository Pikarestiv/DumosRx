import localFont from "next/font/local";

const archivo = localFont({
  src: "../app/fonts/archivo-latin-wght-normal.woff2",
  variable: "--font-archivo",
  weight: "100 900",
  display: "swap",
  preload: false,
});

const plexSans = localFont({
  src: "../app/fonts/ibm-plex-sans-latin-wght-normal.woff2",
  variable: "--font-plex-sans",
  weight: "100 700",
  display: "swap",
  preload: false,
});

const plexMono = localFont({
  src: "../app/fonts/ibm-plex-mono-latin-600-normal.woff2",
  variable: "--font-plex-mono",
  weight: "600",
  display: "swap",
  preload: false,
});

const figtree = localFont({
  src: "../app/fonts/figtree-latin-wght-normal.woff2",
  variable: "--font-figtree",
  weight: "300 900",
  display: "swap",
  preload: false,
});

const fraunces = localFont({
  src: "../app/fonts/fraunces-latin-wght-normal.woff2",
  variable: "--font-fraunces",
  weight: "100 900",
  display: "swap",
  preload: false,
});

const dmSans = localFont({
  src: "../app/fonts/dm-sans-latin-wght-normal.woff2",
  variable: "--font-dm-sans",
  weight: "100 1000",
  display: "swap",
  preload: false,
});

export const STOREFRONT_FONT_CLASSES = [archivo, plexSans, plexMono, figtree, fraunces, dmSans]
  .map((loaded) => loaded.variable)
  .join(" ");
