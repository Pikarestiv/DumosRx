import { KeyRound } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function RolesPermissionsPlaceholder() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center text-center gap-3 py-16">
        <div className="p-3 rounded-full bg-primary/10">
          <KeyRound className="h-6 w-6 text-primary" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Roles & Permissions</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            Custom staff roles with fine-grained permissions are coming soon.
            For now, manage staff access from the Staff page.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
