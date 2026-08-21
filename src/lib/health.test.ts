import assert from "node:assert/strict";
import { test } from "node:test";
import {
  detectIssues,
  diffSnapshots,
  healPromptFor,
  healthFromIssues,
} from "./health";
import { expandRows } from "../pipeline/sentinel";
import type { CollectorDef, Snapshot } from "./types";

const def: CollectorDef = {
  id: "demo",
  name: "Demo",
  url: "https://example.com/product",
  description: "demo",
  fields: ["name", "price", "rating"],
  status: "unknown",
};

function snapshot(rows: Record<string, unknown>[]): Snapshot {
  return {
    id: "s",
    collectorKey: "demo",
    collectorId: "c_demo",
    url: def.url,
    fetchedAt: "2026-01-01T00:00:00.000Z",
    rowCount: rows.length,
    rows,
    ok: true,
    issues: [],
  };
}

test("a run with every field populated reports no issues", () => {
  const issues = detectIssues([{ name: "Earbuds", price: 10, rating: 4.5 }], def.fields);
  assert.deepEqual(issues, []);
});

test("a run that returns rows but empty fields is caught", () => {
  const issues = detectIssues([{ name: "", price: null, rating: 4.5 }], def.fields);
  assert.deepEqual(issues, ["field_null:name", "field_null:price"]);
});

test("zero rows is reported as broken, not degraded", () => {
  const issues = detectIssues([], def.fields);
  assert.deepEqual(issues, ["empty_result"]);
  assert.equal(healthFromIssues(issues), "broken");
});

test("null fields degrade the collector instead of breaking it", () => {
  assert.equal(healthFromIssues(["field_null:price"]), "degraded");
  assert.equal(healthFromIssues([]), "healthy");
});

test("Scraper Studio field aliases count as present", () => {
  const rows = [{ product_name: "Earbuds", price: 10, rating: 4.5 }];
  assert.deepEqual(detectIssues(rows, ["name", "price", "rating"]), []);
});

test("one populated row is enough to consider a field healthy", () => {
  const rows = [{ name: "", price: 10 }, { name: "Earbuds", price: 12 }];
  assert.deepEqual(detectIssues(rows, ["name", "price"]), []);
});

test("the heal prompt names only the fields that actually failed", () => {
  const prompt = healPromptFor(def, ["field_null:price", "field_null:rating"]);
  assert.match(prompt, /price, rating/);
  assert.match(prompt, /same Collector ID/);
});

test("an empty result asks for navigation to be re-established", () => {
  const prompt = healPromptFor(def, ["empty_result"]);
  assert.match(prompt, /returned no rows/);
});

test("the diff reports fields recovered by a heal", () => {
  const before = snapshot([{ name: "Earbuds", description: null }]);
  const after = snapshot([{ name: "Earbuds", description: "Noise cancelling" }]);
  assert.deepEqual(
    diffSnapshots(before, after).map((d) => d.field),
    ["description"],
  );
});

test("comparing against a missing snapshot yields no diff", () => {
  assert.deepEqual(diffSnapshots(undefined, snapshot([{ name: "x" }])), []);
});

test("a wrapped list becomes one row per item, keeping the wrapper's context", () => {
  const rows = [
    {
      url: "https://example.com/changes",
      releases: [
        { version: "3.1", release_date: "2026-01-01" },
        { version: "3.0", release_date: "2025-12-01" },
      ],
    },
  ];
  assert.deepEqual(expandRows(rows, "releases"), [
    { url: "https://example.com/changes", version: "3.1", release_date: "2026-01-01" },
    { url: "https://example.com/changes", version: "3.0", release_date: "2025-12-01" },
  ]);
});

test("expanding a row that has no such list leaves it alone", () => {
  const rows = [{ name: "Earbuds", price: 10 }];
  assert.deepEqual(expandRows(rows, "releases"), rows);
});

test("expansion turns an unusable payload into one the detector passes", () => {
  const wrapped = [{ releases: [{ version: "3.1", release_date: "2026-01-01" }] }];
  const fields = ["version", "release_date"];
  assert.deepEqual(detectIssues(wrapped, fields), [
    "field_null:version",
    "field_null:release_date",
  ]);
  assert.deepEqual(detectIssues(expandRows(wrapped, "releases"), fields), []);
});
