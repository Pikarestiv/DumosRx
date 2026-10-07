import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bug, ExternalLink } from "lucide-react";
import { SENTRY_ISSUES_URL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { SentryIssue } from "@/lib/types/admin";

/** A Map, not an object: `issue.level` comes from Sentry (§8). */
const LEVEL_STYLES = new Map<string, string>([
  ["fatal", "bg-rose-500/10 text-rose-500"],
  ["error", "bg-rose-500/10 text-rose-500"],
  ["warning", "bg-amber-500/10 text-amber-500"],
  ["info", "bg-blue-500/10 text-blue-500"],
]);

const levelStyle = (level: string): string =>
  LEVEL_STYLES.get(level) ?? "bg-rose-500/10 text-rose-500";

interface SentryIssuesCardProps {
  data?: { configured: boolean; issues: SentryIssue[] };
  isLoading: boolean;
}

export function SentryIssuesCard({ data, isLoading }: SentryIssuesCardProps) {
  return (
    <Card className="bg-card border-border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-xl font-black flex items-center gap-2">
          <Bug className="h-5 w-5 text-indigo-500" />
          Recent Errors (Sentry, last 14 days)
        </CardTitle>
        <a
          href={SENTRY_ISSUES_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-bold text-indigo-500 hover:underline flex items-center gap-1 shrink-0"
        >
          Open in Sentry
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </CardHeader>
      <CardContent>
        {isLoading && !data ? (
          <p className="text-sm text-muted-foreground font-medium">Loading…</p>
        ) : data && !data.configured ? (
          <p className="text-sm text-muted-foreground font-medium">
            Sentry API token not configured. Set{" "}
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">SENTRY_API_TOKEN</code> on
            the server to enable this.
          </p>
        ) : data && data.issues.length === 0 ? (
          <p className="text-sm text-emerald-500 font-bold">No unresolved issues. Clean slate.</p>
        ) : (
          <div className="space-y-3">
            {data?.issues.map((issue, i) => (
              <a
                key={issue.id || i}
                href={issue.permalink || undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-4 bg-muted/50 rounded-2xl hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={cn(
                      "text-xs font-bold px-2 py-1 rounded-lg shrink-0",
                      levelStyle(issue.level),
                    )}
                  >
                    {issue.level}
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold truncate text-foreground">{issue.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {issue.project}
                      {issue.culprit ? ` (${issue.culprit})` : ""}
                    </p>
                  </div>
                </div>
                <span className="text-sm font-medium text-muted-foreground shrink-0 ml-4">
                  {issue.count} event{issue.count === 1 ? "" : "s"}
                </span>
              </a>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
