import { readFileSync, existsSync } from "node:fs";
import { asRows, extractCollectorId, extractJsonPayload, runBdata } from "../lib/bdata";
import { detectIssues, diffSnapshots, healPromptFor, healthFromIssues } from "../lib/health";
import {
  appendHeal,
  getCollector,
  listSnapshots,
  saveRunLog,
  saveSnapshot,
  upsertCollector,
} from "../lib/store";
import type { CollectorDef, HealEvent, RunResult, Snapshot } from "../lib/types";

function stamp(prefix: string) {
  return `${prefix}_${new Date().toISOString().replace(/[:.]/g, "-")}`;
}

/** Map Bright Data schema quirks onto our expected field names. */
function normalizeRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) => {
    const next: Record<string, unknown> = { ...row };
    if (next.name == null && next.product_name != null) next.name = next.product_name;
    if (next.title == null && next.section_title != null) next.title = next.section_title;
    if (next.description == null && next.section_description != null) {
      next.description = next.section_description;
    }
    if (next.url == null) {
      const links = next.section_links;
      if (Array.isArray(links) && links[0] && typeof links[0] === "object") {
        const first = links[0] as Record<string, unknown>;
        if (first.link_url != null) next.url = first.link_url;
      } else if (next.product_page_url != null) {
        next.url = next.product_page_url;
      }
    }
    if (next.image_url == null && next.image != null) next.image_url = next.image;
    if (next.price != null && typeof next.price === "object") {
      const p = next.price as Record<string, unknown>;
      if (p.value != null) {
        next.price_display = `${p.symbol ?? ""}${p.value} ${p.currency ?? ""}`.trim();
      }
    }
    return next;
  });
}

/**
 * Lift a nested list into top-level rows, carrying the wrapper's scalar fields
 * down so context like the source URL is not lost.
 */
export function expandRows(
  rows: Record<string, unknown>[],
  key: string,
): Record<string, unknown>[] {
  const expanded: Record<string, unknown>[] = [];
  for (const row of rows) {
    const nested = row[key];
    if (!Array.isArray(nested) || nested.length === 0) {
      expanded.push(row);
      continue;
    }
    const carried = Object.fromEntries(
      Object.entries(row).filter(([k, v]) => k !== key && (v == null || typeof v !== "object")),
    );
    for (const item of nested) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        expanded.push({ ...carried, ...(item as Record<string, unknown>) });
      }
    }
  }
  return expanded;
}

function loadRowsFromRun(stdout: string, outputPath: string): Record<string, unknown>[] {
  if (existsSync(outputPath)) {
    try {
      const raw = JSON.parse(readFileSync(outputPath, "utf8"));
      return normalizeRows(asRows(raw));
    } catch {
      // fall through to stdout
    }
  }
  try {
    return normalizeRows(asRows(extractJsonPayload(stdout)));
  } catch {
    return [];
  }
}

export async function createCollector(def: CollectorDef): Promise<CollectorDef> {
  const result = await runBdata([
    "scraper",
    "create",
    def.url,
    def.description,
    "--name",
    `sentinel-${def.id}`,
    "--pretty",
  ]);

  if (result.code !== 0) {
    throw new Error(`scraper create failed (${result.code}): ${result.stderr || result.stdout}`);
  }

  const collectorId = extractCollectorId(result.stdout + result.stderr);
  if (!collectorId) {
    throw new Error("Create succeeded but no Collector ID (c_*) was found in CLI output");
  }

  const updated: CollectorDef = {
    ...def,
    collectorId,
    createdAt: new Date().toISOString(),
    status: "unknown",
  };
  upsertCollector(updated);
  saveRunLog(stamp(`create_${def.id}`), { collectorId, stdout: result.stdout });
  return updated;
}

export async function runCollector(def: CollectorDef, url = def.url): Promise<Snapshot> {
  if (!def.collectorId) {
    throw new Error(`Collector ${def.id} has no collectorId yet — run create first`);
  }

  const outputPath = `data/runs/${stamp(`raw_${def.id}`)}.json`;
  const result = await runBdata([
    "scraper",
    "run",
    def.collectorId,
    url,
    "--pretty",
    "-o",
    outputPath,
  ]);

  if (result.code !== 0) {
    throw new Error(`scraper run failed (${result.code}): ${result.stderr || result.stdout}`);
  }

  const raw = loadRowsFromRun(result.stdout, outputPath);
  const rows = (def.rowsFrom ? expandRows(raw, def.rowsFrom) : raw).slice(0, 50);
  const issues = detectIssues(rows, def.fields);
  const snapshot: Snapshot = {
    id: stamp(`snap_${def.id}`),
    collectorKey: def.id,
    collectorId: def.collectorId,
    url,
    fetchedAt: new Date().toISOString(),
    rowCount: rows.length,
    rows,
    ok: issues.length === 0,
    issues,
  };

  saveSnapshot(snapshot);
  upsertCollector({
    ...def,
    lastRunAt: snapshot.fetchedAt,
    status: healthFromIssues(issues),
  });

  return snapshot;
}

export async function healCollector(
  def: CollectorDef,
  prompt?: string,
  opts: { autoApprove?: boolean } = {},
  url = def.url,
): Promise<HealEvent> {
  if (!def.collectorId) {
    throw new Error(`Collector ${def.id} has no collectorId`);
  }

  const issues = listSnapshots(def.id)[0]?.issues ?? ["manual_heal"];
  const healPrompt = prompt ?? healPromptFor(def, issues);
  const args = [
    "scraper",
    "heal",
    def.collectorId,
    healPrompt,
    "--url",
    url,
    "--pretty",
  ];
  if (opts.autoApprove) {
    args.push("--auto-approve", "--auto-save");
  }

  upsertCollector({ ...def, status: "healing" });
  const result = await runBdata(args);

  let status: HealEvent["status"] = result.code === 0 ? "done" : "failed";
  let previewRows: Record<string, unknown>[] | undefined;
  const combined = result.stdout + result.stderr;
  if (/awaiting_approval/i.test(combined)) status = "awaiting_approval";
  try {
    const payload = extractJsonPayload(combined);
    previewRows = asRows(payload);
  } catch {
    // ignore parse errors on heal stream
  }

  if (status === "awaiting_approval" && opts.autoApprove) {
    await runBdata(["scraper", "approve", def.collectorId, "--url", url]);
    status = "done";
  }

  const event: HealEvent = {
    id: stamp(`heal_${def.id}`),
    collectorKey: def.id,
    collectorId: def.collectorId,
    promptedAt: new Date().toISOString(),
    prompt: healPrompt,
    trigger: prompt ? "manual" : "detected",
    status,
    previewRows,
    note: result.code === 0 ? "heal command finished" : result.stderr.slice(0, 500),
  };

  appendHeal(event);
  upsertCollector({
    ...def,
    lastHealAt: event.promptedAt,
    status: status === "done" ? "healthy" : status === "awaiting_approval" ? "healing" : "broken",
  });

  return event;
}

/**
 * Run → detect issues → heal (same c_*) → re-run.
 *
 * Pass `url` to point the collector at a page it was not built against. Extraction
 * returns nulls, which is the same failure signature as a site redesign, so this is
 * how the loop gets exercised without waiting for a real page to change.
 */
export async function watchOnce(
  collectorId: string,
  autoHeal = true,
  url?: string,
): Promise<RunResult> {
  const def = getCollector(collectorId);
  if (!def) throw new Error(`Unknown collector key: ${collectorId}`);
  if (!def.collectorId) throw new Error(`No Scraper Studio ID for ${collectorId}`);

  const target = url ?? def.url;
  const before = listSnapshots(def.id)[0];
  const snapshot = await runCollector(def, target);

  if (snapshot.ok || !autoHeal) {
    return {
      snapshot,
      healed: false,
      diff: diffSnapshots(before, snapshot),
    };
  }

  const healEvent = await healCollector(def, undefined, { autoApprove: true }, target);
  const afterHeal = await runCollector(getCollector(def.id) ?? def, target);

  return {
    snapshot: afterHeal,
    healed: true,
    healEvent,
    diff: diffSnapshots(snapshot, afterHeal),
  };
}
