import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SearchableInput } from "@/components/ui/searchable-input";
import { useStore } from "@/lib/context/store-context";

interface ProductDatabaseFiltersProps {
  searchTerm: string;
  setSearchTerm: (val: string) => void;
  categoryFilter: string;
  setCategoryFilter: (val: string) => void;
  statusFilter: string;
  setStatusFilter: (val: string) => void;
  categories: string[];
  statuses: string[];
}

export function ProductDatabaseFilters({
  searchTerm,
  setSearchTerm,
  categoryFilter,
  setCategoryFilter,
  statusFilter,
  setStatusFilter,
  categories,
  statuses,
}: ProductDatabaseFiltersProps) {
  const { t } = useStore();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif font-semibold">
          Search & Filter
        </CardTitle>
        <CardDescription>
          Find {t("products").toLowerCase()} by name, brand,{" "}
          {t("registration_number").toLowerCase()}, or other criteria
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder={`Search ${t("products").toLowerCase()}, brands, ${t("registration_number").toLowerCase()}...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <div className="w-full md:w-56">
            <SearchableInput
              options={categories.map((c) => ({
                label: c === "all" ? `All ${t("category")}s` : c,
                value: c,
              }))}
              value={categoryFilter}
              onValueChange={setCategoryFilter}
              placeholder={`All ${t("category")}s`}
            />
          </div>
          <div className="w-full md:w-56">
            <SearchableInput
              options={statuses.map((s) => ({
                label:
                  s === "all"
                    ? "All Status"
                    : s
                        .replace("_", " ")
                        .split(" ")
                        .map(
                          (word) =>
                            word.charAt(0).toUpperCase() + word.slice(1)
                        )
                        .join(" "),
                value: s,
              }))}
              value={statusFilter}
              onValueChange={setStatusFilter}
              placeholder="All Status"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
