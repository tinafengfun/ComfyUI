# Artifact bundle index

This folder now treats artifacts in two groups:

1. **workflow bundles**: one canonical package per migrated workflow
2. **package bundles**: one canonical package per migrated custom-node repository

The goal is to avoid publishing the same workflow as multiple standalone “deliveries”.

## Canonical bundles

| Scope | Canonical location | What it is |
| --- | --- | --- |
| DaSiWa WAN2.2 single/double/triple-image video workflow | `dasiwa-delivery/` | the canonical workflow delivery bundle: fresh deployment, GUI validation, workflow copies, prompts, logs, acceptance path |
| Mixlab package migration | `mixlab/` | the canonical package-level migration evidence bundle for `comfyui-mixlab-nodes` |
| WanVideoWrapper package migration | `wan/` | the canonical package-level migration evidence bundle for `ComfyUI-WanVideoWrapper` |

## Supporting evidence bundles

These directories are still retained because they contain raw evidence, but they are **not separate primary deliveries**.

| Directory | Belongs to | Keep it for |
| --- | --- | --- |
| `dasiwa-delivery/phase-02-b70-engineering/` | DaSiWa WAN2.2 workflow | phase-02 engineering-side smoke/full-size evidence, telemetry, and blocked-case records |
| `dasiwa-delivery/phase-01-original-remote-tuning/` | DaSiWa WAN2.2 workflow | phase-01 isolated remote smoke and performance-tuning evidence |
| `dasiwa-final-run/` | older Dasiwa tuning case | media-only outputs referenced by the reusable tuning writeup; not a standalone delivery package |

## How to read this folder now

### If you need the customer-deliverable workflow package

Read:

- `dasiwa-delivery/dasiwa-wan22-delivery.md`

Use `dasiwa-delivery/phase-02-b70-engineering/` and `dasiwa-delivery/phase-01-original-remote-tuning/` only when you need extra raw evidence behind that same workflow.

### If you need engineering evidence for the DaSiWa workflow

Read in this order:

1. `dasiwa-delivery/dasiwa-wan22-delivery.md`
2. `dasiwa-delivery/phase-02-b70-engineering/README.md`
3. `dasiwa-delivery/phase-01-original-remote-tuning/README.md`

### If you need package-migration evidence

Read:

- `mixlab/README.md`
- `wan/README.md`

Those are package-centric bundles, not workflow bundles.
