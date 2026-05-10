import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { SortDir } from "@/hooks/use-table-sort-filter";

export function SortableTh<K extends string>({
  sortKey,
  currentKey,
  currentDir,
  onSort,
  className,
  children,
}: {
  sortKey: K;
  currentKey: K;
  currentDir: SortDir;
  onSort: (key: K) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const active = sortKey === currentKey;
  const Icon = !active ? ArrowUpDown : currentDir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 text-left font-medium hover:text-foreground transition-colors",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {children}
        <Icon className="h-3 w-3 opacity-70" />
      </button>
    </TableHead>
  );
}
