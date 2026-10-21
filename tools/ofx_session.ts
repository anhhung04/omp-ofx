import type { CustomToolFactory } from "@oh-my-pi/pi-coding-agent";
import { clamp, runOfx, text } from "./_ofx";

/** Manage detached OFX sessions (long-running background workflow executions). */
const factory: CustomToolFactory = (pi) => ({
  name: "ofx_session",
  label: "OFX Session",
  description:
    "Manage detached OFX workflow sessions. Actions: list (all sessions), status (one session), logs (tail session log), fetch (download results), cancel (kill running session). " +
    "Use after ofx_flow_run mode='submit' to poll long-running scans.",
  parameters: pi.zod.object({
    action: pi.zod
      .enum(["list", "status", "logs", "fetch", "cancel"])
      .describe("Session operation"),
    session: pi.zod
      .string()
      .optional()
      .describe("Session id or name (required for status/logs/fetch/cancel)"),
    statusFilter: pi.zod
      .string()
      .optional()
      .describe("For list: filter by status (running/completed/failed)"),
    tailLines: pi.zod
      .number()
      .optional()
      .describe("For logs: number of trailing lines (default 100)"),
  }),

  async execute(_id, params, _onUpdate, _ctx, signal) {
    const { action, session, statusFilter, tailLines = 100 } = params;
    let args: string[];
    switch (action) {
      case "list":
        args = ["session", "list"];
        if (statusFilter) args.push("-s", statusFilter);
        break;
      case "status":
      case "fetch":
      case "cancel":
        if (!session) {
          return { content: text(`action '${action}' requires 'session'`), isError: true };
        }
        args = ["session", action, session];
        break;
      case "logs":
        if (!session) {
          return { content: text("action 'logs' requires 'session'"), isError: true };
        }
        args = ["session", "logs", session, "-n", String(tailLines)];
        break;
    }
    const res = await runOfx(pi.exec, args, { signal, cwd: pi.cwd, timeoutSec: 60 });
    if (res.code !== 0) {
      return {
        content: text(`ofx session ${action} failed (exit ${res.code}):\n${clamp(res.stderr || res.stdout)}`),
        isError: true,
      };
    }
    return {
      content: text(clamp(res.stdout)),
      details: { action, session },
    };
  },
});

export default factory;
