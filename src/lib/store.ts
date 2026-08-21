import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { CollectorDef, HealEvent, Snapshot } from "./types";

const ROOT = process.cwd();
const DATA = join(ROOT, "data");
const REGISTRY = join(DATA, "collectors.json");
const SNAPSHOTS = join(DATA, "snapshots");
const RUNS = join(DATA, "runs");
const HEALS = join(DATA, "heals.json");

function ensureDirs() {
  for (const dir of [DATA, SNAPSHOTS, RUNS]) {
    mkdirSync(dir, { recursive: true });
  }
  if (!existsSync(join(SNAPSHOTS, ".gitkeep"))) {
    writeFileSync(join(SNAPSHOTS, ".gitkeep"), "");
  }
  if (!existsSync(join(RUNS, ".gitkeep"))) {
    writeFileSync(join(RUNS, ".gitkeep"), "");
  }
}

export function loadCollectors(): CollectorDef[] {
  ensureDirs();
  if (!existsSync(REGISTRY)) {
    return [];
  }
  const raw = readFileSync(REGISTRY, "utf8");
  try {
    return JSON.parse(raw) as CollectorDef[];
  } catch (err) {
    throw new Error(
      `data/collectors.json is invalid JSON. Fix trailing commas or restore from git. ${err instanceof Error ? err.message : err}`,
    );
  }
}

export function saveCollectors(collectors: CollectorDef[]) {
  ensureDirs();
  writeFileSync(REGISTRY, JSON.stringify(collectors, null, 2) + "\n");
}

export function upsertCollector(next: CollectorDef) {
  const all = loadCollectors();
  const idx = all.findIndex((c) => c.id === next.id);
  if (idx >= 0) all[idx] = next;
  else all.push(next);
  saveCollectors(all);
  return next;
}

export function getCollector(id: string) {
  return loadCollectors().find((c) => c.id === id);
}

export function saveSnapshot(snapshot: Snapshot) {
  ensureDirs();
  const path = join(SNAPSHOTS, `${snapshot.id}.json`);
  writeFileSync(path, JSON.stringify(snapshot, null, 2) + "\n");
  return path;
}

export function listSnapshots(collectorKey?: string): Snapshot[] {
  ensureDirs();
  const files = readdirSync(SNAPSHOTS).filter((f) => f.endsWith(".json"));
  const snaps = files
    .map((f) => JSON.parse(readFileSync(join(SNAPSHOTS, f), "utf8")) as Snapshot)
    .sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt));
  return collectorKey ? snaps.filter((s) => s.collectorKey === collectorKey) : snaps;
}

export function loadHeals(): HealEvent[] {
  ensureDirs();
  if (!existsSync(HEALS)) return [];
  return JSON.parse(readFileSync(HEALS, "utf8")) as HealEvent[];
}

export function appendHeal(event: HealEvent) {
  const all = loadHeals();
  all.unshift(event);
  writeFileSync(HEALS, JSON.stringify(all, null, 2) + "\n");
  return event;
}

export function saveRunLog(name: string, payload: unknown) {
  ensureDirs();
  const path = join(RUNS, `${name}.json`);
  writeFileSync(path, JSON.stringify(payload, null, 2) + "\n");
  return path;
}
