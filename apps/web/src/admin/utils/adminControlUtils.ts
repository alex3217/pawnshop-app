export type SortDirection = "asc" | "desc";

export function asText(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

export function normalizeSearch(value: unknown) {
  return asText(value).trim().toLowerCase();
}

export function includesSearch(row: Record<string, unknown>, query: string, keys: string[]) {
  const q = normalizeSearch(query);
  if (!q) return true;

  return keys.some((key) => normalizeSearch(row[key]).includes(q));
}

export function compareValues(a: unknown, b: unknown, direction: SortDirection = "asc") {
  const left = asText(a).toLowerCase();
  const right = asText(b).toLowerCase();

  const result = left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: "base",
  });

  return direction === "asc" ? result : -result;
}

export function downloadCsv(filename: string, rows: Array<Record<string, unknown>>) {
  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set<string>()),
  );

  const escapeCell = (value: unknown) => {
    const text = value === null || value === undefined ? "" : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };

  const csv = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCell(row[header])).join(",")),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);
}

export function formatDate(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

export function formatMoney(value: unknown, currency = "USD") {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";

  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(number);
}
