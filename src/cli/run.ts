import { getCollector } from "../lib/store";
import { runCollector } from "../pipeline/sentinel";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const key = process.argv[2]?.startsWith("--") ? "shopalto-pdp" : (process.argv[2] ?? "shopalto-pdp");
  const def = getCollector(key);
  if (!def?.collectorId) {
    console.error(`No collectorId for ${key}. Run: npm run sentinel:create -- ${key}`);
    process.exit(1);
  }

  const url = flag("--url") ?? def.url;
  console.log(`Running ${def.collectorId} on ${url}`);
  const snap = await runCollector(def, url);
  console.log(`\nRows: ${snap.rowCount}`);
  console.log(`OK: ${snap.ok}`);
  console.log(`Issues: ${snap.issues.join(", ") || "none"}`);
  console.log(JSON.stringify(snap.rows.slice(0, 3), null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
