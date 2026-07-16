import { CustomerManagement } from "@/components/customers/customer-management";

export default function CustomersPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="font-serif font-bold text-3xl text-foreground">
          Customer & Loyalty Management
        </h1>
        <p className="text-muted-foreground mt-2">
          Manage customer relationships and loyalty programs
        </p>
      </div>
      <CustomerManagement />
    </>
  );
}
