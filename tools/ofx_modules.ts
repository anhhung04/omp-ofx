import type { CustomToolFactory } from "@oh-my-pi/pi-coding-agent";
import { clamp, runOfx, text } from "./_ofx";

/** Browse the OFX module catalog (builtins, tools, library, cached remotes). */
const factory: CustomToolFactory = (pi) => ({
  name: "ofx_modules",
  label: "OFX Modules",
  description:
    "Browse OFX step modules. action='list' shows all modules (builtin shell/python, tools like nmap/ffuf, library functions); action='info' shows one module's description and arguments. Use when authoring custom workflows.",
  parameters: pi.zod.object({
    action: pi.zod.enum(["list", "info"]).describe("list catalog or show one module"),
    module: pi.zod
      .string()
      .optional()
      .describe("Module name for info action, e.g. 'shell', 'c2.bash_reverse_shell'"),
  }),

  async execute(_id, params, _onUpdate, _ctx, signal) {
    if (params.action === "info" && !params.module) {
      return { content: text("action 'info' requires 'module'"), isError: true };
    }
    const args =
      params.action === "list"
        ? ["flow", "modules", "list"]
        : ["flow", "modules", "info", params.module as string];
    const res = await runOfx(pi.exec, args, { signal, cwd: pi.cwd, timeoutSec: 30 });
    if (res.code !== 0) {
      return {
        content: text(`ofx modules ${params.action} failed (exit ${res.code}):\n${clamp(res.stderr || res.stdout)}`),
        isError: true,
      };
    }
    return { content: text(clamp(res.stdout)), details: {} };
  },
});

export default factory;
