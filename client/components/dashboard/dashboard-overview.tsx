import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Package, ShoppingCart, AlertTriangle, TrendingUp } from "lucide-react";

export function DashboardOverview() {
  const stats = [
    {
      title: "Total Medicines",
      value: "2,847",
      description: "Active inventory items",
      icon: Package,
      trend: "+12% from last month",
    },
    {
      title: "Daily Sales",
      value: "₦847,230",
      description: "Today's revenue",
      icon: ShoppingCart,
      trend: "+8% from yesterday",
    },
    {
      title: "Expiring Soon",
      value: "23",
      description: "Items expiring in 30 days",
      icon: AlertTriangle,
      trend: "Requires attention",
    },
    {
      title: "Monthly Growth",
      value: "18.2%",
      description: "Revenue increase",
      icon: TrendingUp,
      trend: "Above target",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif font-bold text-3xl text-foreground">
          Dashboard Overview
        </h1>
        <p className="text-muted-foreground mt-2">
          Monitor your pharmacy operations and key metrics
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <Card key={stat.title} className="border-border">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {stat.value}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {stat.description}
              </p>
              <p className="text-xs text-accent mt-2">{stat.trend}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="font-serif font-semibold">
              Recent Activity
            </CardTitle>
            <CardDescription>
              Latest pharmacy transactions and updates
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                <div className="w-2 h-2 bg-accent rounded-full"></div>
                <div className="flex-1">
                  <p className="text-sm font-medium">New prescription filled</p>
                  <p className="text-xs text-muted-foreground">
                    Patient: John Doe - ₦15,400
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">2 min ago</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                <div className="w-2 h-2 bg-primary rounded-full"></div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Inventory restocked</p>
                  <p className="text-xs text-muted-foreground">
                    Paracetamol 500mg - 200 units
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  15 min ago
                </span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                <div className="w-2 h-2 bg-destructive rounded-full"></div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Low stock alert</p>
                  <p className="text-xs text-muted-foreground">
                    Amoxicillin 250mg - 5 units left
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  1 hour ago
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="font-serif font-semibold">
              Quick Actions
            </CardTitle>
            <CardDescription>Common pharmacy management tasks</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <Link
                href="/medicines"
                className="p-4 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors flex flex-col items-center justify-center text-center"
              >
                <Package className="h-6 w-6 mb-2" />
                <span className="text-sm font-medium">Add Medicine</span>
              </Link>
              <Link
                href="/pos"
                className="p-4 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex flex-col items-center justify-center text-center"
              >
                <ShoppingCart className="h-6 w-6 mb-2" />
                <span className="text-sm font-medium">New Sale</span>
              </Link>
              <Link
                href="/inventory"
                className="p-4 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/90 transition-colors flex flex-col items-center justify-center text-center"
              >
                <AlertTriangle className="h-6 w-6 mb-2" />
                <span className="text-sm font-medium">Check Expiry</span>
              </Link>
              <Link
                href="/reports"
                className="p-4 bg-muted text-muted-foreground rounded-lg hover:bg-muted/80 transition-colors flex flex-col items-center justify-center text-center"
              >
                <TrendingUp className="h-6 w-6 mb-2" />
                <span className="text-sm font-medium">View Reports</span>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
