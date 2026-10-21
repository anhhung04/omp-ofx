import type { CustomToolFactory } from "@oh-my-pi/pi-coding-agent";
import { clamp, runOfx, text } from "./_ofx";

/** List available OFX workflows (builtin collections and local). */
const factory: CustomToolFactory = (pi) => ({
  name: "ofx_flow_list",
  label: "OFX Flow List",
  description:
    "List OFX workflows. By default lists all; filter by collection (recon/scan/vuln/exploit/post/utility/setup), tag, or search keyword. Returns workflow names usable with ofx_flow_run.",
  parameters: pi.zod.object({
    collection: pi.zod
      .string()
      .optional()
      .describe("Filter to a collection: recon, scan, vuln, exploit, post, utility, setup"),
    tag: pi.zod.string().optional().describe("Filter by tag"),
    search: pi.zod.string().optional().describe("Search by name/description/tag keyword"),
  }),

  async execute(_id, params, _onUpdate, _ctx, signal) {
    const args = ["flow", "list"];
    if (params.collection) args.push("-c", params.collection);
    if (params.tag) args.push("-t", params.tag);
    if (params.search) args.push("-s", params.search);
    const res = await runOfx(pi.exec, args, { signal, cwd: pi.cwd, timeoutSec: 30 });
    if (res.code !== 0) {
      return {
        content: text(`ofx flow list failed (exit ${res.code}):\n${clamp(res.stderr || res.stdout)}`),
        isError: true,
      };
    }
    return { content: text(clamp(res.stdout)), details: {} };
  },
});

export default factory;
