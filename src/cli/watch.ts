import { loadCollectors } from "../lib/store";
import { watchOnce } from "../pipeline/sentinel";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const key = process.argv[2]?.startsWith("--") ? undefined : process.argv[2];
  const autoHeal = !process.argv.includes("--no-heal");
  const url = flag("--url");
  const targets = key ? [key] : loadCollectors().filter((c) => c.collectorId).map((c) => c.id);

  if (!targets.length) {
    console.error("No collectors with a Scraper Studio ID. Run sentinel:create first.");
    process.exit(1);
  }

  for (const id of targets) {
    console.log(`\n══ Watching ${id} ══`);
    if (url) console.log(`Target override: ${url}`);
    const result = await watchOnce(id, autoHeal, url);
    console.log({
      ok: result.snapshot.ok,
      rows: result.snapshot.rowCount,
      issues: result.snapshot.issues,
      healed: result.healed,
      collectorId: result.snapshot.collectorId,
      diffFields: result.diff?.map((d) => d.field) ?? [],
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
