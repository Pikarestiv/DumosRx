"use client";

import { Bell, Search, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModeToggle } from "@/components/mode-toggle";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface HeaderProps {
  onSetActiveTab: (tab: string) => void;
}

export function Header({ onSetActiveTab }: HeaderProps) {
  return (
    <header className="h-20 bg-background border-b flex items-center justify-between px-8">
      <div className="flex items-center gap-4 flex-1">
        <div className="relative w-full max-w-md hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search records, stores or medicines..."
            className="pl-10 bg-muted/50 border-none focus-visible:ring-primary"
          />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <ModeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-destructive rounded-full" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel>Notifications</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="max-h-[300px] overflow-y-auto">
              <DropdownMenuItem 
                className="flex flex-col items-start gap-1 p-3 cursor-pointer"
                onClick={() => onSetActiveTab("notifications")}
              >
                <div className="flex items-center gap-2 w-full">
                  <Badge variant="outline" className="bg-orange-100 text-orange-700 border-orange-200">
                    Inventory
                  </Badge>
                  <span className="text-[10px] text-muted-foreground ml-auto">2h ago</span>
                </div>
                <p className="text-sm font-bold">Low Stock Alert: Lagos Branch</p>
                <p className="text-xs text-muted-foreground">Paracetamol 500mg is below threshold (5 units left).</p>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                className="flex flex-col items-start gap-1 p-3 cursor-pointer"
                onClick={() => onSetActiveTab("notifications")}
              >
                <div className="flex items-center gap-2 w-full">
                  <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-200">
                    System
                  </Badge>
                  <span className="text-[10px] text-muted-foreground ml-auto">5h ago</span>
                </div>
                <p className="text-sm font-bold">New Store Connected</p>
                <p className="text-xs text-muted-foreground">"DumosRx Ikeja" has successfully synced its first batch.</p>
              </DropdownMenuItem>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="w-full text-center text-xs text-primary font-bold justify-center py-2 cursor-pointer"
              onClick={() => onSetActiveTab("notifications")}
            >
              View All Notifications
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button className="lg:hidden" variant="ghost" size="icon">
          <Menu className="h-6 w-6" />
        </Button>
      </div>
    </header>
  );
}
