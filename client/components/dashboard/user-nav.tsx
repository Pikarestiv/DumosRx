"use client";

import { useAuth } from "@/lib/context/auth-context";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, Repeat, User } from "lucide-react";

export function UserNav() {
  const { user, logout } = useAuth();
  const router = useRouter();

  if (!user) return null;

  const initials = `${user.first_name?.[0] || ""}${user.last_name?.[0] || ""}`.toUpperCase() || "U";

  const handleSwitchAccount = () => {
    logout();
    router.push("/login");
  };

  const handleFullLogout = () => {
    localStorage.removeItem("dumos_recent_users"); // Clear lock screen history
    logout();
    router.push("/login");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
          <Avatar className="h-8 w-8 border border-border">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">
              {user.first_name} {user.last_name}
            </p>
            <p className="text-xs leading-none text-muted-foreground capitalize">
              {user.role.replace(/_/g, " ")}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSwitchAccount} className="cursor-pointer">
          <Repeat className="mr-2 h-4 w-4" />
          <span>Switch Account</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleFullLogout} className="cursor-pointer text-destructive focus:text-destructive">
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out completely</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
