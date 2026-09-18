import { useState, useMemo } from "react";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Undo2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { genericFuzzySearch } from "@/lib/utils/search";
import { getSaleById } from "@/lib/db/queries/sales";
import type { ReturnRecord, Sale } from "@/lib/types/sale";

interface RefundsListModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  reportDate: string;
  returnsToday: ReturnRecord[];
  setSelectedSale: (sale: Sale) => void;
  currencyCode?: string;
}

export function RefundsListModal({
  isOpen,
  onOpenChange,
  reportDate,
  returnsToday,
  setSelectedSale,
  currencyCode,
}: RefundsListModalProps) {
  const [search, setSearch] = useState("");

  const filteredReturns = useMemo(() => {
    if (!search.trim()) return returnsToday;
    const searchable = returnsToday.map((r, i) => ({
      idx: i,
      transaction_number: r.transaction_number || "",
      reason: r.reason || "",
    }));
    const { results } = genericFuzzySearch(search, searchable, [
      "transaction_number",
      "reason",
    ]);
    const matchedIdx = new Set(results.map((r) => r.idx));
    return returnsToday.filter((_, i) => matchedIdx.has(i));
  }, [returnsToday, search]);

  const handleRowClick = async (ret: ReturnRecord) => {
    const sale = await getSaleById(ret.sale_id);
    if (sale) setSelectedSale(sale);
  };

  return (
    <ResponsiveModal
      open={isOpen}
      onOpenChange={onOpenChange}
      title={<>Refunds on {reportDate}</>}
      className="sm:max-w-4xl max-h-[80vh] flex flex-col pt-6"
    >
      <div className="flex items-center gap-2 mb-4 px-1">
        <Input
          placeholder="Search receipt or reason..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-full sm:w-[240px]"
        />
      </div>
      <div className="flex-1 overflow-y-auto px-1">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Receipt No</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="text-right">Amount Refunded</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredReturns.length === 0 && <EmptyRefundsRow />}
            {filteredReturns.map((ret) => (
              <TableRow
                key={ret.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => handleRowClick(ret)}
              >
                <TableCell>
                  {ret.created_at
                    ? new Date(ret.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : ""}
                </TableCell>
                <TableCell className="font-medium">
                  {ret.transaction_number}
                </TableCell>
                <TableCell>{ret.reason || "—"}</TableCell>
                <TableCell className="text-right font-bold text-destructive">
                  {formatCurrency(ret.total_refunded, currencyCode)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </ResponsiveModal>
  );
}

function EmptyRefundsRow() {
  return (
    <TableRow>
      <TableCell colSpan={4}>
        <EmptyState icon={Undo2} title="No refunds found" className="py-8" />
      </TableCell>
    </TableRow>
  );
}
