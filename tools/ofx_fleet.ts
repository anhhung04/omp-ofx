import type { CustomToolFactory } from "@oh-my-pi/pi-coding-agent";
import { clamp, runOfx, splitKV, text } from "./_ofx";

/**
 * Fleet operations: multi-instance distributed workflow runs.
 */
const factory: CustomToolFactory = (pi) => ({
  name: "ofx_fleet",
  label: "OFX Fleet",
  description:
    "Manage OFX cloud fleets — groups of instances running one workflow with distributed targets. " +
    "create provisions N instances (confirm with user: real cloud spend); run submits a workflow across the fleet " +
    "with target distribution (chunk/round-robin/subnet/line); status/results/cancel operate on a fleet group ID; " +
    "destroy removes instances by tag (pass fleetGroup) or name prefix. " +
    "Typical flow: create -> run -> status (poll) -> results -> destroy.",
  parameters: pi.zod.object({
    action: pi.zod.enum(["create", "run", "status", "results", "cancel", "destroy"]),
    count: pi.zod.number().optional().describe("Instances to create (create) or use (run, 0=auto)"),
    profile: pi.zod.string().optional().describe("Cloud profile to provision from"),
    prefix: pi.zod.string().optional().describe("Instance name prefix (default ofx-fleet)"),
    workflow: pi.zod.string().optional().describe("Workflow for fleet run"),
    targets: pi.zod
      .string()
      .optional()
      .describe("Targets for fleet run: file path, CIDR, or comma-separated IPs"),
    distribution: pi.zod
      .enum(["chunk", "round-robin", "subnet", "line"])
      .optional()
      .describe("Target distribution mode (default chunk)"),
    inputs: pi.zod.record(pi.zod.string()).optional().describe("Extra workflow inputs"),
    targetVar: pi.zod
      .string()
      .optional()
      .describe("Workflow input variable receiving the per-instance target chunk file (default targets_file)"),
    installTools: pi.zod
      .boolean()
      .optional()
      .describe("Auto-install missing workflow tools on each instance"),
    fleetGroup: pi.zod
      .string()
      .optional()
      .describe("Fleet group ID (status/results/cancel/destroy)"),
    refresh: pi.zod.boolean().optional().describe("Probe running sessions for live status"),
  }),

  async execute(_id, params, onUpdate, _ctx, signal) {
    const p = params;
    let args: string[];
    let timeoutSec = 180;

    switch (p.action) {
      case "create": {
        if (!p.count || p.count < 1) return { content: text("create requires count >= 1"), isError: true };
        args = ["cloud", "fleet", "create", String(p.count)];
        if (p.profile) args.push("--profile", p.profile);
        if (p.prefix) args.push("--prefix", p.prefix);
        timeoutSec = 600; // provisioning takes minutes
        break;
      }
      case "run": {
        if (!p.workflow) return { content: text("run requires workflow"), isError: true };
        if (!p.targets) return { content: text("run requires targets"), isError: true };
        args = ["cloud", "fleet", "run", p.workflow, "-t", p.targets];
        if (p.count) args.push("-n", String(p.count));
        if (p.profile) args.push("--profile", p.profile);
        if (p.distribution) args.push("-d", p.distribution);
        if (p.targetVar) args.push("--target-var", p.targetVar);
        if (p.installTools) args.push("--install-tools");
        args.push(...splitKV(p.inputs ?? {}));
        timeoutSec = 600;
        break;
      }
      case "status": {
        if (!p.fleetGroup) return { content: text("status requires fleetGroup"), isError: true };
        args = ["cloud", "fleet", "status", p.fleetGroup];
        if (p.refresh) args.push("--refresh");
        break;
      }
      case "results": {
        if (!p.fleetGroup) return { content: text("results requires fleetGroup"), isError: true };
        args = ["cloud", "fleet", "results", p.fleetGroup];
        timeoutSec = 300;
        break;
      }
      case "cancel": {
        if (!p.fleetGroup) return { content: text("cancel requires fleetGroup"), isError: true };
        args = ["cloud", "fleet", "cancel", p.fleetGroup, "--force"];
        break;
      }
      case "destroy": {
        // destroy selects by tag or name prefix, not fleet group id
        if (!p.fleetGroup && !p.prefix) {
          return { content: text("destroy requires fleetGroup (used as tag) or prefix"), isError: true };
        }
        args = ["cloud", "fleet", "destroy", "--force"];
        if (p.fleetGroup) args.push("--tag", p.fleetGroup);
        if (p.prefix) args.push("--prefix", p.prefix);
        if (p.profile) args.push("--profile", p.profile);
        timeoutSec = 300;
        break;
      }
      default:
        return { content: text(`unknown action '${p.action}'`), isError: true };
    }

    onUpdate?.({ content: text(`ofx ${args.join(" ")} ...`) });
    const res = await runOfx(pi.exec, args, { signal, cwd: pi.cwd, timeoutSec });
    const out = res.stdout + (res.stderr && res.code !== 0 ? `\n${res.stderr}` : "");
    if (res.code !== 0) {
      return {
        content: text(`ofx ${args.join(" ")} failed (exit ${res.code}):\n${clamp(out)}`),
        isError: true,
      };
    }
    return { content: text(clamp(res.stdout)), details: { action: p.action } };
  },
});

export default factory;
