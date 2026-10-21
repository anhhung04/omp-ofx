import type { CustomToolFactory } from "@oh-my-pi/pi-coding-agent";
import { clamp, runOfx, text } from "./_ofx";

/**
 * Cloud profiles, instances, and connectivity.
 *
 * Static VPS = profile with provider 'static' plus ssh-user/ssh-key (or
 * ssh-password). OFX reuses the host in place instead of provisioning.
 */
const factory: CustomToolFactory = (pi) => ({
  name: "ofx_cloud",
  label: "OFX Cloud",
  description:
    "Manage OFX cloud profiles and instances. Profiles: list/add/show/remove/default — a STATIC VPS is " +
    "profile_add with provider='static' + sshUser + sshKey/sshPassword + region set to the host IP. " +
    "Instances: list/create/destroy (create/destroy provision real infra — confirm with the user first). " +
    "providers lists available providers; test checks SSH/WinRM connectivity to a host.",
  parameters: pi.zod.object({
    action: pi.zod.enum([
      "profile_list",
      "profile_add",
      "profile_show",
      "profile_remove",
      "profile_default",
      "instance_list",
      "instance_create",
      "instance_destroy",
      "providers",
      "test",
    ]),
    name: pi.zod.string().optional().describe("Profile name (profile_* actions)"),
    provider: pi.zod
      .enum(["aws", "digitalocean", "static"])
      .optional()
      .describe("Cloud provider; 'static' = existing VPS/host"),
    region: pi.zod
      .string()
      .optional()
      .describe("Region/datacenter; for static profiles this is the host/IP"),
    size: pi.zod.string().optional().describe("Instance size/type (aws/do only)"),
    image: pi.zod.string().optional().describe("OS image (aws/do only)"),
    sshUser: pi.zod.string().optional().describe("SSH username"),
    sshKey: pi.zod.string().optional().describe("Path to SSH private key"),
    sshPassword: pi.zod.string().optional().describe("SSH password (prefer sshKey)"),
    connection: pi.zod.enum(["ssh", "winrm"]).optional(),
    makeDefault: pi.zod.boolean().optional().describe("Set profile as default after add"),
    profile: pi.zod.string().optional().describe("Existing profile to use for instance actions"),
    instanceId: pi.zod.string().optional().describe("Instance ID for destroy"),
    host: pi.zod.string().optional().describe("Host for connectivity test"),
    port: pi.zod.number().optional().describe("Port for connectivity test (default 22)"),
  }),

  async execute(_id, params, _onUpdate, _ctx, signal) {
    const args = buildArgs(params);
    if (typeof args === "string") return { content: text(args), isError: true };

    const res = await runOfx(pi.exec, args, { signal, cwd: pi.cwd, timeoutSec: 120 });
    const out = res.stdout + (res.stderr && res.code !== 0 ? `\n${res.stderr}` : "");
    if (res.code !== 0) {
      return {
        content: text(`ofx ${args.join(" ")} failed (exit ${res.code}):\n${clamp(out)}`),
        isError: true,
      };
    }
    return { content: text(clamp(res.stdout)), details: { action: params.action } };
  },
});

interface Params {
  action: string;
  name?: string;
  provider?: string;
  region?: string;
  size?: string;
  image?: string;
  sshUser?: string;
  sshKey?: string;
  sshPassword?: string;
  connection?: string;
  makeDefault?: boolean;
  profile?: string;
  instanceId?: string;
  host?: string;
  port?: number;
}

function buildArgs(p: Params): string[] | string {
  switch (p.action) {
    case "profile_list":
      return ["cloud", "profile", "list"];
    case "providers":
      return ["cloud", "providers"];
    case "profile_show":
      return p.name
        ? ["cloud", "profile", "show", p.name]
        : "profile_show requires name";
    case "profile_remove":
      return p.name
        ? ["cloud", "profile", "remove", p.name]
        : "profile_remove requires name";
    case "profile_default":
      return p.name
        ? ["cloud", "profile", "default", p.name]
        : "profile_default requires name";
    case "profile_add": {
      if (!p.name) return "profile_add requires name";
      if (!p.provider) return "profile_add requires provider";
      const args = ["cloud", "profile", "add", p.name, "-p", p.provider];
      if (p.region) args.push("-r", p.region);
      if (p.size) args.push("-s", p.size);
      if (p.image) args.push("-i", p.image);
      if (p.sshUser) args.push("--ssh-user", p.sshUser);
      if (p.sshKey) args.push("--ssh-key", p.sshKey);
      if (p.sshPassword) args.push("--ssh-password", p.sshPassword);
      if (p.connection) args.push("--connection", p.connection);
      if (p.makeDefault) args.push("--default");
      return args;
    }
    case "instance_list": {
      if (!p.provider && !p.profile) {
        return "instance_list requires provider or profile";
      }
      const args = ["cloud", "instance", "list"];
      if (p.profile) args.push("--profile", p.profile);
      else args.push("--provider", p.provider as string);
      return args;
    }
    case "instance_create": {
      const args = ["cloud", "instance", "create"];
      if (p.profile) args.push("--profile", p.profile);
      if (p.provider) args.push("-p", p.provider);
      if (p.region) args.push("-r", p.region);
      if (p.size) args.push("-s", p.size);
      if (p.image) args.push("-i", p.image);
      if (!p.profile && !p.provider) {
        return "instance_create requires profile or provider";
      }
      return args;
    }
    case "instance_destroy": {
      if (!p.instanceId) return "instance_destroy requires instanceId";
      const args = ["cloud", "instance", "destroy", p.instanceId, "--force"];
      if (p.profile) args.push("--profile", p.profile);
      else if (p.provider) args.push("--provider", p.provider);
      return args;
    }
    case "test": {
      if (!p.host) return "test requires host";
      const args = ["cloud", "test", p.host];
      if (p.port) args.push("-p", String(p.port));
      if (p.connection) args.push("-c", p.connection);
      return args;
    }
    default:
      return `unknown action '${p.action}'`;
  }
}

export default factory;
