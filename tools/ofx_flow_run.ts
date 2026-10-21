import type { CustomToolFactory } from "@oh-my-pi/pi-coding-agent";
import { clamp, runOfx, splitKV, text } from "./_ofx";

/**
 * Run an OFX workflow (builtin or local file) with inputs.
 *
 * Supports synchronous runs (bounded by timeoutSec) and detached session
 * submission for long-running engagements.
 */
const factory: CustomToolFactory = (pi) => ({
  name: "ofx_flow_run",
  label: "OFX Flow Run",
  description:
    "Run an OFX red-team workflow (e.g. external-recon, vuln-scan, jwt-attack) with input parameters. " +
    "Use mode='run' for bounded synchronous execution (returns stdout/summary when finished or timeout), " +
    "or mode='submit' to launch a detached session for long scans and poll with ofx_session. " +
    "Only run workflows against targets the user has authorized.",
  parameters: pi.zod.object({
    workflow: pi.zod
      .string()
      .describe("Workflow name (e.g. 'external-recon', 'vuln/jwt-attack') or path to a YAML workflow file"),
    inputs: pi.zod
      .record(pi.zod.string())
      .optional()
      .describe("Input parameters as key=value map, e.g. { target: 'example.com', severity: 'high' }"),
    mode: pi.zod
      .enum(["run", "submit"])
      .optional()
      .describe("run = wait for completion (default), submit = detached background session"),
    timeoutSec: pi.zod
      .number()
      .optional()
      .describe("Max seconds to wait in run mode before returning partial output (default 300)"),
    dryRun: pi.zod
      .boolean()
      .optional()
      .describe("Show the execution plan without running (safe preview)"),
    outputDir: pi.zod
      .string()
      .optional()
      .describe("Output directory for workflow artifacts"),
  }),

  async execute(_id, params, onUpdate, _ctx, signal) {
    const {
      workflow,
      inputs = {},
      mode = "run",
      timeoutSec = 300,
      dryRun = false,
      outputDir,
    } = params;

    if (mode === "submit") {
      onUpdate?.({ content: text(`Submitting ${workflow} as detached session...`) });
      const args = ["session", "submit", "--local", workflow, ...splitKV(inputs)];
      const res = await runOfx(pi.exec, args, { signal, cwd: pi.cwd, timeoutSec: 60 });
      if (res.code !== 0) {
        return {
          content: text(`Session submit failed (exit ${res.code}):\n${clamp(res.stderr || res.stdout)}`),
          isError: true,
        };
      }
      return {
        content: text(clamp(res.stdout)),
        details: { workflow, mode: "submit" },
      };
    }

    const args = ["flow", "run", workflow, "--log-format", "text", ...splitKV(inputs)];
    if (dryRun) args.push("--dry-run");
    if (outputDir) args.push("-o", outputDir);

    onUpdate?.({ content: text(`Running ofx flow run ${workflow}...`) });
    const res = await runOfx(pi.exec, args, { signal, cwd: pi.cwd, timeoutSec });

    const summary = extractSummary(res.stdout);
    const body = summary ?? clamp(res.stdout);
    if (res.timedOut) {
      return {
        content: text(
          `Timed out after ${timeoutSec}s (workflow may still be running in background).\n${body}`,
        ),
        details: { workflow, timedOut: true, exitCode: res.code },
      };
    }
    if (res.code !== 0) {
      return {
        content: text(`Workflow failed (exit ${res.code}):\n${clamp(res.stderr)}\n${body}`),
        isError: true,
        details: { workflow, exitCode: res.code },
      };
    }
    return {
      content: text(body),
      details: { workflow, exitCode: 0, dryRun },
    };
  },
});

function extractSummary(stdout: string): string | null {
  // Pull the execution-summary table plus the last lines of log output.
  const lines = stdout.split("\n");
  const summaryIdx = lines.findIndex((l) => l.includes("Summary:"));
  if (summaryIdx === -1) return null;
  const tailStart = Math.max(0, summaryIdx - 10);
  return lines.slice(tailStart).join("\n").slice(0, 6000);
}

export default factory;
