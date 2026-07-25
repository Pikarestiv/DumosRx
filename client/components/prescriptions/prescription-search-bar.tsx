import { Search } from "lucide-react";

interface PrescriptionSearchBarProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  className?: string;
}

/** Shared between the desktop in-card search row and the standalone mobile search bar. */
export function PrescriptionSearchBar({ searchTerm, setSearchTerm, className = "bg-muted border-border" }: PrescriptionSearchBarProps) {
  return (
    <div className={`flex items-center gap-2 border rounded-[10px] px-3.5 py-2.5 ${className}`}>
      <Search className="w-4 h-4 text-muted-foreground shrink-0" />
      <input
        type="text"
        placeholder="Search by patient or medication"
        className="border-0 outline-none text-[13px] w-full bg-transparent text-foreground placeholder:text-muted-foreground"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />
    </div>
  );
}
