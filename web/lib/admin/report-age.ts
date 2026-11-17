export const OLD_REPORT_AFTER_HOURS = 6;

export interface ReportAge {
  label: string;
  old: boolean;
}

export function reportAge(reportedAt: string, now: Date = new Date()): ReportAge | null {
  const reported = new Date(reportedAt).getTime();
  if (Number.isNaN(reported)) return null;

  const minutes = Math.max(0, Math.floor((now.getTime() - reported) / 60_000));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const label =
    minutes < 1
      ? "just now"
      : minutes < 60
        ? `${minutes} min ago`
        : hours < 24
          ? `${hours} h ago`
          : `${days} day${days === 1 ? "" : "s"} ago`;

  return { label, old: hours >= OLD_REPORT_AFTER_HOURS };
}
