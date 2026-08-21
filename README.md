# Sentinel

Scrapers rarely fail loudly. The run succeeds, the exit code is `0`, and the fields come back empty — so the breakage reaches your database before it reaches you.

Sentinel watches collectors built with [Bright Data Scraper Studio](https://brightdata.com/products/scraper-studio). When a run comes back thin, it writes a heal prompt from the specific fields that failed, heals the collector **in place**, and re-runs to confirm. The Collector ID never changes, so schedules, jobs, and apps keep calling the same `c_*`.

Live dashboard: [sentinel-five-eosin.vercel.app](https://sentinel-five-eosin.vercel.app)

Built for [Scrape-Verse](https://www.wemakedevs.org/hackathons/scrape-verse).

## The loop, unattended

One command. No human writes the prompt.

```bash
npm run sentinel:watch -- shopalto-drift
```

```
run    c_mt2khmw11zhlcl023j → 1 row, fields description and image_url are null
detect field_null:description, field_null:image_url        → degraded
heal   "These fields return null/empty after a page change: description,
        image_url. Re-capture them from the current markup while keeping
        existing fields (…) and the same Collector ID."
run    c_mt2khmw11zhlcl023j → ok: true, issues: []
diff   description, image_url
```

Both snapshots are committed in `data/snapshots/`, so the before and after are
inspectable rather than asserted. Same Collector ID on both.

## Example structured output

`examples/` holds real output from the runs above, trimmed to the fields that
matter:

| File | What it shows |
| --- | --- |
| `earbuds-before-heal.json` | `ok: false`, `description` and `image_url` null |
| `earbuds-after-heal.json` | `ok: true`, same Collector ID, both fields back |
| `falkordb-docs.json` | A different shape — 12 doc sections with nested links |
| `sqlite-changelog.json` | A wrapped list expanded into a row per release |

Diff the first two and the heal is the whole delta:

```bash
diff <(jq .rows[0] examples/earbuds-before-heal.json) \
     <(jq .rows[0] examples/earbuds-after-heal.json)
```

Full snapshots, including every row, are in `data/snapshots/`.

## Not staged

Reasonable question for a demo like this, so the evidence is public:

- **[Actions → Sentinel watch](https://github.com/sreecharan-desu/sentinel/actions/workflows/sentinel.yml)**
  runs the loop on a GitHub runner against the live Bright Data API. The log
  shows a per-request `response_id` and the Collector ID it called. Re-run it
  yourself from that tab.
- Every collector is inspectable in Bright Data at
  `brightdata.com/cp/scrapers/<collector-id>`.
- `npx -p @brightdata/cli bdata budget` before and after a run shows the spend.
- The two snapshots either side of the heal are committed, so `git diff` them.

## Setup

```bash
npx -p @brightdata/cli bdata login   # or export BRIGHTDATA_API_KEY=...
npm install
npm run sentinel:run -- shopalto-pdp
npm run dev                          # http://localhost:3000
```

Promo code for hackathon credits: `wemakedevs` (Bright Data billing).

## Commands

```bash
npm run sentinel:create -- <id>              # create Studio scraper, save c_*
npm run sentinel:run   -- <id> [--url URL]   # run + snapshot
npm run sentinel:heal  -- <id> --auto [--prompt=...]
npm run sentinel:watch -- <id> [--url URL]   # run → detect → heal → re-run
npm test                                     # detection + diff logic
```

`--url` runs a collector against a page it was not built for, which is how you
exercise the loop without waiting for a real site to change.

## Adding a source

The dashboard is read-only. Sources are added from the terminal, which is
deliberate: `scraper create` takes 5–15 minutes, needs an API key, and spends
credits, so none of that belongs behind a public button.

Add an entry to `data/collectors.json` with no `collectorId`:

```json
{
  "id": "acme-pricing",
  "name": "Acme pricing",
  "url": "https://example.com/pricing",
  "description": "Pull each plan name and monthly price from this public page.",
  "fields": ["name", "price"],
  "status": "pending"
}
```

Then mint it, snapshot it once, and push:

```bash
npm run sentinel:create -- acme-pricing   # writes the c_* back into the file
npm run sentinel:run    -- acme-pricing
git add data/ && git commit -m "Add Acme pricing collector" && git push
```

`fields` is the contract. Anything listed there that comes back null across
every row is what triggers a heal.

Some pages come back as a single row wrapping a list. SQLite's changelog does
this — one row with a `releases` array rather than a row per release, which
reads as `version` and `release_date` being null. Heal will not fix that,
because it repairs extraction rather than reshaping a payload, so name the
property instead and the pipeline expands it:

```json
{ "fields": ["version", "release_date"], "rowsFrom": "releases" }
```

That turns 1 unusable row into 50 usable ones. Scalar fields on the wrapper,
like the source URL, are carried onto each row.

## How it works

`src/lib/health.ts` decides whether a run is healthy. A run is *broken* when it
returns no rows and *degraded* when a field is null across every row — the case
a plain exit code misses. `healPromptFor` turns those specific failures into the
heal prompt, so the prompt is narrow instead of "fix my scraper."

`src/pipeline/sentinel.ts` wraps the Bright Data CLI: `create` captures the
`c_*`, `run` snapshots and scores the result, `heal` reuses that same ID, and
`watchOnce` chains them and diffs the result.

Collectors live in `data/collectors.json`:

| Collector | ID | Role |
| --- | --- | --- |
| ShopAlto product page | `c_mt2j5vpf2fdmbvf2n4` | Heal extends the schema in place |
| ShopAlto earbuds | `c_mt2khmw11zhlcl023j` | Unattended detect → heal → verify |
| FalkorDB docs | `c_mt2jadm52izcmg18nb` | Docs sections with nested links |
| SQLite changelog | `c_mt2mhq4v6qfm4c54e` | Wrapped list expanded via `rowsFrom` |

## CI

`.github/workflows/ci.yml` typechecks, tests, and builds on every push.
`.github/workflows/sentinel.yml` runs the watch loop every six hours and uploads
the snapshots as artifacts. Both need `BRIGHTDATA_API_KEY` only for the latter.

## Notes

- Public pages only. No login walls, no gov sites.
- Long-tail targets, not Bright Data's pre-built library scrapers.
- Heal re-captures fields within a page's existing shape. It will not convert a
  single-product collector into a listing collector — I tested that and it
  errors, which is why the drift demo stays within one page's structure.
- Coding assistants were used; every create, run, and heal in this repo was
  executed against a live Bright Data account.

## License

MIT
