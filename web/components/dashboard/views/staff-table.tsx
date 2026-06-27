import {
  Circle,
  MoreVertical,
  Users,
  Shield,
  Key,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface StaffTableProps {
  filteredStaff: any[];
  hasStaff: boolean;
  selectedStore: string;
  stores: any[];
  handleCreate: () => void;
  handleEdit: (s: any) => void;
  handleDelete: (id: string) => void;
  handleReactivate: (id: string) => void;
}

export function StaffTable({
  filteredStaff,
  hasStaff,
  selectedStore,
  stores,
  handleCreate,
  handleEdit,
  handleDelete,
  handleReactivate,
}: StaffTableProps) {
  return (
    <Card className="border-none shadow-sm overflow-hidden">
      <CardHeader className="bg-white/50 dark:bg-slate-900/50 border-b border-muted/50">
        <CardTitle className="text-xl font-black">Staff Records</CardTitle>
        <CardDescription>
          {hasStaff
            ? `Real-time records for ${selectedStore === "all" ? "all stores" : stores.find((st) => st.id === selectedStore)?.name}.`
            : "No staff records found for this selection."}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        {!hasStaff ? (
          <div className="py-20 text-center flex flex-col items-center justify-center">
            <Users className="h-12 w-12 text-muted-foreground mb-4 opacity-20" />
            <p className="text-muted-foreground font-medium">
              No results found...
            </p>
            <Button
              variant="link"
              onClick={handleCreate}
              className="mt-2 font-bold text-primary"
            >
              Create your first staff account
            </Button>
          </div>
        ) : (
          <div className="min-w-[800px] w-full">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-muted text-xs font-bold uppercase">
                  <TableHead className="pl-6">Staff Member</TableHead>
                  <TableHead className="text-center">Role</TableHead>
                  <TableHead className="text-center">Store / Shop</TableHead>
                  <TableHead className="text-center">Credentials</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right pr-6">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...filteredStaff].sort((a, b) => {
                  const isAOwner = !a.store_id || a.role === 'store_owner';
                  const isBOwner = !b.store_id || b.role === 'store_owner';
                  if (isAOwner && !isBOwner) return -1;
                  if (!isAOwner && isBOwner) return 1;
                  return 0;
                }).map((s: any) => {
                  const isMainAccount = !s.store_id || s.role === 'store_owner';
                  return (
                  <TableRow
                    key={s.id}
                    className={`border-muted group ${isMainAccount ? "bg-indigo-50/50 dark:bg-indigo-900/10 hover:bg-indigo-50 dark:hover:bg-indigo-900/20" : "hover:bg-muted/30"}`}
                  >
                    <TableCell className="font-bold py-4 pl-6">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-black shadow-sm">
                          {s.first_name?.charAt(0) || "U"}
                        </div>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-900 dark:text-white">
                              {(s.first_name || "") + " " + (s.last_name || "")}
                            </span>
                            {isMainAccount && (
                              <Badge variant="default" className="h-5 px-1.5 text-[9px] bg-indigo-500 hover:bg-indigo-600">
                                Main Account
                              </Badge>
                            )}
                          </div>
                          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter mt-0.5">
                            {s.email}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant="secondary"
                        className="font-bold capitalize px-3"
                      >
                        {s.role?.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center text-sm font-bold text-slate-500">
                      {s.store?.name ||
                        stores.find((st) => st.id === s.store_id)?.name ||
                        "Main Branch"}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center gap-1 text-[10px] font-black text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full">
                          <Shield className="h-3 w-3" />
                          {s.username || "N/A"}
                        </div>
                        <div className="flex items-center gap-1 text-[10px] font-black text-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">
                          <Key className="h-3 w-3" />
                          {s.pin || "****"}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant="outline"
                        className={`${s.is_active ? "bg-green-50 text-green-700 border-green-200" : "bg-slate-50 text-slate-500 border-slate-200"} font-bold`}
                      >
                        <Circle
                          className={`h-2 w-2 mr-2 fill-current ${s.is_active ? "text-green-500" : "text-slate-300"}`}
                        />
                        {s.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="w-[160px] font-bold"
                        >
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleEdit(s)}>
                            Edit Details
                          </DropdownMenuItem>
                          {s.is_active ? (
                            <DropdownMenuItem
                              className="text-rose-600 focus:text-rose-600"
                              onClick={() => handleDelete(s.id)}
                            >
                              Deactivate
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              className="text-emerald-600 focus:text-emerald-600"
                              onClick={() => handleReactivate(s.id)}
                            >
                              Reactivate
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
