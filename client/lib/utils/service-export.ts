import type { Service } from "@/lib/types/service";

export const SERVICE_EXPORT_HEADERS = ["Service Name", "Code", "Category", "Description", "Price", "Status"];

export function buildServiceExportRows(services: readonly Service[]): { headers: string[]; rows: Record<string, unknown>[] } {
  const rows = services.map((service) => ({
    "Service Name": service.name,
    Code: service.code ?? "",
    Category: service.category ?? "",
    Description: service.description ?? "",
    Price: service.price,
    Status: service.is_active ? "Active" : "Inactive",
  }));
  return { headers: SERVICE_EXPORT_HEADERS, rows };
}
