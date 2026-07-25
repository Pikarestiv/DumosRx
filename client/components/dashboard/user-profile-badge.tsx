"use client";

import { useAuth } from "@/lib/context/auth-context";
import { useStore } from "@/lib/context/store-context";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function UserProfileBadge() {
  const { user } = useAuth();
  const { storeProfile } = useStore();

  if (!user) return null;

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-sm">
      <Avatar className="w-5 h-5">
        <AvatarFallback className="text-[10px] bg-primary text-primary-foreground">
          {(user.first_name?.[0] || user.username?.[0] || "U").toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="font-medium text-foreground">
        {user.first_name || user.username}
      </span>
      <span className="text-muted-foreground bg-background/50 px-2 py-0.5 rounded-md text-[10px] border">
        {user.role.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
      </span>
      {storeProfile?.subscription_tier && (
        <span className="text-muted-foreground bg-primary/10 px-2 py-0.5 rounded-md text-[10px] border border-primary/20 capitalize font-medium">
          {storeProfile.subscription_tier}
        </span>
      )}
    </div>
  );
}
