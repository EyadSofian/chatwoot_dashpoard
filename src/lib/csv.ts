export interface CsvColumn<T> {
  key: keyof T | string;
  label: string;
  /** Optional value formatter. */
  format?: (row: T) => string | number | null | undefined;
}

export function escapeCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvLine<T>(row: T, columns: CsvColumn<T>[]): string {
  return columns
    .map((column) => {
      const raw = column.format
        ? column.format(row)
        : (row as Record<string, unknown>)[column.key as string];
      return escapeCell(raw);
    })
    .join(",");
}

/**
 * Build a CSV string with a UTF-8 BOM so Excel renders Arabic correctly.
 */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCell(c.label)).join(",");
  const body = rows.map((row) =>
    columns
      .map((c) => {
        const raw = c.format ? c.format(row) : (row as Record<string, unknown>)[c.key as string];
        return escapeCell(raw);
      })
      .join(","),
  );
  return `﻿${[header, ...body].join("\r\n")}`;
}

export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

/** Stream large exports in bounded batches instead of materializing one giant string. */
export function streamCsvResponse<T>(rows: AsyncIterable<T>, columns: CsvColumn<T>[], filename: string): Response {
  const encoder = new TextEncoder();
  const iterator = rows[Symbol.asyncIterator]();
  let started = false;

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!started) {
        started = true;
        controller.enqueue(encoder.encode(`﻿${columns.map((column) => escapeCell(column.label)).join(",")}\r\n`));
      }
      const next = await iterator.next();
      if (next.done) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(`${csvLine(next.value, columns)}\r\n`));
    },
    async cancel() {
      await iterator.return?.();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
