/**
 * Sentinel — self-healing scrape pipeline for Bright Data Scraper Studio.
 *
 * Winning angle for Scrape-Verse:
 * 1. Scraper Studio is the core (c_* Collector ID)
 * 2. Heal keeps the same Collector ID when the page moves
 * 3. Downstream product: snapshots, diffs, heal timeline, cron
 */

export type CollectorStatus =
  | "healthy"
  | "degraded"
  | "healing"
  | "broken"
  | "pending"
  | "unknown";

export interface CollectorDef {
  id: string;
  name: string;
  url: string;
  description: string;
  fields: string[];
  /**
   * Some pages come back as one row wrapping a list. Naming that property here
   * expands it into a row each, because heal repairs extraction but will not
   * reshape a payload.
   */
  rowsFrom?: string;
  collectorId?: string;
  createdAt?: string;
  lastRunAt?: string;
  lastHealAt?: string;
  status: CollectorStatus;
  notes?: string;
}

export interface Snapshot {
  id: string;
  collectorKey: string;
  collectorId: string;
  url: string;
  fetchedAt: string;
  rowCount: number;
  rows: Record<string, unknown>[];
  ok: boolean;
  issues: string[];
}

export interface HealEvent {
  id: string;
  collectorKey: string;
  collectorId: string;
  promptedAt: string;
  prompt: string;
  /** "detected" means the prompt was generated from the failing fields, not typed. */
  trigger?: "detected" | "manual";
  status: "started" | "awaiting_approval" | "done" | "failed";
  previewRows?: Record<string, unknown>[];
  note?: string;
}

export interface DiffEntry {
  field: string;
  before: unknown;
  after: unknown;
}

export interface RunResult {
  snapshot: Snapshot;
  healed: boolean;
  healEvent?: HealEvent;
  diff?: DiffEntry[];
}
