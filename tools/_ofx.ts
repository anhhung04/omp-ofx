/**
 * Shared helpers for OFX plugin tools.
 *
 * OFX binary resolution order:
 *   1. $OFX_BIN — full command line, e.g. "ofx" or "uv run --project /opt/ofx ofx"
 *   2. `ofx` on PATH
 *   3. `uv run --project $OFX_REPO ofx` when $OFX_REPO points at an ofx checkout
 */

export interface OfxCommand {
  cmd: string;
  baseArgs: string[];
}

export function resolveOfx(): OfxCommand {
  const fromEnv = process.env.OFX_BIN?.trim();
  if (fromEnv) {
    const parts = fromEnv.split(/\s+/);
    return { cmd: parts[0], baseArgs: parts.slice(1) };
  }
  const repo = process.env.OFX_REPO?.trim();
  if (repo) {
    return { cmd: "uv", baseArgs: ["run", "--project", repo, "ofx"] };
  }
  return { cmd: "ofx", baseArgs: [] };
}

export function splitKV(inputs: Record<string, string>): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(inputs)) {
    out.push("-i", `${k}=${v}`);
  }
  return out;
}

/** Clamp huge outputs so tool results stay digestible for the model. */
export function clamp(text: string, max = 12000): string {
  if (text.length <= max) return text;
  const head = text.slice(0, Math.floor(max / 3));
  const tail = text.slice(-Math.floor((max * 2) / 3));
  return `${head}\n... [${text.length - max} chars truncated] ...\n${tail}`;
}

export interface ExecLike {
  (
    command: string,
    args: string[],
    options?: { signal?: AbortSignal; cwd?: string },
  ): Promise<{ code: number; stdout: string; stderr: string; killed?: boolean }>;
}

export async function runOfx(
  exec: ExecLike,
  args: string[],
  opts: { signal?: AbortSignal; cwd?: string; timeoutSec?: number } = {},
): Promise<{ code: number; stdout: string; stderr: string; timedOut: boolean }> {
  const ofx = resolveOfx();
  let signal = opts.signal;
  let timedOut = false;
  if (opts.timeoutSec && opts.timeoutSec > 0) {
    const timeout = AbortSignal.timeout(opts.timeoutSec * 1000);
    signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
  }
  try {
    const res = await exec(ofx.cmd, [...ofx.baseArgs, ...args], {
      signal,
      cwd: opts.cwd,
    });
    if (res.killed && opts.timeoutSec) timedOut = true;
    return { code: res.code, stdout: res.stdout, stderr: res.stderr, timedOut };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ENOENT") || msg.includes("not found")) {
      throw new Error(
        `ofx binary not found. Install with 'uv tool install ofx' or set OFX_BIN / OFX_REPO env. Tried: ${ofx.cmd} ${ofx.baseArgs.join(" ")}`,
      );
    }
    throw err;
  }
}

export function text(s: string) {
  return [{ type: "text" as const, text: s }];
}

declare const Bun: { YAML: { parse(s: string): unknown; stringify(v: unknown): string } };

/** ~/.ofx data dir; override with OFX_HOME. */
export function ofxHome(): string {
  return process.env.OFX_HOME?.trim() || `${process.env.HOME}/.ofx`;
}

export async function readYamlConfig(
  file: string,
): Promise<Record<string, unknown>> {
  const f = Bun.file(file);
  if (!(await f.exists())) return {};
  const raw = await f.text();
  if (!raw.trim()) return {};
  const parsed = Bun.YAML.parse(raw);
  return typeof parsed === "object" && parsed !== null
    ? (parsed as Record<string, unknown>)
    : {};
}

export async function writeYamlConfig(
  file: string,
  data: Record<string, unknown>,
): Promise<void> {
  await Bun.write(file, Bun.YAML.stringify(data) + "\n");
}

/** Dotted-path get/set/delete on plain objects ("ai.model"). */
export function getPath(obj: Record<string, unknown>, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function setPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = path.split(".");
  let cur = obj;
  for (const part of parts.slice(0, -1)) {
    const next = cur[part];
    if (typeof next !== "object" || next === null || Array.isArray(next)) {
      cur[part] = {};
    }
    cur = cur[part] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

export function deletePath(obj: Record<string, unknown>, path: string): boolean {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const part of parts.slice(0, -1)) {
    if (typeof cur !== "object" || cur === null) return false;
    cur = (cur as Record<string, unknown>)[part];
  }
  if (typeof cur !== "object" || cur === null) return false;
  return delete (cur as Record<string, unknown>)[parts[parts.length - 1]];
}

/** Redact values under sensitive keys before showing config to the model. */
const SECRET_KEY = /token|key|secret|password|passphrase/i;

export function redactSecrets(value: unknown, keyHint = ""): unknown {
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v));
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = redactSecrets(v, k);
    return out;
  }
  if (
    SECRET_KEY.test(keyHint) &&
    typeof value === "string" &&
    value.length > 0
  ) {
    return "***";
  }
  return value;
}
