# omp-ofx

OMP plugin integrating the [OFX](https://github.com/anhhung04/ofx) red-team workflow
engine into the OMP agent.

## What it adds

**Tools** (LLM-callable):

| Tool | Purpose |
|---|---|
| `ofx_flow_run` | Run workflows synchronously or submit detached sessions |
| `ofx_flow_list` | List builtin/local workflows (collection, tag, search filters) |
| `ofx_flow_search` | Keyword search across the builtin catalog |
| `ofx_flow_info` | Show workflow inputs/outputs before running |
| `ofx_flow_validate` | Validate workflow YAML after authoring |
| `ofx_session` | Poll/control detached sessions (list/status/logs/fetch/cancel) |
| `ofx_modules` | Browse step-module catalog (builtins, tools, library, remotes) |
| `ofx_config` | Read/modify `~/.ofx/config.yml` (secrets redacted in output) |
| `ofx_cloud` | Profiles (incl. static VPS), instances, providers, SSH connectivity test |
| `ofx_fleet` | Multi-instance fleets: create, distributed run, status, results, cancel, destroy |
| `ofx_module_init` | Scaffold + smoke-verify user-defined Python modules (UDFs) |

**Skill** `ofx` — workflow syntax, tool-selection heuristics, catalog overview, cloud/fleet
flows, and the templating pitfalls that actually break runs (hyphenated step names,
`tojson` parsing, `call:` contracts for sub-workflows).

## Install

```bash
omp plugin install github:anhhung04/omp-ofx   # private repo: auth via gh/git credentials
```

or link a local checkout:

```bash
omp plugin link /path/to/omp-ofx
```

## Prerequisites

`ofx` must be runnable. Resolution order:

1. `OFX_BIN` — full command, e.g. `OFX_BIN="uv run --project ~/workspace/ofx ofx"`
2. `ofx` on `PATH` (`uv tool install ofx` or `pip install ofx`)
3. `OFX_REPO` — path to an ofx checkout, runs via `uv run --project $OFX_REPO ofx`

## Usage

Ask the agent things like:

- "run external-recon against example.com"
- "find a workflow for JWT attacks and run it with this token"
- "write a workflow that brute-forces subdomains then probes them with httpx"
- "submit a full port scan of 10.10.10.0/24 in the background and check on it later"

## Safety

Tools execute real offensive-security workflows. Runs are gated by OMP's normal tool
approval; only authorize against in-scope targets.

## License

Source Available — same terms as [OFX](https://github.com/anhhung04/ofx/blob/master/LICENSE): no commercial use; modifications must be distributed via public fork. See [LICENSE](LICENSE).
