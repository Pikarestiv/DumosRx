"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  FileText, 
  Download, 
  Printer, 
  Calendar as CalendarIcon,
  Filter,
  BarChart,
  ClipboardList,
  Wallet,
  Users
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function ReportCenter() {
  const [dateRange, _setDateRange] = useState("Last 30 Days");

  const reports = [
    {
      id: "sales",
      title: "Detailed Sales Report",
      description: "Itemized list of all transactions with tax and discount breakdown.",
      icon: FileText,
      category: "Financial"
    },
    {
      id: "inventory",
      title: "Inventory Valuation",
      description: "Current stock levels, cost value, and potential selling value.",
      icon: ClipboardList,
      category: "Operations"
    },
    {
      id: "profit-loss",
      title: "Profit & Loss Summary",
      description: "Comparative view of revenue vs expenses for the selected period.",
      icon: BarChart,
      category: "Financial"
    },
    {
      id: "customers",
      title: "Customer Loyalty Report",
      description: "Analysis of top customers and points redemption history.",
      icon: Users,
      category: "CRM"
    },
    {
      id: "expenses",
      title: "Expense Categories",
      description: "Breakdown of operating costs by category.",
      icon: Wallet,
      category: "Financial"
    }
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="hover-scale">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ready to Export</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">12 Reports</div>
            <p className="text-xs text-muted-foreground mt-1">Generated this month</p>
          </CardContent>
        </Card>
        <Card className="hover-scale">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Last Generated</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">Inventory Value</div>
            <p className="text-xs text-muted-foreground mt-1">2 hours ago</p>
          </CardContent>
        </Card>
        <Card className="hover-scale border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-primary">Scheduled Backups</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold text-primary flex items-center gap-2">
              <Badge variant="default">Active</Badge>
              Daily at 11:59 PM
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="font-serif font-bold">Standard Reports</CardTitle>
            <CardDescription>Select a report to generate or export</CardDescription>
          </div>
          <div className="flex items-center gap-2">
             <Button variant="outline" size="sm" className="gap-2">
               <CalendarIcon className="h-4 w-4" />
               {dateRange}
             </Button>
             <Button variant="outline" size="sm">
               <Filter className="h-4 w-4" />
             </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {reports.map((report) => (
              <div 
                key={report.id}
                className="flex items-start gap-4 p-4 rounded-xl border border-border hover:bg-muted/50 transition-all group cursor-pointer"
              >
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                  <report.icon className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold">{report.title}</h3>
                    <Badge variant="secondary" className="text-[10px]">{report.category}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {report.description}
                  </p>
                  <div className="flex items-center gap-3 mt-4">
                    <Button size="sm" variant="outline" className="h-8 gap-2 hover-rotate-icon">
                      <Printer className="h-3.5 w-3.5" />
                      Print
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 gap-2 hover-rotate-icon">
                      <Download className="h-3.5 w-3.5" />
                      Export CSV
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif font-bold">Recent Downloads</CardTitle>
          <CardDescription>Recently generated reports for your records</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Sales_Report_May_2026.pdf</p>
                    <p className="text-xs text-muted-foreground">Generated by Admin • 2.4 MB</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm">
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
