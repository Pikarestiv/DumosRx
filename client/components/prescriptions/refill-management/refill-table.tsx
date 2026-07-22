import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Clock, AlertTriangle, Calendar, CheckCircle, RefreshCw } from "lucide-react";
import type { RefillRequest } from "./use-refill-management";

interface RefillTableProps {
  filteredRefills: RefillRequest[];
  totalCount: number;
  isFuzzyFallback: boolean;
  formatCurrency: (amount: number) => string;
  formatDate: (dateString: string) => string;
  processRefill: (id: string) => void;
}

export function RefillTable({
  filteredRefills,
  totalCount,
  isFuzzyFallback,
  formatCurrency,
  formatDate,
  processRefill,
}: RefillTableProps) {
  const getStatusBadge = (status: RefillRequest["status"]) => {
    const variants = {
      due: "default",
      early: "secondary",
      overdue: "destructive",
      completed: "outline",
      expired: "destructive",
    } as const;

    const labels = {
      due: "Due",
      early: "Early",
      overdue: "Overdue",
      completed: "Completed",
      expired: "Expired",
    };

    return (
      <Badge variant={variants[status]} className="text-xs">
        {labels[status]}
      </Badge>
    );
  };

  const getStatusIcon = (status: RefillRequest["status"]) => {
    switch (status) {
      case "due":
        return <Clock className="h-4 w-4 text-blue-600" />;
      case "early":
        return <Calendar className="h-4 w-4 text-gray-600" />;
      case "overdue":
        return <AlertTriangle className="h-4 w-4 text-red-600" />;
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "expired":
        return <AlertTriangle className="h-4 w-4 text-red-600" />;
      default:
        return null;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif font-semibold">
          Refill Requests
        </CardTitle>
        <CardDescription>
          Showing {filteredRefills.length} of {totalCount} refill requests
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isFuzzyFallback && filteredRefills.length > 0 && (
          <div className="bg-amber-500/10 text-amber-600 px-4 py-2 text-sm border border-amber-500/20 text-center font-medium rounded-md mb-4">
            Did you mean? (No exact matches found. Showing closest names.)
          </div>
        )}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patient</TableHead>
                <TableHead>Medication</TableHead>
                <TableHead>Original Rx</TableHead>
                <TableHead>Last Filled</TableHead>
                <TableHead>Next Refill</TableHead>
                <TableHead>Refills</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRefills.length === 0 && (
                                          <TableRow>
                                            <TableCell colSpan={9} className="h-48 text-center bg-muted/20">
                                              <div className="flex flex-col items-center justify-center space-y-3 py-6">
                                                <div className="bg-muted p-3 rounded-full">
                                                  <RefreshCw className="h-8 w-8 text-muted-foreground opacity-50" />
                                                </div>
                                                <h3 className="font-semibold text-lg text-foreground">No Refill Requests Found</h3>
                                                <p className="text-muted-foreground text-sm max-w-sm">
                                                  There are no refill requests matching your current filters. 
                                                  Adjust your search or check back later for new requests.
                                                </p>
                                              </div>
                                            </TableCell>
                                          </TableRow>
                                        )}
                          {!(filteredRefills.length === 0) && (
                                          filteredRefills.map((refill) => (
                                            <TableRow key={refill.id}>
                                            <TableCell>
                                              <div>
                                                <div className="font-medium">{refill.patientName}</div>
                                                <div className="text-sm text-muted-foreground">
                                                  {refill.patientPhone}
                                                </div>
                                              </div>
                                            </TableCell>
                                            <TableCell>
                                              <div>
                                                <div className="font-medium">{refill.productName}</div>
                                                <div className="text-sm text-muted-foreground">
                                                  {refill.strength}
                                                </div>
                                              </div>
                                            </TableCell>
                                            <TableCell>
                                              <code className="text-sm bg-muted px-2 py-1 rounded">
                                                {refill.originalPrescription}
                                              </code>
                                            </TableCell>
                                            <TableCell>{formatDate(refill.lastFilled)}</TableCell>
                                            <TableCell>{formatDate(refill.nextRefillDate)}</TableCell>
                                            <TableCell>
                                              <div className="text-center">
                                                <span className="font-medium">
                                                  {refill.refillsRemaining}/{refill.totalRefills}
                                                </span>
                                                <div className="text-xs text-muted-foreground">
                                                  remaining
                                                </div>
                                              </div>
                                            </TableCell>
                                            <TableCell>
                                              <div className="flex items-center gap-2">
                                                {getStatusIcon(refill.status)}
                                                {getStatusBadge(refill.status)}
                                              </div>
                                            </TableCell>
                                            <TableCell>
                                              <div className="font-medium">
                                                {formatCurrency(refill.cost)}
                                              </div>
                                            </TableCell>
                                            <TableCell>
                                              <div className="flex items-center gap-2">
                                                {(refill.status === "due" ||
                                                  refill.status === "overdue") &&
                                                  refill.refillsRemaining > 0 && (
                                                    <Button
                                                      variant="ghost"
                                                      size="sm"
                                                      onClick={() => processRefill(refill.id)}
                                                      className="flex items-center gap-1"
                                                    >
                                                      <RefreshCw className="h-4 w-4" />
                                                      Fill
                                                    </Button>
                                                  )}
                                                {refill.status === "early" && (
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    disabled
                                                    className="text-muted-foreground"
                                                  >
                                                    Too Early
                                                  </Button>
                                                )}
                                                {refill.status === "completed" && (
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    disabled
                                                    className="text-muted-foreground"
                                                  >
                                                    Complete
                                                  </Button>
                                                )}
                                              </div>
                                            </TableCell>
                                          </TableRow>
                                        )))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
