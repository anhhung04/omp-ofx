import type { CustomToolFactory } from "@oh-my-pi/pi-coding-agent";
import { clamp, runOfx, text } from "./_ofx";

/** Show detailed info about an OFX workflow. */
const factory: CustomToolFactory = (pi) => ({
  name: "ofx_flow_info",
  label: "OFX Flow Info",
  description:
    "Show details of an OFX workflow: description, required/optional inputs with defaults, jobs, outputs. Call this before ofx_flow_run to learn which inputs a workflow needs.",
  parameters: pi.zod.object({
    workflow: pi.zod.string().describe("Workflow name or YAML path"),
  }),

  async execute(_id, params, _onUpdate, _ctx, signal) {
    const res = await runOfx(pi.exec, ["flow", "info", params.workflow], {
      signal,
      cwd: pi.cwd,
      timeoutSec: 30,
    });
    if (res.code !== 0) {
      return {
        content: text(`ofx flow info failed (exit ${res.code}):\n${clamp(res.stderr || res.stdout)}`),
        isError: true,
      };
    }
    return { content: text(clamp(res.stdout)), details: {} };
  },
});

export default factory;
