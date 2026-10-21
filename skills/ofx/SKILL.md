---
name: ofx
description: Use when running red-team recon, scanning, or exploitation workflows, authoring OFX YAML workflows or modules, managing OFX config, or provisioning cloud instances/fleets/static VPS. Covers ofx flow run/list/validate, config edit, cloud profiles, fleets, sessions.
---

# OFX — Offensive Flow Executor

OFX is a YAML-driven red-team workflow engine installed on this machine. It runs jobs in
parallel with dependency chains, Jinja2 templating, and per-engagement output directories.

## Tool selection

| Task | Use |
|---|---|
| Run a builtin workflow (recon, vuln scan) | `ofx_flow_run` |
| Long-running scan (>5 min) | `ofx_flow_run` mode=submit, then poll `ofx_session` |
| Find the right workflow | `ofx_flow_search` or `ofx_flow_list` |
| Check required inputs before running | `ofx_flow_info` |
| Author/edit a workflow | write YAML (syntax below), then `ofx_flow_validate` |
| Find modules for a custom workflow | `ofx_modules` |
| Build a custom UDF module | `ofx_module_init` scaffold → verify |
| Change OFX settings | `ofx_config` |
| Add static VPS / cloud profile, test SSH | `ofx_cloud` |
| Distributed scan across instances | `ofx_fleet` |

Always run `ofx_flow_info <name>` before `ofx_flow_run` — it shows required inputs.

## Running workflows

```
ofx_flow_run workflow="external-recon" inputs={"target": "example.com"}
ofx_flow_run workflow="vuln/jwt-attack" inputs={"token": "eyJ..."}
ofx_flow_run workflow="recon/full-recon" inputs={"target": "10.10.10.5"} dryRun=true   # plan only
```

Required inputs missing → the run fails fast; fix inputs from `ofx_flow_info` output.

## Long scans: detached sessions

```
ofx_flow_run workflow="scan/port-scan" inputs={"target": "10.10.10.0/24"} mode="submit"
ofx_session action="list"                       # find session id
ofx_session action="logs" session="<id>"        # poll progress
ofx_session action="fetch" session="<id>"       # get results when completed
ofx_session action="cancel" session="<id>"      # stop it
```

## Builtin workflow catalog (40+)

- **recon/**: external-recon, full-recon, subdomain-brute, subdomain-enum-full, dns-enum,
  cloud-enum, osint-gather, js-analysis, url-archive, subdomain-takeover, zone-transfer
- **scan/**: host-discovery, port-scan, web-probe, waf-detect
- **vuln/**: vuln-scan (nuclei), web-scan (sqli/xss/ssti), api-scan, jwt-attack, cors-audit,
  graphql-audit, ssrf-scan, secret-scan, code-scan, container-scan, bug-bounty-pipeline
- **exploit/**: ad-attack, credential-attack, hash-crack, kerberoast, c2-setup, payload-gen
- **post/**: privesc, lateral-movement, credential-dump, persistence, exfil, opsec-cleanup, pivot
- **utility/**: parse-targets, extract-iocs, export-results
- **setup/**: cloud infra, docker lab, git guard, proxy

## Authoring workflows

Steps use exactly one of: `module`, `uses` (sub-workflow), or `pipe`.

```yaml
name: my-workflow
description: What it does
tags: [recon, custom]
dispatch:
  inputs:
    target: { required: true, type: string, description: Target host }
jobs:
  recon:
    name: Recon
    steps:
      - name: port-scan
        module: shell
        with:
          cmd: nmap -sV {{ inputs.target }} -oA {{ env.OFX_RUN_DIR }}/nmap
      - name: parse
        module: python
        with:
          script: |
            ports = {{ steps['port-scan'].outputs.stdout | tojson }}
            add_outputs(open_ports=[l for l in ports.splitlines() if "/open" in l])
      - name: sub
        uses: recon/subdomain-brute        # reusable workflow; needs call: contract in target
        with:
          target: "{{ inputs.target }}"
```

Rules that bite:

- Hyphenated step names need bracket access: `steps['port-scan']`, never `steps.port-scan`.
- Dict/list outputs into Python: `json.loads('{{ steps.x.outputs.header }}')` or
  `{{ steps.x.outputs.items | tojson }}` for inline literals.
- `uses:` targets must declare `call: inputs:` (and `call: outputs:`) or validation fails.
- Python steps have `add_outputs(**kwargs)`, `ctx.log(msg)`, `ctx.inputs`, `ctx.args` in scope.
- Shell-step stdout is auto-captured into `steps.<name>.outputs.stdout`.

Common step fields: `run_if`, `retry`, `retry-delay`, `continue-on-error`, `timeout`,
`log-stdout`, `log-command`.

Validate after every edit: `ofx_flow_validate workflow="<path>"`.

## Modules for steps

`ofx_modules action="list"` — full catalog. Kinds: `builtin` (shell, python),
`tool` (nmap, ffuf, dirsearch...), `library` (ofx.lib functions, e.g.
`c2.bash_reverse_shell`, `recon.targets.split_targets`), `remote` (GitHub-cached).
`ofx_modules action="info" module="c2.bash_reverse_shell"` shows required args.

## Config

`ofx_config` edits `~/.ofx/config.yml` directly (no ofx config CLI exists).
Secrets (token/key/password fields) are redacted in tool output — never print
them yourself; use `ofx_config action=set` to write without echoing.

```
ofx_config action="list"                              # whole config, redacted
ofx_config action="set" key="ai.model" value="gpt-4o"
ofx_config action="set" key="max_parallel_jobs" value="16"
```

## Cloud: profiles, instances, static VPS

`ofx_cloud` wraps `ofx cloud`. **A static VPS is a profile** — add one with:

```
ofx_cloud action="profile_add" name="my-vps" provider="static" region="203.0.113.10" sshUser="root" sshKey="~/.ssh/id_ed25519"
ofx_cloud action="test" host="203.0.113.10" port=22    # verify SSH first
ofx_cloud action="profile_default" name="my-vps"
```

Workflows then run on it via `ofx_flow_run ... mode=submit` with a cloud profile,
or fleet runs. `instance_create`/`instance_destroy` provision real cloud infra —
always confirm with the user before provisioning or destroying.

## Fleet (distributed scans)

```
ofx_fleet action="create" count=5 profile="do-small"
ofx_fleet action="run" workflow="scan/port-scan" targets="10.10.10.0/24" distribution="subnet"
ofx_fleet action="status" fleetGroup="<id>" refresh=true
ofx_fleet action="results" fleetGroup="<id>"
ofx_fleet action="destroy" fleetGroup="<id>"
```

## Building custom modules

```
ofx_module_init action="scaffold" path="my_module.py" description="C2 stager"
ofx_module_init action="verify" path="my_module.py"   # smoke-runs it via a throwaway workflow
```

Reference: `module: my_module.py::run`. The UDF gets `ctx.inputs` (the `with:` args),
`ctx.add_outputs(**kw)`, `ctx.log(msg)`; return a dict or None, raise to fail.

## Safety

Only run workflows against targets the user has explicitly authorized for testing.
Prefer `dryRun=true` to preview execution plans before firing active scans.
Fleet/instance creation and destruction cost real money — confirm before running.
