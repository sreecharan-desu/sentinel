/**
 * End-to-end Scrape-Verse demo path (Bright Data official heal pattern):
 * create (name+price) → run → heal (+description/image/rating) → run again
 * Same Collector ID the whole way.
 */
import { getCollector, loadCollectors, saveCollectors } from "../lib/store";
import { createCollector, healCollector, runCollector } from "../pipeline/sentinel";
import type { CollectorDef } from "../lib/types";
import { readFileSync } from "node:fs";
import { join } from "node:path";

async function main() {
  const seed = JSON.parse(
    readFileSync(join(process.cwd(), "data/collectors.json"), "utf8"),
  ) as CollectorDef[];
  if (!loadCollectors().length) saveCollectors(seed);

  let def = getCollector("shopalto-pdp");
  if (!def) throw new Error("shopalto-pdp missing from registry");

  if (!def.collectorId) {
    console.log("Step 1/4 — create minimal scraper (name, price)");
    def = await createCollector(def);
  } else {
    console.log(`Step 1/4 — reuse Collector ID ${def.collectorId}`);
  }

  console.log("\nStep 2/4 — run");
  const first = await runCollector(def);
  console.log(first.rows[0] ?? first);

  console.log("\nStep 3/4 — heal in place (extend schema, SAME c_*)");
  const heal = await healCollector(
    getCollector("shopalto-pdp") ?? def,
    "Also capture description, image url and rating alongside the existing name and price.",
    { autoApprove: true },
  );
  console.log({ status: heal.status, collectorId: heal.collectorId });

  console.log("\nStep 4/4 — run again and prove fields expanded");
  const second = await runCollector(getCollector("shopalto-pdp")!);
  console.log(second.rows[0] ?? second);

  console.log("\n✅ Demo complete. Collector ID never changed:", second.collectorId);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
