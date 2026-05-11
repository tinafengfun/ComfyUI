# Draft Intel XPU workflow migration flow

This draft turns the previous migration work and existing docs into a reusable operating flow for ComfyUI workflow migration to Intel XPU.

## Evidence sources

This flow merges:

1. **Process reflection**: Dasiwa workflow migration, B60/B70 validation, Mixlab package migration, Wan package bootstrap, GUI delivery, OOM diagnosis, and artifact cleanup.
2. **Existing docs**: workflow migration prompt/skill, asset prep, deployment, tuning, review prompt, release standard, migration checklist, node-package standards, support matrices, gap reports, and delivery artifacts.

## Result classes

Every workflow, branch, or node family must end in one of these classes:

| Class | Meaning |
| --- | --- |
| Intel-XPU migrated | Native XPU execution is retained with evidence. |
| CPU fallback | Usable path exists, but meaningful compute remains on CPU. |
| Environment / integration gap | Packaging, provider, codec, service, asset, or deployment wiring blocks validation. |
| Feature-development gap | CUDA-shaped architecture or unsupported backend requires real feature work. |
| Capacity hard stop | Target fidelity exceeds the intended hardware budget after reasonable mitigation. |

## Operating flow

| Step | Goal | Outputs | Hard stop |
| --- | --- | --- | --- |
| 1. Feasibility analysis | Route the task before code changes. | Feasibility report, target budget, initial risk class. | Target requirement is not a ComfyUI workflow migration, or required fidelity already exceeds available hardware. |
| 2. Workflow inventory | Understand graph shape, branches, outputs, and critical paths. | Topology inventory, branch map, executable-node list. | Graph cannot be represented or output branches are unclear. |
| 3. Asset and custom-node prep | Resolve models, LoRAs, input media, custom nodes, nested repos. | Asset ledger, custom-node ledger, missing/proprietary list. | Required source-identical asset is unavailable and no approved smoke-only alias is acceptable. |
| 4. Source audit | Verify XPU risk from source. | Risk matrix, patch class, fallback/blocker classification. | Critical path depends on CUDA-only kernels or `.cuda()` architecture with no safe fallback. |
| 5. Environment deployment | Build reproducible Intel XPU baseline. | Launch command, environment baseline, startup/registration evidence. | Environment cannot install, import, or register required nodes. |
| 6. Prompt conversion validation | Prove the API prompt is complete before runtime claims. | Converted prompt, raw `/prompt` response, `node_errors` review. | Intended output node is missing, pruned, or blocked by validation errors. |
| 7. Branch smoke validation | Prove branch reachability cheaply. | Branch prompt, history, logs, generated media, node evidence. | Critical branch cannot produce a faithful smoke output. |
| 8. Full validation and capacity | Test full or highest-fidelity path and classify failures. | Full-run evidence, failure point, memory math, result class. | Runtime and theoretical memory both exceed target budget. |
| 9. Performance tuning | Improve a proven path with controlled measurement. | Baseline, candidate matrix, winner, regressions, telemetry. | Candidate tuning cannot beat baseline or root cause is capacity. |
| 10. Coverage review | Audit whether every executable node is covered by evidence. | Coverage table, uncovered nodes, final support statement. | Any executable node lacks full-run, branch-smoke, or explicit gap evidence. |
| 11. Delivery packaging | Produce customer/engineering handoff. | Patches, deployment guide, evidence bundle, acceptance steps. | Package cannot reproduce the claimed result. |

## Cross-step constraints

1. Do not remove, bypass, collapse, or replace workflow nodes to create a fake success.
2. Do not trust `execution_success` without reviewing `node_errors`, intended output nodes, and actual output files.
3. Do not claim source fidelity from a compatibility alias.
4. Do not generalize one branch success to the whole workflow.
5. Do not keep tuning after runtime and theoretical evidence prove a capacity hard stop.
6. Do not call engineering smoke customer-ready without GUI or end-user validation evidence.

## Lessons embedded from prior migrations

1. Dasiwa showed that workflow topology and branch isolation must come before full-run claims.
2. Dasiwa prompt export failures showed that widget-only inputs and selector-backed names must be audited explicitly.
3. Dasiwa full-size branch `54` showed that repeated low-vram experiments are not useful after capacity is proven structurally.
4. Dasiwa delivery showed that customer validation needs preserved workflow copies, GUI steps, generated outputs, and acceptance wording.
5. Mixlab showed that package import success is not repo-wide support; support must be per family.
6. Wan showed that bootstrap/registration evidence is its own milestone before runtime smoke.
7. Artifact cleanup showed that delivery docs must avoid duplicate competing entrypoints for the same workflow.

## Prompt and skill mapping

Use the matching prompt to ask an AI agent to perform a step. Use the matching skill as the reusable method reference while executing that step.
