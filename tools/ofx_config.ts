import type { CustomToolFactory } from "@oh-my-pi/pi-coding-agent";
import {
  clamp,
  deletePath,
  getPath,
  readYamlConfig,
  redactSecrets,
  setPath,
  text,
  writeYamlConfig,
} from "./_ofx";

declare const Bun: { YAML: { stringify(v: unknown): string } };

/**
 * Read and modify the OFX configuration file (~/.ofx/config.yml).
 *
 * Direct YAML edit is required because OFX exposes no config CLI. Values are
 * shown with secret-looking keys (token/key/secret/password) redacted.
 */
const factory: CustomToolFactory = (pi) => ({
  name: "ofx_config",
  label: "OFX Config",
  description:
    "Read or modify OFX settings in ~/.ofx/config.yml. Actions: list (whole config, secrets redacted), " +
    "get (one dotted key like 'ai.model'), set (dotted key + value), unset. " +
    "Known keys: ai.model, ai.api_key, ai.base_url, max_parallel_jobs, max_output_size, " +
    "default_remote_registry, credential_db_path, credential_key_path, debug, auto_store_creds.",
  parameters: pi.zod.object({
    action: pi.zod.enum(["list", "get", "set", "unset"]).describe("Config operation"),
    key: pi.zod
      .string()
      .optional()
      .describe("Dotted key path, e.g. 'ai.model' (required for get/set/unset)"),
    value: pi.zod
      .string()
      .optional()
      .describe("New value for set (scalars; 'true'/'false'/numbers parsed)"),
  }),

  async execute(_id, params, _onUpdate, _ctx, _signal) {
    const file = `${process.env.OFX_HOME?.trim() || `${process.env.HOME}/.ofx`}/config.yml`;
    const config = await readYamlConfig(file);

    switch (params.action) {
      case "list": {
        const redacted = redactSecrets(config);
        return {
          content: text(`${file}:\n${clamp(Bun.YAML.stringify(redacted))}`),
          details: { keys: Object.keys(config).sort() },
        };
      }
      case "get": {
        if (!params.key) return { content: text("'get' requires key"), isError: true };
        const value = redactSecrets(getPath(config, params.key), params.key);
        if (value === undefined) {
          return {
            content: text(`Key '${params.key}' not set in ${file}`),
            isError: true,
          };
        }
        return {
          content: text(`${params.key} = ${typeof value === "object" ? Bun.YAML.stringify(value) : String(value)}`),
          details: { key: params.key },
        };
      }
      case "set": {
        if (!params.key) return { content: text("'set' requires key"), isError: true };
        if (params.value === undefined) {
          return { content: text("'set' requires value"), isError: true };
        }
        const parsed = parseScalar(params.value);
        setPath(config, params.key, parsed);
        await writeYamlConfig(file, config);
        const shown = redactSecrets(parsed, params.key);
        return {
          content: text(`Set ${params.key} = ${JSON.stringify(shown)} in ${file}`),
          details: { key: params.key, changed: true },
        };
      }
      case "unset": {
        if (!params.key) return { content: text("'unset' requires key"), isError: true };
        if (!deletePath(config, params.key)) {
          return {
            content: text(`Key '${params.key}' not present in ${file}`),
            isError: true,
          };
        }
        await writeYamlConfig(file, config);
        return {
          content: text(`Removed ${params.key} from ${file}`),
          details: { key: params.key, changed: true },
        };
      }
    }
  },
});

function parseScalar(raw: string): unknown {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw !== "" && !Number.isNaN(Number(raw))) return Number(raw);
  return raw;
}

export default factory;
