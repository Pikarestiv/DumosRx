import { LogOut } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface UserProfileButtonProps {
  user: any;
  isLoading: boolean;
  onLogout: () => void;
}

export function UserProfileButton({
  user,
  isLoading,
  onLogout,
}: UserProfileButtonProps) {
  if (isLoading) {
    return (
      <div className="p-4 border-t">
        <div
          id="tour-profile"
          className="bg-muted/50 rounded-2xl p-4 flex items-center gap-3"
        >
          <Skeleton className="h-10 w-10 rounded-full shrink-0" />
          <div className="flex-1 overflow-hidden space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>
          <div className="p-2">
            <Skeleton className="h-4 w-4" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 border-t">
      <div
        id="tour-profile"
        className="bg-muted/50 rounded-2xl p-4 flex items-center gap-3"
      >
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
          {user?.name?.charAt(0) || "U"}
        </div>
        <div className="flex-1 overflow-hidden">
          <p className="text-sm font-bold truncate">{user?.name || "User"}</p>
          <p className="text-xs text-muted-foreground truncate">
            {user?.email}
          </p>
        </div>
        <button
          onClick={onLogout}
          className="p-2 hover:bg-destructive/10 rounded-lg transition-colors group"
        >
          <LogOut className="h-4 w-4 text-muted-foreground group-hover:text-destructive transition-colors" />
        </button>
      </div>
    </div>
  );
}
