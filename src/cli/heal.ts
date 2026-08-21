import { getCollector } from "../lib/store";
import { healCollector } from "../pipeline/sentinel";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const key = process.argv[2]?.startsWith("--") ? "shopalto-pdp" : (process.argv[2] ?? "shopalto-pdp");
  const auto = process.argv.includes("--auto");
  const def = getCollector(key);
  if (!def?.collectorId) {
    console.error(`No collectorId for ${key}. Create first.`);
    process.exit(1);
  }

  const url = flag("--url") ?? def.url;
  const prompt =
    process.argv.find((a) => a.startsWith("--prompt="))?.slice(9) ??
    "Also capture description, image url and rating alongside the existing name and price. Keep the same Collector ID.";

  console.log(`Healing ${def.collectorId} against ${url}`);
  console.log(`Prompt: ${prompt}\n`);

  const event = await healCollector(def, prompt, { autoApprove: auto }, url);
  console.log(JSON.stringify(event, null, 2));
  console.log("\nCollector ID unchanged — that is the Scrape-Verse point.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
