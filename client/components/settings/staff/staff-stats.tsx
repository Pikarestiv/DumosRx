import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { StaffListItem } from "@/lib/types/user";

interface StaffStatsProps {
  users: StaffListItem[];
  maxStaffAccounts: number;
}

export function StaffStats({ users, maxStaffAccounts }: StaffStatsProps) {
  const activeCount = users.filter((u) => u.is_active !== 0).length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card>
        <CardContent className="p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Total Staff
          </p>
          <h3 className="text-2xl font-bold mt-1">
            {users.length}
            <span className="text-sm text-muted-foreground font-medium ml-2">
              / {maxStaffAccounts === -1 ? "∞" : `${maxStaffAccounts} max`}
            </span>
          </h3>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Active Now
          </p>
          <h3 className="text-2xl font-bold mt-1 text-green-600">{activeCount}</h3>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            System Roles
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 font-medium">Admin</Badge>
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-medium">Manager</Badge>
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 font-medium">Specialist</Badge>
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 font-medium">Sales</Badge>
            <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 font-medium">Auditor</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
