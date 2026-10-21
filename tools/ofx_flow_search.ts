import type { CustomToolFactory } from "@oh-my-pi/pi-coding-agent";
import { clamp, runOfx, text } from "./_ofx";

/** Search OFX workflows by keyword. */
const factory: CustomToolFactory = (pi) => ({
  name: "ofx_flow_search",
  label: "OFX Flow Search",
  description:
    "Search OFX builtin workflows by keyword (name, description, tag). Use this to find the right workflow before running, e.g. 'jwt', 'subdomain', 'ssrf'.",
  parameters: pi.zod.object({
    query: pi.zod.string().describe("Search keyword"),
  }),

  async execute(_id, params, _onUpdate, _ctx, signal) {
    const res = await runOfx(pi.exec, ["flow", "search", params.query], {
      signal,
      cwd: pi.cwd,
      timeoutSec: 30,
    });
    if (res.code !== 0) {
      return {
        content: text(`ofx flow search failed (exit ${res.code}):\n${clamp(res.stderr || res.stdout)}`),
        isError: true,
      };
    }
    return { content: text(clamp(res.stdout)), details: {} };
  },
});

export default factory;
