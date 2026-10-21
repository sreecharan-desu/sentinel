# sentinel

scrapers rarely fail loudly. the run succeeds, the exit code is `0`, and the fields come back empty — so the breakage reaches your database before it reaches you.

sentinel watches collectors built with [bright data scraper studio](https://brightdata.com/products/web-scraper/studio). when a run comes back thin, it writes a heal prompt from the specific fields that failed, heals the collector **in place**, and re-runs to confirm. the collector id never changes, so schedules, jobs, and apps keep calling the same `c_*`.

live dashboard: [sentinel-five-eosin.vercel.app](https://sentinel-five-eosin.vercel.app)

built for [scrape-verse](https://www.wemakedevs.org/hackathons/scrape-verse).

## the loop, unattended

one command. no human writes the prompt.

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

both snapshots are committed in `data/snapshots/`, so the before and after are
inspectable rather than asserted. same collector id on both.

## example structured output

`examples/` holds real output from the runs above, trimmed to the fields that
matter:

| file | what it shows |
| --- | --- |
| `earbuds-before-heal.json` | `ok: false`, `description` and `image_url` null |
| `earbuds-after-heal.json` | `ok: true`, same collector id, both fields back |
| `falkordb-docs.json` | a different shape — 12 doc sections with nested links |
| `sqlite-changelog.json` | a wrapped list expanded into a row per release |

diff the first two and the heal is the whole delta:

```bash
diff <(jq .rows[0] examples/earbuds-before-heal.json) \
     <(jq .rows[0] examples/earbuds-after-heal.json)
```

full snapshots, including every row, are in `data/snapshots/`.

## not staged

reasonable question for a demo like this, so the evidence is public:

- **[actions → sentinel watch](https://github.com/sreecharan-desu/sentinel/actions/workflows/sentinel.yml)**
  runs the loop on a github runner against the live bright data api. the log
  shows a per-request `response_id` and the collector id it called. re-run it
  yourself from that tab.
- every collector is inspectable in bright data at
  `brightdata.com/cp/scrapers/<collector-id>`.
- `npx -p @brightdata/cli bdata budget` before and after a run shows the spend.
- the two snapshots either side of the heal are committed, so `git diff` them.

## stack

next.js 15 · react 19 · typescript · bright data cli · playwright · zod · tailwind css 4

## run locally

```bash
npx -p @brightdata/cli bdata login   # or export BRIGHTDATA_API_KEY=...
npm install
npm run sentinel:run -- shopalto-pdp
npm run dev                          # http://localhost:3000
```

promo code for hackathon credits: `wemakedevs` (bright data billing).

## env

copy `.env.example` to `.env` and set `BRIGHTDATA_API_KEY`, or log in with `npx -p @brightdata/cli bdata login`.

## commands

```bash
npm run sentinel:create -- <id>              # create Studio scraper, save c_*
npm run sentinel:run   -- <id> [--url URL]   # run + snapshot
npm run sentinel:heal  -- <id> --auto [--prompt=...]
npm run sentinel:watch -- <id> [--url URL]   # run → detect → heal → re-run
npm test                                     # detection + diff logic
```

`--url` runs a collector against a page it was not built for, which is how you
exercise the loop without waiting for a real site to change.

## adding a source

the dashboard is read-only. sources are added from the terminal, which is
deliberate: `scraper create` takes 5–15 minutes, needs an api key, and spends
credits, so none of that belongs behind a public button.

add an entry to `data/collectors.json` with no `collectorId`:

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

then mint it, snapshot it once, and push:

```bash
npm run sentinel:create -- acme-pricing   # writes the c_* back into the file
npm run sentinel:run    -- acme-pricing
git add data/ && git commit -m "Add Acme pricing collector" && git push
```

`fields` is the contract. anything listed there that comes back null across
every row is what triggers a heal.

some pages come back as a single row wrapping a list. sqlite's changelog does
this — one row with a `releases` array rather than a row per release, which
reads as `version` and `release_date` being null. heal will not fix that,
because it repairs extraction rather than reshaping a payload, so name the
property instead and the pipeline expands it:

```json
{ "fields": ["version", "release_date"], "rowsFrom": "releases" }
```

that turns 1 unusable row into 50 usable ones. scalar fields on the wrapper,
like the source url, are carried onto each row.

## how it works

`src/lib/health.ts` decides whether a run is healthy. a run is *broken* when it
returns no rows and *degraded* when a field is null across every row — the case
a plain exit code misses. `healPromptFor` turns those specific failures into the
heal prompt, so the prompt is narrow instead of "fix my scraper."

`src/pipeline/sentinel.ts` wraps the bright data cli: `create` captures the
`c_*`, `run` snapshots and scores the result, `heal` reuses that same id, and
`watchOnce` chains them and diffs the result.

collectors live in `data/collectors.json`:

| collector | id | role |
| --- | --- | --- |
| shopalto product page | `c_mt2j5vpf2fdmbvf2n4` | heal extends the schema in place |
| shopalto earbuds | `c_mt2khmw11zhlcl023j` | unattended detect → heal → verify |
| falkordb docs | `c_mt2jadm52izcmg18nb` | docs sections with nested links |
| sqlite changelog | `c_mt2mhq4v6qfm4c54e` | wrapped list expanded via `rowsFrom` |

## ci

`.github/workflows/ci.yml` typechecks, tests, and builds on every push.
`.github/workflows/sentinel.yml` runs the watch loop every six hours and uploads
the snapshots as artifacts. both need `BRIGHTDATA_API_KEY` only for the latter.

## notes

- public pages only. no login walls, no gov sites.
- long-tail targets, not bright data's pre-built library scrapers.
- heal re-captures fields within a page's existing shape. it will not convert a
  single-product collector into a listing collector — i tested that and it
  errors, which is why the drift demo stays within one page's structure.
- coding assistants were used; every create, run, and heal in this repo was
  executed against a live bright data account.

## license

mit

---

built by [sreecharan desu](https://www.sreecharandesu.in) · [more projects](https://www.sreecharandesu.in/work)
