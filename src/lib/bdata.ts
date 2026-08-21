import { spawn } from "node:child_process";

export type BdataResult = {
  code: number;
  stdout: string;
  stderr: string;
};

/**
 * Run Bright Data CLI via npx so nothing is installed globally.
 * Prefers BRIGHTDATA_API_KEY when set (CI / headless).
 */
export function runBdata(args: string[], opts: { timeoutMs?: number } = {}): Promise<BdataResult> {
  const timeoutMs = opts.timeoutMs ?? 25 * 60 * 1000;
  const env = { ...process.env };

  return new Promise((resolve) => {
    const child = spawn("npx", ["-p", "@brightdata/cli", "bdata", ...args], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ code: 124, stdout, stderr: stderr + "\n[sentinel] timed out" });
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

export function extractCollectorId(text: string): string | undefined {
  const match = text.match(/\b(c_[a-z0-9]+)\b/i);
  return match?.[1];
}

export function extractJsonPayload(text: string): unknown {
  // Prefer last JSON array/object in the stream (CLI prints progress then payload)
  const candidates: string[] = [];
  const arrayMatches = text.match(/\[[\s\S]*\]/g);
  const objectMatches = text.match(/\{[\s\S]*\}/g);
  if (arrayMatches) candidates.push(...arrayMatches);
  if (objectMatches) candidates.push(...objectMatches);

  for (let i = candidates.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(candidates[i]!);
    } catch {
      // keep trying
    }
  }
  throw new Error("Could not parse JSON from Bright Data CLI output");
}

export function asRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((row) => row && typeof row === "object") as Record<string, unknown>[];
  }
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.data)) return asRows(obj.data);
    if (Array.isArray(obj.results)) return asRows(obj.results);
    if (Array.isArray(obj.preview_result)) return asRows(obj.preview_result);
    return [obj];
  }
  return [];
}
