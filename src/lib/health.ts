import type { CollectorDef, DiffEntry, Snapshot } from "./types";

function fieldValue(row: Record<string, unknown>, field: string): unknown {
  if (row[field] != null && row[field] !== "") return row[field];
  if (field === "name" && row.product_name != null) return row.product_name;
  if (field === "title" && row.section_title != null) return row.section_title;
  if (field === "description" && row.section_description != null) return row.section_description;
  if (field === "url") {
    if (row.product_page_url != null) return row.product_page_url;
    const links = row.section_links;
    if (Array.isArray(links) && links[0] && typeof links[0] === "object") {
      return (links[0] as Record<string, unknown>).link_url;
    }
  }
  if (field === "image_url" && row.image != null) return row.image;
  return row[field];
}

export function detectIssues(rows: Record<string, unknown>[], expectedFields: string[]): string[] {
  const issues: string[] = [];
  if (rows.length === 0) {
    issues.push("empty_result");
    return issues;
  }

  for (const field of expectedFields) {
    const missing = rows.every((row) => {
      const value = fieldValue(row, field);
      return value === null || value === undefined || value === "" || value === "undefined";
    });
    if (missing) issues.push(`field_null:${field}`);
  }

  return issues;
}

export function healthFromIssues(issues: string[]): CollectorDef["status"] {
  if (issues.includes("empty_result")) return "broken";
  if (issues.some((i) => i.startsWith("field_"))) return "degraded";
  return "healthy";
}

export function diffSnapshots(before?: Snapshot, after?: Snapshot): DiffEntry[] {
  if (!before || !after) return [];
  const a = before.rows[0] ?? {};
  const b = after.rows[0] ?? {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const diffs: DiffEntry[] = [];
  for (const key of keys) {
    const left = a[key];
    const right = b[key];
    if (JSON.stringify(left) !== JSON.stringify(right)) {
      diffs.push({ field: key, before: left ?? null, after: right ?? null });
    }
  }
  return diffs;
}

export function healPromptFor(collector: CollectorDef, issues: string[]): string {
  const nullFields = issues
    .filter((i) => i.startsWith("field_null:") || i.startsWith("field_missing:"))
    .map((i) => i.split(":")[1])
    .filter(Boolean);

  if (issues.includes("empty_result")) {
    return `The scraper returned no rows for ${collector.url}. Re-establish navigation and extraction for: ${collector.fields.join(", ")}. Keep the same output field names.`;
  }

  if (nullFields.length) {
    return `These fields return null/empty after a page change: ${nullFields.join(", ")}. Re-capture them from the current markup while keeping existing fields (${collector.fields.join(", ")}) and the same Collector ID.`;
  }

  return `Extraction quality degraded on ${collector.url}. Restore reliable values for: ${collector.fields.join(", ")}.`;
}
