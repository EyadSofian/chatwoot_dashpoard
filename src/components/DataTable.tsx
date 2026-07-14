import { ChevronDown, ChevronUp } from "lucide-react";
import { cn, EmptyState } from "@/components/ui";

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  align?: "start" | "end" | "center";
  sortable?: boolean;
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  getKey,
  onRowClick,
  sortBy,
  sortDir,
  onSort,
  emptyTitle = "لا توجد بيانات",
}: {
  columns: Column<T>[];
  rows: T[];
  getKey: (row: T, index: number) => string | number;
  onRowClick?: (row: T) => void;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  onSort?: (key: string) => void;
  emptyTitle?: string;
}) {
  if (!rows.length) return <EmptyState title={emptyTitle} />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-2/50 text-2xs uppercase tracking-wide text-muted-foreground">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "whitespace-nowrap px-3 py-2 font-medium",
                  c.align === "end" ? "text-end" : c.align === "center" ? "text-center" : "text-start",
                  c.sortable && onSort && "cursor-pointer select-none hover:text-foreground",
                )}
                onClick={c.sortable && onSort ? () => onSort(c.key) : undefined}
              >
                <span className="inline-flex items-center gap-1">
                  {c.header}
                  {c.sortable && sortBy === c.key && (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={getKey(row, i)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                "border-b border-border/60 last:border-0 hover:bg-surface-2",
                onRowClick && "cursor-pointer",
              )}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    "whitespace-nowrap px-3 py-2",
                    c.align === "end" ? "text-end" : c.align === "center" ? "text-center" : "text-start",
                    c.className,
                  )}
                >
                  {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
