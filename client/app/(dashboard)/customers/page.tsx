import { CustomerManagement } from "@/components/customers";

export default function CustomersPage() {
  return (
    <>
      {/* The page design has no title slot; a top-level heading is still
          required for screen-reader/landmark navigation (WCAG 1.3.1/2.4.6). */}
      <h1 className="sr-only">Customers</h1>

      <CustomerManagement />
    </>
  );
}
