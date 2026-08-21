import { createCollector } from "../pipeline/sentinel";
import { getCollector, loadCollectors, saveCollectors, upsertCollector } from "../lib/store";
import type { CollectorDef } from "../lib/types";
import { readFileSync } from "node:fs";
import { join } from "node:path";

async function main() {
  const key = process.argv[2] ?? "shopalto-pdp";
  let def = getCollector(key);

  if (!def) {
    const seed = JSON.parse(
      readFileSync(join(process.cwd(), "data/collectors.json"), "utf8"),
    ) as CollectorDef[];
    saveCollectors(seed);
    def = getCollector(key);
  }

  if (!def) {
    console.error(`Unknown collector: ${key}`);
    console.error("Available:", loadCollectors().map((c) => c.id).join(", "));
    process.exit(1);
  }

  if (def.collectorId) {
    console.log(`Already has Collector ID: ${def.collectorId}`);
    console.log("Re-create skipped. Delete collectorId from data/collectors.json to force.");
    process.exit(0);
  }

  console.log(`Creating Scraper Studio scraper for ${def.name}…`);
  console.log(`URL: ${def.url}`);
  console.log(`This usually takes 5–15 minutes. Leave it running.\n`);

  const created = await createCollector(def);
  upsertCollector(created);
  console.log(`\n✅ Collector ID: ${created.collectorId}`);
  console.log("Pin this ID — heal keeps the SAME ID when the page changes.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
