import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { cn, EmptyState } from "@/components/ui";
import { useLocale } from "@/lib/i18n";

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
  emptyTitle,
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
  const { tr } = useLocale();
  if (!rows.length) return <EmptyState title={emptyTitle ?? tr("لا توجد بيانات", "No data")} />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            {columns.map((c) => {
              const sorted = sortBy === c.key;
              return (
                <th
                  key={c.key}
                  aria-sort={sorted ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
                  className={cn(
                    "sticky top-0 z-10 whitespace-nowrap border-b border-border bg-surface-2 px-5 py-3 text-2xs font-bold uppercase tracking-wide text-muted-foreground",
                    c.align === "end" ? "text-end" : c.align === "center" ? "text-center" : "text-start",
                    c.sortable && onSort && "cursor-pointer select-none transition-colors hover:text-primary",
                  )}
                  onClick={c.sortable && onSort ? () => onSort(c.key) : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {c.header}
                    {c.sortable &&
                      onSort &&
                      (sorted ? (
                        sortDir === "asc" ? (
                          <ChevronUp className="h-3 w-3 text-primary" />
                        ) : (
                          <ChevronDown className="h-3 w-3 text-primary" />
                        )
                      ) : (
                        <ChevronsUpDown className="h-3 w-3 opacity-40" />
                      ))}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {rows.map((row, i) => (
            <tr
              key={getKey(row, i)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn("group transition-colors hover:bg-primary/[0.035]", onRowClick && "cursor-pointer")}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    "whitespace-nowrap border-b border-border/70 px-5 py-3.5",
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
