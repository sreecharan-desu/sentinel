"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CollectorDef, HealEvent, Snapshot } from "@/lib/types";

type State = {
  collectors: CollectorDef[];
  snapshots: Snapshot[];
  heals: HealEvent[];
  generatedAt: string;
};

type Step =
  | { kind: "run"; at: string; snapshot: Snapshot }
  | { kind: "heal"; at: string; heal: HealEvent };

type ThemeMode = "dark" | "light";

const statusTone: Record<string, string> = {
  healthy: "text-accent",
  healing: "text-accent",
  degraded: "text-[hsl(var(--warning))]",
  broken: "text-[hsl(var(--error))]",
  pending: "text-secondary",
  unknown: "text-secondary",
};

const statusLabel: Record<string, string> = {
  healthy: "Healthy",
  healing: "Healing",
  degraded: "Needs a look",
  broken: "Broken",
  pending: "Not set up",
  unknown: "Not checked",
};

export default function HomePage() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState("shopalto-drift");
  const [stepIndex, setStepIndex] = useState(0);
  const [view, setView] = useState<"readable" | "json">("readable");
  const [playing, setPlaying] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    const stored = (localStorage.getItem("theme") as ThemeMode | null) ?? "dark";
    setTheme(stored);
    document.documentElement.classList.toggle("dark", stored === "dark");
    document.documentElement.classList.toggle("light", stored === "light");
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/state", { cache: "no-store" });
        if (!res.ok) throw new Error(`Could not load data (${res.status})`);
        const json = (await res.json()) as State;
        if (!alive) return;
        setState(json);
        setError(null);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Could not load data");
      }
    };
    load();
    const id = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const collectors = state?.collectors ?? [];
  const collector = collectors.find((c) => c.id === selected);

  const steps = useMemo<Step[]>(() => {
    if (!state) return [];
    const runs: Step[] = state.snapshots
      .filter((s) => s.collectorKey === selected)
      .map((s) => ({ kind: "run", at: s.fetchedAt, snapshot: s }));
    const heals: Step[] = state.heals
      .filter((h) => h.collectorKey === selected)
      .map((h) => ({ kind: "heal", at: h.promptedAt, heal: h }));
    return [...runs, ...heals].sort((a, b) => a.at.localeCompare(b.at));
  }, [state, selected]);

  // Land on the outcome; the replay walks back to the start.
  useEffect(() => {
    if (steps.length) setStepIndex(steps.length - 1);
  }, [steps.length, selected]);

  useEffect(() => {
    if (!playing) return;
    if (stepIndex >= steps.length - 1) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setStepIndex((i) => i + 1), 1600);
    return () => clearTimeout(t);
  }, [playing, stepIndex, steps.length]);

  const replay = useCallback(() => {
    setStepIndex(0);
    setPlaying(true);
  }, []);

  // Switching sources can leave stepIndex past the end of the new, shorter list
  // for one render, so clamp rather than trusting the effect above to catch up.
  const safeIndex = Math.min(stepIndex, Math.max(steps.length - 1, 0));
  const step = steps[safeIndex];
  const priorRun = useMemo(() => {
    for (let i = Math.min(safeIndex, steps.length) - 1; i >= 0; i -= 1) {
      const s = steps[i];
      if (s?.kind === "run") return s.snapshot;
    }
    return undefined;
  }, [steps, safeIndex]);

  const toggleTheme = () => {
    const next: ThemeMode = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
    document.documentElement.classList.toggle("light", next === "light");
  };

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
      <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur sm:h-14 sm:px-5">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <span className="size-2 shrink-0 rounded-full bg-accent" />
          <span className="text-sm font-medium text-primary">Sentinel</span>
          <span className="hidden truncate text-xs text-secondary md:inline">
            Scrapers that fix themselves and keep the same Collector ID
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="inline-flex size-8 items-center justify-center rounded-full text-secondary transition-colors duration-150 hover:text-primary"
          >
            {theme === "dark" ? "◐" : "◑"}
          </button>
          <a
            href="https://github.com/sreecharan-desu/sentinel"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center rounded-full px-3 text-xs font-medium text-primary shadow-[inset_0_0_0_1px_hsl(var(--border))] transition-colors duration-150 hover:bg-primary/[0.05] sm:px-3.5"
          >
            GitHub
          </a>
        </div>
      </header>

      {/* Mobile / tablet: horizontal sources */}
      <div className="shrink-0 border-b border-border lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 pt-3">
          <p className="text-xs text-secondary">Sources</p>
          <p className="font-mono text-[11px] text-secondary">
            {state?.snapshots.length ?? 0} runs · {state?.heals.length ?? 0} heals
          </p>
        </div>
        <div className="flex gap-2 overflow-x-auto px-4 py-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {collectors.map((c) => {
            const active = c.id === selected;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setSelected(c.id);
                  setPlaying(false);
                  setDetailsOpen(false);
                }}
                className={`shrink-0 rounded-full px-3.5 py-2 text-left transition-colors duration-150 ${
                  active
                    ? "bg-primary text-background"
                    : "bg-card text-primary shadow-[inset_0_0_0_1px_hsl(var(--border))]"
                }`}
              >
                <span className="block whitespace-nowrap text-xs font-medium">
                  {c.name}
                </span>
                <span
                  className={`mt-0.5 flex items-center gap-1 text-[10px] ${
                    active ? "text-background/70" : "text-secondary"
                  }`}
                >
                  <span className={active ? "text-background" : statusTone[c.status]}>
                    ●
                  </span>
                  {statusLabel[c.status] ?? c.status}
                </span>
              </button>
            );
          })}
        </div>
        <p className="border-t border-border px-4 py-2.5 text-[11px] leading-relaxed text-secondary">
          <span className="text-primary">Sources are added from the terminal, not here.</span>{" "}
          Read-only on purpose —{" "}
          <code className="font-mono text-primary/70">sentinel:create</code> then push.
        </p>
      </div>

      <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[230px_minmax(0,1fr)_300px] xl:grid-cols-[248px_minmax(0,1fr)_320px]">
        {/* Desktop sources rail */}
        <aside className="scroll-area hidden min-h-0 flex-col border-r border-border lg:flex">
          <p className="px-5 pb-2 pt-4 text-xs text-secondary">Sources</p>
          <div className="flex-1 px-3 pb-4">
            {collectors.map((c) => {
              const active = c.id === selected;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setSelected(c.id);
                    setPlaying(false);
                  }}
                  className={`mb-1 w-full rounded-lg px-3 py-2.5 text-left transition-colors duration-150 ${
                    active ? "bg-card" : "hover:bg-card/60"
                  }`}
                >
                  <span
                    className={`block text-sm font-medium ${
                      active ? "text-primary" : "text-primary/70"
                    }`}
                  >
                    {c.name}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs text-secondary">
                    <span className={statusTone[c.status]}>●</span>
                    {statusLabel[c.status] ?? c.status}
                  </span>
                </button>
              );
            })}

            <p className="mx-1 mt-3 rounded-lg border border-border bg-card px-3 py-2.5 text-xs leading-relaxed text-secondary">
              <span className="text-primary">
                Sources are added from the terminal, not here.
              </span>{" "}
              This dashboard is read-only on purpose.{" "}
              <code className="font-mono text-primary/70">sentinel:create</code>{" "}
              mints the collector, then a push deploys it.
            </p>
          </div>
          <div className="border-t border-border px-5 py-4">
            <p className="text-xs text-secondary">Totals</p>
            <dl className="mt-2.5 grid grid-cols-2 gap-y-3">
              <Metric label="Runs" value={state?.snapshots.length ?? 0} />
              <Metric label="Heals" value={state?.heals.length ?? 0} />
            </dl>
          </div>
        </aside>

        <section className="flex min-h-0 flex-col lg:min-h-0">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-6 sm:py-4">
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-lg font-medium tracking-tight text-primary sm:text-xl">
                {collector?.name ?? "Select a source"}
              </h1>
              {collector && (
                <a
                  href={collector.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 block truncate text-[11px] text-secondary transition-colors duration-150 hover:text-primary sm:text-xs"
                >
                  {collector.url}
                </a>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setDetailsOpen((o) => !o)}
                className="inline-flex h-8 items-center rounded-full px-3 text-xs font-medium text-secondary shadow-[inset_0_0_0_1px_hsl(var(--border))] lg:hidden"
              >
                {detailsOpen ? "Hide details" : "Details"}
              </button>
              {steps.length > 1 && (
                <button
                  type="button"
                  onClick={replay}
                  className="inline-flex h-8 shrink-0 items-center gap-2 rounded-full bg-accent px-3.5 text-xs font-medium text-background transition-opacity duration-150 hover:opacity-90 sm:px-4"
                >
                  {playing ? "Playing…" : "Replay the loop"}
                </button>
              )}
            </div>
          </div>

          {/* Mobile details drawer */}
          {detailsOpen && (
            <div className="border-b border-border lg:hidden">
              <DetailsPanel collector={collector} selected={selected} />
            </div>
          )}

          {error ? (
            <p className="px-4 py-5 text-sm text-[hsl(var(--error))] sm:px-6">
              {error}
            </p>
          ) : steps.length === 0 ? (
            <p className="px-4 py-5 text-sm text-secondary sm:px-6">
              No runs recorded yet.
            </p>
          ) : (
            <>
              <Timeline
                steps={steps}
                index={safeIndex}
                expected={collector?.fields.length ?? 0}
                onPick={(i) => {
                  setPlaying(false);
                  setStepIndex(i);
                }}
              />
              <div className="scroll-area min-h-0 flex-1 px-4 py-4 sm:px-6 sm:py-5">
                {step?.kind === "heal" ? (
                  <HealStep event={step.heal} />
                ) : step ? (
                  <RunStep
                    snapshot={step.snapshot}
                    prior={priorRun}
                    fields={collector?.fields ?? []}
                    view={view}
                    onView={setView}
                  />
                ) : null}
              </div>
            </>
          )}
        </section>

        <aside className="scroll-area hidden min-h-0 flex-col border-l border-border lg:flex">
          <DetailsPanel collector={collector} selected={selected} />
        </aside>
      </main>
    </div>
  );
}

function DetailsPanel({
  collector,
  selected,
}: {
  collector?: CollectorDef;
  selected: string;
}) {
  return (
    <>
      <div className="border-b border-border px-4 py-4 sm:px-5">
        <p className="text-xs text-secondary">Collector</p>
        {collector ? (
          <dl className="mt-2.5 space-y-3">
            <Field label="Fields expected">{collector.fields.join(", ")}</Field>
            <Field label="Created">{formatWhen(collector.createdAt)}</Field>
            <Field label="Last run">{formatWhen(collector.lastRunAt)}</Field>
          </dl>
        ) : (
          <p className="mt-2.5 text-sm text-secondary">—</p>
        )}
      </div>

      {collector?.collectorId && (
        <div className="border-b border-border px-4 py-4 sm:px-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-secondary">The same ID at every step above</p>
            <CopyButton value={collector.collectorId} />
          </div>
          <p className="mt-2 break-all rounded-lg border border-accent/30 bg-accent/[0.06] px-3 py-2.5 font-mono text-xs text-primary">
            {collector.collectorId}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-secondary">
            Healing edits the collector in place. If it minted a new ID, every
            schedule and app calling it would break.
          </p>
        </div>
      )}

      {collector?.notes && (
        <div className="border-b border-border px-4 py-4 sm:px-5">
          <p className="text-xs text-secondary">Why this source is here</p>
          <p className="mt-2 text-sm leading-relaxed text-primary/85">{collector.notes}</p>
        </div>
      )}

      <div className="px-4 py-4 sm:px-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-secondary">Reproduce it</p>
          <CopyButton value={`npm run sentinel:watch -- ${selected}`} />
        </div>
        <pre className="mt-2 whitespace-pre-wrap break-all rounded-lg border border-border bg-codeblock p-3 font-mono text-[11px] leading-relaxed text-primary/80">
          {`npm run sentinel:watch -- ${selected}`}
        </pre>
        <p className="mt-2 text-xs leading-relaxed text-secondary">
          Runs the same loop against a live Bright Data account and overwrites the
          snapshots above.
        </p>
      </div>
    </>
  );
}

function Timeline({
  steps,
  index,
  expected,
  onPick,
}: {
  steps: Step[];
  index: number;
  expected: number;
  onPick: (i: number) => void;
}) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-border px-4 py-3 sm:px-6">
      {steps.map((s, i) => {
        const active = i === index;
        const tone = stepTone(s, expected);
        return (
          <div key={s.at + i} className="flex items-center gap-1">
            {i > 0 && <span className="px-1 text-secondary/50">→</span>}
            <button
              type="button"
              onClick={() => onPick(i)}
              className={`flex flex-col items-start rounded-lg px-3 py-2 text-left transition-colors duration-200 ${
                active ? "bg-card shadow-[inset_0_0_0_1px_hsl(var(--border))]" : "hover:bg-card/50"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <span className={tone.dot}>●</span>
                <span
                  className={`whitespace-nowrap text-xs font-medium ${
                    active ? "text-primary" : "text-secondary"
                  }`}
                >
                  {stepTitle(s, i)}
                </span>
              </span>
              <span className="mt-0.5 whitespace-nowrap text-[11px] text-secondary">
                {tone.detail}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function stepTone(s: Step, expected: number) {
  if (s.kind === "heal") {
    return {
      dot: "text-accent",
      detail:
        s.heal.trigger === "detected"
          ? "prompt written from the empty fields"
          : "prompt written by hand",
    };
  }
  if (s.snapshot.ok) {
    return {
      dot: "text-accent",
      detail: expected ? `all ${expected} fields came back` : "all fields came back",
    };
  }
  const empty = s.snapshot.issues.filter((i) => i.startsWith("field_")).length;
  return {
    dot: "text-[hsl(var(--warning))]",
    detail: s.snapshot.issues.includes("empty_result")
      ? "no rows at all"
      : `${empty} of ${expected} fields came back empty`,
  };
}

function stepTitle(s: Step, position: number) {
  if (s.kind === "heal") return "Heal";
  return position === 0 ? "Run" : "Run again";
}

function RunStep({
  snapshot,
  prior,
  fields,
  view,
  onView,
}: {
  snapshot: Snapshot;
  prior?: Snapshot;
  fields: string[];
  view: "readable" | "json";
  onView: (v: "readable" | "json") => void;
}) {
  // Detection scores a field across every row, so the table has to as well —
  // otherwise a field missing only from row 1 reads as broken when it isn't.
  const scored = fields.map((field) => score(snapshot.rows, field));
  const priorScores = prior
    ? new Map(fields.map((f) => [f, score(prior.rows, f)]))
    : undefined;
  const missing = scored.filter((s) => s.present === 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-sm leading-relaxed text-secondary">
          {snapshot.ok ? (
            <>
              The run returned {snapshot.rowCount} row
              {snapshot.rowCount === 1 ? "" : "s"} and every field the collector was
              asked for is present.
            </>
          ) : (
            <>
              The run <span className="text-primary">succeeded</span> — exit code zero,{" "}
              {snapshot.rowCount} row{snapshot.rowCount === 1 ? "" : "s"} returned. But{" "}
              <span className="text-[hsl(var(--warning))]">
                {missing.length} of the {fields.length} fields came back empty
              </span>
              , so this row would have reached your database with nothing raising a flag.
            </>
          )}
        </p>
        <div className="inline-flex shrink-0 rounded-full bg-card p-0.5">
          {(["readable", "json"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onView(v)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium capitalize transition-colors duration-150 ${
                view === v ? "bg-primary text-background" : "text-secondary hover:text-primary"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {view === "json" ? (
        <div className="relative">
          <div className="absolute right-3 top-3">
            <CopyButton
              value={JSON.stringify(snapshot.rows, null, 2)}
              label={`Copy all ${snapshot.rowCount} rows`}
            />
          </div>
          <pre className="overflow-x-auto rounded-xl border border-border bg-codeblock p-4 pr-32 font-mono text-[12px] leading-relaxed text-primary/85">
            {JSON.stringify(snapshot.rows.slice(0, 6), null, 2)}
          </pre>
          {snapshot.rowCount > 6 && (
            <p className="mt-2 text-xs text-secondary">
              Showing 6 of {snapshot.rowCount} rows. Copy takes all of them.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-border">
            {scored.map(({ field, sample, present }, i) => {
              const empty = present === 0;
              const recovered = !empty && priorScores?.get(field)?.present === 0;
              const partial = present > 0 && present < snapshot.rowCount;
              return (
                <div
                  key={field}
                  className={`flex items-baseline gap-4 px-4 py-2.5 ${
                    i > 0 ? "border-t border-border" : ""
                  } ${empty ? "bg-[hsl(var(--warning))]/[0.05]" : ""}`}
                >
                  <span className="w-20 shrink-0 font-mono text-[11px] text-secondary sm:w-28 sm:text-xs">
                    {field}
                  </span>
                  <span
                    className={`min-w-0 flex-1 truncate text-sm ${
                      empty ? "italic text-[hsl(var(--warning))]" : "text-primary"
                    }`}
                  >
                    {empty ? "empty in every row" : sample}
                  </span>
                  {recovered && (
                    <span className="shrink-0 text-xs text-accent">recovered</span>
                  )}
                  {!recovered && snapshot.rowCount > 1 && (
                    <span
                      className={`shrink-0 font-mono text-[11px] ${
                        partial ? "text-[hsl(var(--warning))]" : "text-secondary"
                      }`}
                    >
                      {present}/{snapshot.rowCount}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-secondary">
            {snapshot.rowCount > 1
              ? `Counts are rows carrying that field, out of ${snapshot.rowCount}. A field only counts as broken when it is empty in every row.`
              : "Checked against the fields listed for this collector in data/collectors.json."}
          </p>
        </>
      )}
    </div>
  );
}

function score(rows: Record<string, unknown>[], field: string) {
  let sample = "";
  let present = 0;
  for (const row of rows) {
    const value = valueFor(row, field);
    if (value == null) continue;
    present += 1;
    if (!sample) sample = value;
  }
  return { field, sample, present };
}

/** Mirrors the alias handling in lib/health.ts so the UI scores a row the same way. */
function valueFor(row: Record<string, unknown>, field: string): string | null {
  const direct = row[field];
  const resolved =
    direct != null && direct !== ""
      ? direct
      : field === "name"
        ? row.product_name
        : field === "title"
          ? row.section_title
          : field === "description"
            ? row.section_description
            : field === "image_url"
              ? row.image
              : field === "url"
                ? row.product_page_url
                : undefined;

  if (resolved == null || resolved === "") return null;
  if (field === "price") {
    return formatPrice(resolved) ?? str(row.price_display) ?? String(resolved);
  }
  if (typeof resolved === "object") return JSON.stringify(resolved);
  return cleanText(String(resolved));
}

function HealStep({ event }: { event: HealEvent }) {
  const detected = event.trigger === "detected";
  return (
    <div className="max-w-2xl">
      <p className="text-sm leading-relaxed text-secondary">
        {detected ? (
          <>
            Sentinel read the failing fields off the last run and wrote this prompt
            itself. <span className="text-primary">Nobody typed it.</span>
          </>
        ) : (
          <>A hand-written prompt, to extend the schema in place.</>
        )}
      </p>

      <blockquote className="mt-3 rounded-xl border border-border bg-card p-4 font-mono text-[12px] leading-relaxed text-primary/85">
        {event.prompt}
      </blockquote>

      <dl className="mt-4 space-y-3">
        <Field label="Sent to">
          <span className="font-mono text-xs">bdata scraper heal {event.collectorId}</span>
        </Field>
        <Field label="Result">
          <span className={event.status === "done" ? "text-accent" : "text-secondary"}>
            {humanHealStatus(event.status)}
          </span>
        </Field>
      </dl>
    </div>
  );
}

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 1600);
  };

  return (
    <button
      type="button"
      onClick={copy}
      className={`rounded-full bg-card px-2.5 py-1 text-[11px] font-medium shadow-[inset_0_0_0_1px_hsl(var(--border))] transition-colors duration-150 ${
        state === "copied"
          ? "text-accent"
          : state === "failed"
            ? "text-[hsl(var(--error))]"
            : "text-secondary hover:text-primary"
      }`}
    >
      {state === "copied" ? "Copied" : state === "failed" ? "Press ⌘C" : label}
    </button>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-secondary">{label}</dt>
      <dd className="mt-0.5 font-display text-xl font-medium tracking-tight text-primary">
        {value}
      </dd>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-secondary">{label}</dt>
      <dd className="mt-0.5 text-sm text-primary">{children}</dd>
    </div>
  );
}

function humanHealStatus(status: HealEvent["status"]) {
  if (status === "done") return "Healed, same Collector ID";
  if (status === "awaiting_approval") return "Waiting for approval";
  if (status === "started") return "Running";
  if (status === "failed") return "Failed";
  return status;
}

function formatWhen(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanText(value: string) {
  return value.replace(/^\u200b+/, "").replace(/\s+/g, " ").trim();
}

function formatPrice(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const p = value as Record<string, unknown>;
  if (p.value == null) return null;
  return `${p.symbol ?? ""}${p.value}${p.currency ? ` ${p.currency}` : ""}`;
}

