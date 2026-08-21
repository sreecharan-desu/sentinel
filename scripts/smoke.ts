/**
 * Smoke check for the dashboard. Loads a target URL, walks every source and
 * every timeline step, and fails on any console error, page error, or failed
 * request. Run against localhost before shipping, or against production after.
 *
 *   npm run smoke                      # http://localhost:3000
 *   npm run smoke -- <url> --shots     # any deployment, saving screenshots
 */
import { chromium, type ConsoleMessage } from "playwright";
import { mkdirSync } from "node:fs";

const target = process.argv[2]?.startsWith("http")
  ? process.argv[2]
  : "http://localhost:3000";
const shots = process.argv.includes("--shots");
const problems: string[] = [];

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: new URL(target).origin,
  });
  const page = await context.newPage();

  page.on("console", (m: ConsoleMessage) => {
    if (m.type() === "error") problems.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) =>
    problems.push(`request failed: ${r.url()} ${r.failure()?.errorText ?? ""}`),
  );

  console.log(`→ ${target}`);
  await page.goto(target, { waitUntil: "networkidle" });
  await page.waitForSelector("aside button", { timeout: 15000 });

  if (shots) mkdirSync("tmp/shots", { recursive: true });

  const sources = await page.locator("aside").first().locator("button").all();
  console.log(`  ${sources.length} sources`);

  for (let i = 0; i < sources.length; i += 1) {
    const rail = page.locator("aside").first().locator("button");
    const name = (await rail.nth(i).innerText()).split("\n")[0];
    await rail.nth(i).click();
    await page.waitForTimeout(500);

    const steps = page.locator("section .overflow-x-auto button");
    const count = await steps.count();
    console.log(`  ${name}: ${count} step(s)`);

    for (let s = 0; s < count; s += 1) {
      await steps.nth(s).click();
      await page.waitForTimeout(250);
      if (shots) {
        await page.screenshot({ path: `tmp/shots/${i}-${name.slice(0, 12)}-${s}.png` });
      }
    }

    // Going back to a longer timeline and forward again is what broke before.
    await rail.nth(0).click();
    await page.waitForTimeout(300);
    await rail.nth(i).click();
    await page.waitForTimeout(300);
  }

  // Copy buttons are easy to ship broken, so read the clipboard back.
  await page.locator("section").getByRole("button", { name: "Json" }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /^Copy all \d+ rows$/ }).click();
  // The label swaps to "Copied", so the original locator stops matching.
  const confirmed = await page
    .getByRole("button", { name: "Copied" })
    .waitFor({ state: "visible", timeout: 1200 })
    .then(() => true)
    .catch(() => false);
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  let rows = 0;
  try {
    const parsed = JSON.parse(clipboard);
    rows = Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    /* handled below */
  }
  if (shots) await page.screenshot({ path: "tmp/shots/json-copy.png" });
  console.log(`  clipboard ${clipboard.length} chars, ${rows} rows, confirmed=${confirmed}`);
  if (rows === 0) problems.push("copy button produced no usable JSON");
  if (!confirmed) problems.push("copy button did not confirm");

  // The theme toggle can flip the class and still change nothing if the CSS
  // loses a specificity tie, so assert the painted colour actually moves.
  const themes: { mode: string; bg: string }[] = [];
  for (let i = 0; i < 2; i += 1) {
    themes.push(
      await page.evaluate(() => ({
        mode: document.documentElement.className.includes("dark") ? "dark" : "light",
        bg: getComputedStyle(document.body).backgroundColor,
      })),
    );
    await page.locator('button[aria-label="Toggle theme"]').click();
    await page.waitForTimeout(350);
  }
  console.log(`  themes ${themes.map((t) => `${t.mode}=${t.bg}`).join("  ")}`);
  if (themes[0].bg === themes[1].bg) {
    problems.push(
      `theme toggle does not repaint: ${themes[0].mode} and ${themes[1].mode} are both ${themes[0].bg}`,
    );
  }
  if (shots) {
    await page.screenshot({ path: "tmp/shots/theme-toggled.png" });
  }

  const fits = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  console.log(`  viewport ${fits.innerWidth}x${fits.innerHeight}, document ${fits.scrollWidth}x${fits.scrollHeight}`);
  if (fits.scrollHeight > fits.innerHeight + 1) problems.push("page scrolls vertically");
  if (fits.scrollWidth > fits.innerWidth + 1) problems.push("page scrolls horizontally");

  await browser.close();

  if (problems.length) {
    console.error(`\n✗ ${problems.length} problem(s):`);
    for (const p of [...new Set(problems)]) console.error(`   ${p}`);
    process.exit(1);
  }
  console.log("\n✓ no console errors, no page errors, fits the viewport");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
