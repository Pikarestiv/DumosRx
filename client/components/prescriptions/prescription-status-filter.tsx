"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResponsiveTabLabel } from "@/components/ui/responsive-tab-label";

interface StatusFilterOption {
  value: string;
  label: string;
  short: string;
}

interface PrescriptionStatusFilterProps {
  filters: StatusFilterOption[];
  value: string;
  onChange: (value: string) => void;
}

/** Same filter state rendered as chips on mobile and tabs on desktop: no content switch, just narrows the list. */
export function PrescriptionStatusFilter({
  filters,
  value,
  onChange,
}: PrescriptionStatusFilterProps) {
  return (
    <div>
      <div className="lg:hidden">
        <Tabs value={value} onValueChange={onChange} variant="chips">
          <TabsList className="w-full justify-start overflow-x-auto overflow-y-hidden hide-scrollbar">
            {filters.map((f) => (
              <TabsTrigger
                key={f.value}
                value={f.value}
                className="data-[state=inactive]:bg-card data-[state=inactive]:border-border"
              >
                <ResponsiveTabLabel short={f.short} long={f.label} />
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      <div className="hidden lg:block">
        <Tabs value={value} onValueChange={onChange}>
          <TabsList className="w-max justify-start overflow-x-auto overflow-y-hidden hide-scrollbar">
            {filters.map((f) => (
              <TabsTrigger key={f.value} value={f.value}>
                {f.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
    </div>
  );
}
