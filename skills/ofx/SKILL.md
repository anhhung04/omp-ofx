---
name: ofx
description: Use when running red-team recon, scanning, or exploitation workflows, or when authoring OFX YAML workflows. Teaches ofx flow run/list/validate/search, module syntax, templating, detached sessions, and builtin workflow catalog.
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

## Safety

Only run workflows against targets the user has explicitly authorized for testing.
Prefer `dryRun=true` to preview execution plans before firing active scans.
