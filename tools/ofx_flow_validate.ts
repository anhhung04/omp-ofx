import type { CustomToolFactory } from "@oh-my-pi/pi-coding-agent";
import { clamp, runOfx, text } from "./_ofx";

/** Validate an OFX workflow file before running it. */
const factory: CustomToolFactory = (pi) => ({
  name: "ofx_flow_validate",
  label: "OFX Flow Validate",
  description:
    "Validate an OFX workflow YAML file. Returns validation errors with line numbers when invalid; confirms validity otherwise. Run this after writing or editing a workflow.",
  parameters: pi.zod.object({
    workflow: pi.zod
      .string()
      .describe("Workflow name or path to a YAML workflow file to validate"),
  }),

  async execute(_id, params, _onUpdate, _ctx, signal) {
    const res = await runOfx(pi.exec, ["flow", "validate", params.workflow], {
      signal,
      cwd: pi.cwd,
      timeoutSec: 30,
    });
    const out = res.stdout + (res.stderr ? `\n${res.stderr}` : "");
    if (res.code !== 0) {
      return {
        content: text(`Workflow '${params.workflow}' is INVALID:\n${clamp(out)}`),
        isError: true,
        details: { valid: false },
      };
    }
    return {
      content: text(clamp(out) || `Workflow '${params.workflow}' is valid.`),
      details: { valid: true },
    };
  },
});

export default factory;
