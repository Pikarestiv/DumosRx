import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { StaffMember } from "@/lib/types/dashboard";

interface StaffStatsProps {
  filteredStaff: StaffMember[];
  subStatus: { limits?: { staff?: string | number } } | undefined;
}

export function StaffStats({ filteredStaff, subStatus }: StaffStatsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Card className="border-none shadow-sm">
        <CardContent className="p-6">
          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Total Staff
          </p>
          <h3 className="text-3xl font-black mt-2">
            {filteredStaff?.length || 0}
            {(() => {
              const maxStaff: string | number = subStatus?.limits?.staff ?? 1;

              return maxStaff === -1 || maxStaff === "Unlimited" ? (
                <span className="text-lg text-muted-foreground font-medium ml-2">
                  / ∞
                </span>
              ) : (
                <span className="text-lg text-muted-foreground font-medium ml-2">
                  / {maxStaff} max
                </span>
              );
            })()}
          </h3>
        </CardContent>
      </Card>
      <Card className="border-none shadow-sm">
        <CardContent className="p-6">
          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Active Now
          </p>
          <h3 className="text-3xl font-black mt-2 text-green-600">
            {filteredStaff?.filter(
              (s) => s.is_active || s.status === "online",
            ).length || 0}
          </h3>
        </CardContent>
      </Card>
      <Card className="border-none shadow-sm">
        <CardContent className="p-6">
          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            System Roles
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            <Badge
              variant="outline"
              className="bg-indigo-50 text-indigo-700 border-indigo-200 font-bold"
            >
              Admin
            </Badge>
            <Badge
              variant="outline"
              className="bg-blue-50 text-blue-700 border-blue-200 font-bold"
            >
              Manager
            </Badge>
            <Badge
              variant="outline"
              className="bg-emerald-50 text-emerald-700 border-emerald-200 font-bold"
            >
              Specialist
            </Badge>
            <Badge
              variant="outline"
              className="bg-amber-50 text-amber-700 border-amber-200 font-bold"
            >
              Sales
            </Badge>
            <Badge
              variant="outline"
              className="bg-slate-50 text-slate-700 border-slate-200 font-bold"
            >
              Auditor
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
