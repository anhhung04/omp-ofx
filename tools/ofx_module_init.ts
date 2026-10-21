import type { CustomToolFactory } from "@oh-my-pi/pi-coding-agent";
import { clamp, runOfx, text } from "./_ofx";

declare const Bun: { file(p: string): { exists(): Promise<boolean>; text(): Promise<string> }; write(p: string, c: string): Promise<unknown> };

/**
 * Scaffold and verify user-defined OFX modules (UDFs).
 *
 * A UDF is a Python file exposing `run(ctx)` (or another callable) that the
 * workflow references as `module: my_module.py::run`. The scaffold action
 * writes a contract-correct template; verify runs a smoke invocation through
 * a throwaway workflow to prove the module loads and executes.
 */
const factory: CustomToolFactory = (pi) => ({
  name: "ofx_module_init",
  label: "OFX Module Init",
  description:
    "Scaffold a user-defined OFX module (UDF python file with run(ctx) contract) and optionally verify it " +
    "executes via a throwaway workflow. action='scaffold' writes the file; action='verify' runs a minimal " +
    "workflow that invokes the module and reports success/failure. Use when the user wants a custom module " +
    "beyond the builtin/library catalog.",
  parameters: pi.zod.object({
    action: pi.zod.enum(["scaffold", "verify"]),
    path: pi.zod
      .string()
      .describe("Module file path, e.g. 'my_module.py' (created or verified)"),
    description: pi.zod.string().optional().describe("Module purpose (scaffold docstring)"),
    entrypoint: pi.zod
      .string()
      .optional()
      .describe("Callable name workflows reference via path::entrypoint (default 'run')"),
    overwrite: pi.zod.boolean().optional().describe("Overwrite existing file on scaffold"),
  }),

  async execute(_id, params, _onUpdate, _ctx, signal) {
    const { action, path, entrypoint = "run" } = params;
    const file = Bun.file(path);

    if (action === "scaffold") {
      if (!params.overwrite && (await file.exists())) {
        return {
          content: text(`${path} already exists (pass overwrite=true to replace)`),
          isError: true,
        };
      }
      const desc = params.description ?? "Custom OFX module";
      await Bun.write(path, scaffoldSource(desc, entrypoint));
      return {
        content: text(
          `Created ${path}. Reference it in a workflow step as:\n  module: ${path.split("/").pop()}::${entrypoint}\n` +
            `Inputs arrive via ctx.inputs; emit results with ctx.add_outputs(...) or a return dict.`,
        ),
        details: { path, entrypoint },
      };
    }

    // verify: build a throwaway workflow that invokes the module
    if (!(await file.exists())) {
      return { content: text(`${path} not found`), isError: true };
    }
    const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ".";
    const base = path.split("/").pop() as string;
    const wf = `${dir}/.ofx-verify-${Date.now()}.yml`;
    await Bun.write(
      wf,
      [
        "name: udf-verify",
        "jobs:",
        "  t:",
        "    steps:",
        "      - name: probe",
        `        module: ${base}::${entrypoint}`,
        "        with: {}",
        "",
      ].join("\n"),
    );
    try {
      const res = await runOfx(pi.exec, ["flow", "run", wf, "--log-format", "text"], {
        signal,
        cwd: pi.cwd,
        timeoutSec: 60,
      });
      const ok = res.code === 0 && res.stdout.includes("COMPLETED");
      return {
        content: text(
          ok
            ? `Module ${path}::${entrypoint} verified — executed successfully.`
            : `Module verification FAILED:\n${clamp(res.stdout + "\n" + res.stderr)}`,
        ),
        isError: !ok,
        details: { path, verified: ok },
      };
    } finally {
      await pi.exec("rm", ["-f", wf], {});
    }
  },
});

function scaffoldSource(description: string, entrypoint: string): string {
  return `"""${description}

OFX user-defined module (UDF).

Contract — the callable receives a ModuleContext (\`ctx\`):
  ctx.inputs            step \`with:\` args (dict)
  ctx.secrets           resolved secrets (dict)
  ctx.env               environment variables (dict)
  ctx.working_directory Path of the step working directory
  ctx.add_outputs(**kw) merge keys into step outputs
  ctx.log(msg)          log through the step logger
Return None or a dict (merged into step outputs).
Raise to fail the step (traceback captured into the step error).
"""

from __future__ import annotations

from typing import Any


def ${entrypoint}(ctx) -> dict[str, Any]:
    """TODO: implement module behavior."""
    ctx.log("module started")
    # inputs = ctx.inputs.get("some_arg")
    ctx.add_outputs(status="ok")
    return {}
`;
}

export default factory;
