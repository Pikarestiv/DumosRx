import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useSidebarPeekPreference } from "@/lib/hooks/use-sidebar-peek-preference";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function SidebarPreferencesCard() {
  const { peekEnabled, setPeekEnabled } = useSidebarPeekPreference();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sidebar</CardTitle>
        <CardDescription>
          Controls how the collapsed sidebar behaves on this device.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="sidebar-peek">Expand on hover when collapsed</Label>
            <p className="text-sm text-muted-foreground">
              When off, the collapsed sidebar stays icon-only and won't expand
              when your cursor passes over it. Only applies with a mouse or
              trackpad. Touch devices (eg tablets) never peek on hover.
            </p>
          </div>
          <Switch
            id="sidebar-peek"
            checked={peekEnabled}
            onCheckedChange={setPeekEnabled}
          />
        </div>
      </CardContent>
    </Card>
  );
}
