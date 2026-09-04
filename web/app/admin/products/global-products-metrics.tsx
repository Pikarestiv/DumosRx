import { Card, CardContent } from "@/components/ui/card";
import { BarChart3, TrendingUp, AlertTriangle } from "lucide-react";
import type { GlobalProductMetrics } from "@/lib/types/admin";

interface GlobalProductsMetricsProps {
  productMetrics: GlobalProductMetrics | undefined;
}

export function GlobalProductsMetrics({
  productMetrics,
}: GlobalProductsMetricsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Card className="border-none bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 overflow-hidden relative group">
        <div className="absolute top-0 right-0 p-8 opacity-10 rotate-12 group-hover:rotate-0 transition-transform duration-500">
          <BarChart3 className="h-24 w-24" />
        </div>
        <CardContent className="p-6 relative z-10">
          <p className="text-xs font-bold text-indigo-100 uppercase tracking-widest mb-1">
            Most Stocked Category
          </p>
          <h3 className="text-2xl font-black">
            {productMetrics?.mostStockedCategory?.name ?? "N/A"}
          </h3>
          <div className="mt-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-300" />
            <span className="text-xs font-bold">
              {productMetrics?.mostStockedCategory?.growth ?? "0%"} Growth
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="border-none bg-slate-900 text-white shadow-sm overflow-hidden relative group">
        <div className="absolute top-0 right-0 p-8 opacity-10 -rotate-12 group-hover:rotate-0 transition-transform duration-500">
          <AlertTriangle className="h-24 w-24" />
        </div>
        <CardContent className="p-6 relative z-10">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
            Stock Flag Rate
          </p>
          <h3 className="text-2xl font-black">
            {productMetrics?.stockAlerts?.rate ?? "0%"}
          </h3>
          <div className="mt-4 flex items-center gap-2 text-rose-400">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-xs font-bold">
              {productMetrics?.stockAlerts?.count ?? "0"} Critical Alerts
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="border-none bg-white dark:bg-slate-900 shadow-sm border border-slate-100 dark:border-slate-800">
        <CardContent className="p-6">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
            PCN Compliance
          </p>
          <h3 className="text-2xl font-black text-slate-900 dark:text-white">
            {productMetrics?.compliance?.status ?? "Unknown"}{" "}
            {productMetrics?.compliance?.rate ?? "0%"}
          </h3>
          <div className="mt-4 w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500"
              style={{ width: productMetrics?.compliance?.rate ?? "0%" }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
