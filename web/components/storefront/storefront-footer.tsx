import { APP_NAME, WEB_APP_URL } from "@/lib/constants";
import type { StorefrontStore } from "@/lib/api/storefront-data";

export function StorefrontFooter({ store }: { store?: StorefrontStore | null }) {
  return (
    <footer className="border-t border-border bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-muted-foreground">
        <p>
          © {new Date().getFullYear()} {store?.name ?? "This store"}
        </p>
        <a
          href={WEB_APP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs hover:text-foreground transition-colors"
        >
          Powered by {APP_NAME}
        </a>
      </div>
    </footer>
  );
}
