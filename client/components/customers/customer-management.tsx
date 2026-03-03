"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  Plus,
  Star,
  Gift,
  Phone,
  Mail,
  MapPin,
  Calendar,
  TrendingUp,
  Users,
  Award,
  Heart,
} from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { AddCustomerDialog } from "@/components/customers/add-customer-dialog";
import { toast } from "sonner";
import { useStore } from "@/lib/context/store-context";
import { useCustomerData, Customer } from "@/lib/hooks/use-customer-data";
import { LoyaltyTiersView } from "./loyalty-tiers-view";


const recentTransactions = [
  {
    id: "TXN001",
    customerId: "CUST001",
    customerName: "Adebayo Johnson",
    amount: 25400,
    pointsEarned: 254,
    date: "2024-01-10",
    items: ["Paracetamol 500mg", "Vitamin C 1000mg"],
  },
  {
    id: "TXN002",
    customerId: "CUST002",
    customerName: "Fatima Abdullahi",
    amount: 45600,
    pointsEarned: 456,
    date: "2024-01-12",
    items: ["Insulin Glargine", "Blood glucose strips"],
  },
];


export function CustomerManagement() {
  const { storeType } = useStore();
  const isPharmacy = storeType === "pharmacy";

  const { customers, loading, addCustomer } = useCustomerData();

  const loyaltyTiers = [
    {
      name: "Bronze",
      minSpent: 0,
      pointsMultiplier: 1,
      benefits: ["Basic rewards", "Birthday discount 5%"],
      color: "bg-amber-600",
    },
    {
      name: "Silver",
      minSpent: 100000,
      pointsMultiplier: 1.5,
      benefits: ["Enhanced rewards", "Birthday discount 10%", "Priority support"],
      color: "bg-gray-400",
    },
    {
      name: "Gold",
      minSpent: 300000,
      pointsMultiplier: 2,
      benefits: [
        "Premium rewards",
        "Birthday discount 15%",
        "Free delivery",
        "Exclusive offers",
      ],
      color: "bg-yellow-500",
    },
    {
      name: "Platinum",
      minSpent: 500000,
      pointsMultiplier: 3,
      benefits: [
        "VIP rewards",
        "Birthday discount 20%",
        "Free delivery",
        isPharmacy ? "Personal pharmacist" : "Shopping assistant",
        "Early access",
      ],
      color: "bg-purple-600",
    },
  ];

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);

  const handleAddCustomer = async (payload: any) => {
    await addCustomer(payload);
    setIsAddCustomerOpen(false);
  };

  const filteredCustomers = customers.filter(
    (customer) =>
      customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.phone.includes(searchTerm),
  );

  const getTierColor = (tier: string) => {
    const tierInfo = loyaltyTiers.find((t) => t.name === tier);
    return tierInfo?.color || "bg-gray-400";
  };

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Customers
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {customers.length.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">In database</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Loyalty Members
            </CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {customers.filter((c) => c.points > 0).length.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">
              With loyalty points
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Points</CardTitle>
            <Gift className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {customers.reduce((sum, c) => sum + c.points, 0).toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground">Accumulated</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg. Points</CardTitle>
            <Heart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {customers.length > 0
                ? Math.round(
                    customers.reduce((sum, c) => sum + c.points, 0) /
                      customers.length,
                  ).toLocaleString()
                : 0}
            </div>
            <div className="text-xs text-muted-foreground">Per customer</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="customers" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="customers">Customer Directory</TabsTrigger>
          <TabsTrigger value="loyalty">Loyalty Program</TabsTrigger>
          <TabsTrigger value="transactions">Recent Activity</TabsTrigger>
          <TabsTrigger value="analytics">Customer Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="customers" className="space-y-6">
          {/* Search and Add Customer */}
          <div className="flex justify-between items-center">
            <div className="relative w-96">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search customers by name, email, or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button
              onClick={() => setIsAddCustomerOpen(true)}
              className="cursor-pointer"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Customer
            </Button>
            <AddCustomerDialog
              open={isAddCustomerOpen}
              onOpenChange={setIsAddCustomerOpen}
              onAddCustomer={handleAddCustomer}
            />
          </div>

          {/* Customer List */}
          <Card>
            <CardHeader>
              <CardTitle>Customer Directory</CardTitle>
              <CardDescription>
                Manage customer profiles and loyalty accounts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead>Points</TableHead>
                    <TableHead>Total Spent</TableHead>
                    <TableHead>Last Visit</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center">
                        No customers found. Click "Add Customer" to create one.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredCustomers.map((customer) => (
                      <TableRow key={customer.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{customer.name}</p>
                            <p className="text-sm text-gray-500">
                              {customer.id}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {customer.email && (
                              <div className="flex items-center gap-1 text-sm">
                                <Mail className="h-3 w-3" />
                                {customer.email}
                              </div>
                            )}
                            {customer.phone && (
                              <div className="flex items-center gap-1 text-sm">
                                <Phone className="h-3 w-3" />
                                {customer.phone}
                              </div>
                            )}
                            {!customer.email && !customer.phone && (
                              <span className="text-sm text-gray-400">-</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={`${getTierColor(customer.tier)} text-white`}
                          >
                            {customer.tier}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Star className="h-4 w-4 text-yellow-500" />
                            {customer.points.toLocaleString()}
                          </div>
                        </TableCell>
                        <TableCell>
                          ₦{customer.totalSpent.toLocaleString()}
                        </TableCell>
                        <TableCell>{customer.lastVisit}</TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedCustomer(customer)}
                          >
                            View Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="loyalty" className="space-y-6">
          <LoyaltyTiersView tiers={loyaltyTiers} />

          {/* Points Redemption */}
          <Card>
            <CardHeader>
              <CardTitle>Points Redemption Options</CardTitle>
              <CardDescription>
                Available rewards and redemption rates
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center gap-3 mb-3">
                    <Gift className="h-8 w-8 text-blue-500" />
                    <div>
                      <h4 className="font-medium">₦500 Discount</h4>
                      <p className="text-sm text-gray-500">500 points</p>
                    </div>
                  </div>
                  <p className="text-sm">Get ₦500 off your next purchase</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center gap-3 mb-3">
                    <Gift className="h-8 w-8 text-green-500" />
                    <div>
                      <h4 className="font-medium">₦1,000 Discount</h4>
                      <p className="text-sm text-gray-500">900 points</p>
                    </div>
                  </div>
                  <p className="text-sm">Get ₦1,000 off your next purchase</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center gap-3 mb-3">
                    <Gift className="h-8 w-8 text-purple-500" />
                    <div>
                      <h4 className="font-medium">Free Delivery</h4>
                      <p className="text-sm text-gray-500">200 points</p>
                    </div>
                  </div>
                  <p className="text-sm">Free delivery on your next order</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Customer Transactions</CardTitle>
              <CardDescription>
                Latest purchases and points activity
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Transaction ID</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Points Earned</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Items</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentTransactions.map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell className="font-medium">
                        {transaction.id}
                      </TableCell>
                      <TableCell>{transaction.customerName}</TableCell>
                      <TableCell>
                        ₦{transaction.amount.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Star className="h-4 w-4 text-yellow-500" />
                          {transaction.pointsEarned}
                        </div>
                      </TableCell>
                      <TableCell>{transaction.date}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {transaction.items.join(", ")}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Customer Segmentation</CardTitle>
                <CardDescription>
                  Customer distribution by tier and activity
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span>Platinum Members</span>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-2 bg-gray-200 rounded-full">
                        <div className="w-3/12 h-2 bg-purple-600 rounded-full" />
                      </div>
                      <span className="text-sm">25%</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Gold Members</span>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-2 bg-gray-200 rounded-full">
                        <div className="w-8/12 h-2 bg-yellow-500 rounded-full" />
                      </div>
                      <span className="text-sm">35%</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Silver Members</span>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-2 bg-gray-200 rounded-full">
                        <div className="w-6/12 h-2 bg-gray-400 rounded-full" />
                      </div>
                      <span className="text-sm">25%</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Bronze Members</span>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-2 bg-gray-200 rounded-full">
                        <div className="w-3/12 h-2 bg-amber-600 rounded-full" />
                      </div>
                      <span className="text-sm">15%</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Customer Retention</CardTitle>
                <CardDescription>
                  Monthly retention and churn analysis
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-600">
                      78.5%
                    </div>
                    <p className="text-sm text-gray-500">
                      Overall Retention Rate
                    </p>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-blue-600">2.3x</div>
                    <p className="text-sm text-gray-500">Avg. Monthly Visits</p>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-purple-600">
                      ₦15,420
                    </div>
                    <p className="text-sm text-gray-500">
                      Avg. Transaction Value
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Customer Details Modal */}
      {selectedCustomer && (
        <Dialog
          open={!!selectedCustomer}
          onOpenChange={() => setSelectedCustomer(null)}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{selectedCustomer.name}</DialogTitle>
              <DialogDescription>
                Customer ID: {selectedCustomer.id}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium mb-3">Contact Information</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      {selectedCustomer.email}
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      {selectedCustomer.phone}
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      {selectedCustomer.address}
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Birthday: {selectedCustomer.birthday}
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="font-medium mb-3">Loyalty Information</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Tier:</span>
                      <Badge
                        className={`${getTierColor(selectedCustomer.tier)} text-white`}
                      >
                        {selectedCustomer.tier}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Points:</span>
                      <span className="font-medium">
                        {selectedCustomer.points.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Spent:</span>
                      <span className="font-medium">
                        ₦{selectedCustomer.totalSpent.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Member Since:</span>
                      <span>{selectedCustomer.joinDate}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Last Visit:</span>
                      <span>{selectedCustomer.lastVisit}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline">Edit Customer</Button>
                <Button>Send Message</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
