import { CustomerManagement } from "@/components/customers/customer-management"

export default function CustomersPage() {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Customer & Loyalty Management</h1>
        <p className="text-gray-600 mt-2">Manage customer relationships and loyalty programs</p>
      </div>
      <CustomerManagement />
    </div>
  )
}
