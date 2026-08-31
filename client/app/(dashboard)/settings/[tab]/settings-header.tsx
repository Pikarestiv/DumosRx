import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserProfileBadge } from "@/components/dashboard/user-profile-badge";

interface SettingsHeaderProps {
  title: string;
  onBack: () => void;
  showBadge?: boolean;
}

/** Shared by the mobile menu-list route and every inner tab — with the app
 * sidebar/header hidden on all settings routes, this back button is the
 * only way out. */
export function SettingsHeader({ title, onBack, showBadge }: SettingsHeaderProps) {
  return (
    <div className="shrink-0 flex items-center gap-3 px-4 py-4 border-border/50">
      <Button
        variant="outline"
        size="icon"
        className="h-9 w-9 rounded-xl bg-muted/50 border-border/50 text-muted-foreground hover:text-foreground shrink-0"
        onClick={onBack}
      >
        <ChevronLeft className="h-5 w-5" />
      </Button>

      <div className="text-lg font-semibold capitalize">{title}</div>

      {showBadge && (
        <div className="ml-auto hidden sm:block">
          <UserProfileBadge />
        </div>
      )}
    </div>
  );
}
