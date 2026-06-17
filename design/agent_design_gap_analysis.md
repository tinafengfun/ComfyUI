# ComfyUI migration agent: current design analysis and gaps

task_id: `5d2e2cbc-8bb8-4ba4-a4fc-832d13e413f9`

workflow: `cartoon/Qwen-Image-2512-4步-20260320-william-单参考图.json`

workspace: `demo/workspaces/5d2e2cbc-8bb8-4ba4-a4fc-832d13e413f9`

## 1. Executive conclusion

The current agent is **evidence-capable** but not yet **durable, recoverable, or contract-driven** enough for a ComfyUI migration workflow.

The backend run from Step 00 through Step 11 proved that the system can create useful artifacts, run ComfyUI on Intel XPU, preserve no-bypass/source-identical claims, and reach human gates. It also proved that the current implementation cannot be modeled as "12 linear Copilot SDK calls." The real system needs a durable DAG scheduler, typed step contracts, structured cross-step memory, sub-run state, human decision state, artifact freshness checks, and bounded SDK/report finalization.

The most important design correction is:

> Do not use one shared long-lived SDK/conversation session as cross-step memory. Use short-lived per-step or per-subjob agent sessions, persist their captures for audit, and pass cross-step context through application-owned structured memory, artifact index, human decision ledger, and a compiled `StepContextBundle`.

## 2. Evidence base

Primary local evidence:

- `design_rec.md`
- `session_design.md`
- `demo/workspaces/5d2e2cbc-8bb8-4ba4-a4fc-832d13e413f9/artifacts/backend-agent-observation.md`
- Step artifacts from `00-intake-preflight.md` through `11-delivery.md`
- Runtime artifacts from Step 07 and Step 08
- `artifacts/sdk-sessions/11-2026-05-15T143119516Z.*`
- `artifacts/sdk-sessions/11-2026-05-15T144141308Z.*`
- Current backend surfaces:
  - `demo/src/server/orchestrator.ts`
  - `demo/src/server/artifactCompletion.ts`
  - `demo/src/server/state.ts`
  - `demo/src/server/promptSkillCompiler.ts`
  - `demo/src/server/copilotSdkRunner.ts`
  - `demo/src/server/workflowLoader.ts`

External design references used as comparison patterns:

- Copilot SDK sessions and permission/event model
- Claude Code CLI: project memory, scoped settings, plan mode, subagents
- OpenCode: Plan/Build modes, project `AGENTS.md`, agent configs and permissions
- OpenHands: SDK/CLI/GUI/runtime split, sandboxed long-running software-agent state
- SWE-agent / mini-SWE-agent: action-observation loop, trajectory persistence, SWE-bench discipline
- Aider: repo-map context selection, git/diff boundaries, lint/test repair loop
- AutoGPT: workflow blocks, frontend/server split, permissions, agent protocol and benchmark components
- CrewAI / AutoGen: role/task/team orchestration and executor separation
- LangGraph / Temporal: durable checkpoints, event history, replay, human-in-loop recovery, idempotent side effects

These references are design patterns only. They are not evidence that the migration agent should adopt any one framework wholesale.

## 3. Step-by-step reflection: Step 00-11

| Step | Intended role | Real execution path | Dependencies consumed | Outputs produced | Downstream consumers | Blockers / bugs | Required shared memory |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 00 Intake/preflight | Capture workflow, dependency-source preflight, initial hard stops | Deterministic preflight completed; source search/download deferred to Step 01 | Source workflow, configured model roots, ComfyUI root | `00-intake-preflight.md` | Step 01, Step 02, human gate decisions | It correctly did not solve deep asset resolution; downstream must not assume Step 00 closed all gaps | Workflow identity, source path, expected model/custom-node hints, preflight blockers |
| 01 Asset/custom-node resolution | Resolve model files, input media, custom-node source hints | Deterministic ledgers generated; initially reported gaps; later fixed resolver for backslash/subdirectory model paths | Step 00, local `/home/intel/hf_models`, ComfyUI model/input directories | `01-assets.csv`, `01-custom-nodes.md` | Step 02, Step 04, Step 05, Step 06 repair loop | Resolver initially indexed basenames only and missed values like `Qwen_Image\qwen-image-2512-Q6_K.gguf` | Structured asset ledger with requested value, normalized path, basename, source-identical status, staged path, checksum/freshness |
| 02 Feasibility | Summarize migration feasibility and hard stops | Deterministic feasibility artifact created, but under-consumed Step 01 evidence in the initial run | Step 00, Step 01 ledgers | `02-feasibility.md` | Step 03, human planning | Gap: prompt/skill context listed artifacts, but no enforced parser or memory contract forced Step 02 to reflect asset gaps | Feasibility status derived from typed asset/custom-node memory, not free-form Markdown reading |
| 03 Workflow inventory | Inventory workflow nodes, links, outputs, active/disconnected branches | Deterministic inventory completed | Step 00-02 artifacts, workflow JSON | `03-inventory.md` | Step 04 source audit, Step 06 prompt conversion, Step 10 coverage | Good deterministic behavior, but inventory is still Markdown rather than canonical graph JSON | Node/link graph, active output branches, disconnected nodes, node class mapping, output claim boundary |
| 04 Source audit | Audit custom-node source risks and XPU/CUDA assumptions | Real SDK session produced detailed source audit and a hard stop/continuation record | Step 01 custom nodes/assets, Step 03 inventory, ComfyUI/custom-node source | `04-source-audit.md` | Step 05 environment, Step 06 policy, patch/package notes | Step needed human-approved continuation under documented risk; source audit scope must stay bounded to active critical nodes | Source risk registry: package, node classes, risk type, active branch impact, mitigation status, human decision |
| 05 Environment deployment | Register/prepare environment without semantic bypass | Correctly gated when Step 01 still had source-identical asset gaps; after assets were staged, environment could proceed | Step 01 ledgers, Step 04 audit, ComfyUI env | `05-environment.md`, `05-human-context.md` | Step 06 prompt validation | Valid gate, not false failure. But gate status was mostly artifact/prose rather than typed dependency state | Environment readiness, missing package/source decisions, no-bypass policy, staged asset status |
| 06 Prompt conversion validation | Convert workflow to API prompt and validate through ComfyUI | SDK converted prompt; offline validation initially failed due missing staged assets; after asset resolver fix and asset staging, validation passed for output `60` | Step 03 inventory, Step 05 environment, workflow JSON, asset ledger | `06-prompt.json`, `06-prompt.raw-converter.json`, `06-raw-validation-response.json`, `06-prompt-validation.json` | Step 07 branch smoke, Step 08 full validation, Step 10 coverage | Exposed missing DAG edge: Step 06 validation errors must trigger targeted Step 01 asset jobs, then rerun Step 06 | Prompt validation memory: validated outputs, node errors, missing assets/images, forbidden next step, allowed next step |
| 07 Branch smoke | Execute critical output branch with no semantic shortcuts | First SDK/session attempt failed at auth/provider setup; retry succeeded. Branch `qwen-image-saveimage` ran on XPU and produced PNG evidence | Step 06 validated prompt, runtime endpoint, staged assets | `07-qwen-image-saveimage-smoke.*`, `07-first-stage-smoke.md` | Step 08, Step 10 | Need child run attempts; first failure was SDK/session setup, not workflow/runtime failure | Branch run table: branch id, output node, prompt id, request/history/log/output, run status, attempt status |
| 08 Full validation/capacity | Run full prompt and collect runtime/capacity evidence | Runtime succeeded, but SDK report finalization initially timed out after `apply_patch` progress; evidence proved validation success | Step 06 prompt, Step 07 smoke evidence, ComfyUI runtime | `08-full-validation.*`, `08-output-qwen_00001_.png` | Step 09, Step 10, Step 11 | Single step status collapsed runtime success and SDK/report timeout. This made a report-finalization problem look like validation failure | Runtime run memory: prompt id, HTTP status, history status, executed nodes, cached nodes, output integrity, telemetry, capacity |
| 09 Performance tuning | Decide whether tuning variants are safe/needed | Completed from recovered evidence artifact; no tuning variant applied because baseline was source-identical and passed | Step 08 baseline/capacity | `09-tuning.md` | Step 11 | Report-only step overused free-form SDK despite enough structured evidence | Tuning decision memory: baseline status, candidate changes, accepted/rejected reason, fidelity impact |
| 10 Coverage review | Confirm coverage of active graph and claim boundary | Completed from evidence artifact; confirmed all active linked nodes for output `60` covered; disconnected nodes out of claim boundary | Step 03, Step 06, Step 07, Step 08 | `10-coverage-review.md` | Step 11 | Same report-finalization weakness; should be deterministic synthesis from structured coverage inputs | Coverage memory: active nodes, validated nodes, disconnected nodes, unsupported areas, claim boundary |
| 11 Delivery packaging | Package evidence, patches, result report, and human gate | Initial recovered `11-delivery.md` was not proof. Forced rerun generated only an `in_progress` scaffold and stalled. SDK session capture found blocked `apply_patch` write permission and cleanup blocking. After fixes, real Step 11 artifacts were generated and human gate reached. | Step 08, Step 09, Step 10, workflow source copy, patch diff artifact | Real final `11-delivery.md`, `migration-result-report.md`, `11-patches/README.md`, `11-workflow-source-copy.json`, SDK session captures | Step 12 GUI acceptance and human review | Recovered artifact was not valid completion evidence. Required artifact existence was too weak. Permission and cleanup were not represented as scheduler state. | Delivery package memory: claim boundary, final artifacts, patch applicability, human gate status, SDK run capture, freshness/run id |

## 4. Cross-step DAGs observed

The UI can keep a simple 00-12 product flow, but the backend must model several DAGs.

### 4.1 Product DAG

```text
00 -> 01 -> 02 -> 03 -> 04 -> 05 -> 06 -> 07 -> 08 -> 09 -> 10 -> 11 -> 12
```

This is the user-facing sequence. It is not sufficient as the execution graph.

### 4.2 Asset acquisition and repair DAG

```text
00 dependency hints
  -> 01 asset/custom-node ledgers
  -> 05 environment gate
  -> 06 validation
  -> validation-derived missing asset jobs
  -> targeted 01 child jobs
  -> refreshed asset ledger
  -> rerun 06
```

The discovered `06 -> 01 -> 06` edge is not a bypass. It is a required evidence-driven repair loop.

### 4.3 Source / patch / test DAG

```text
01 custom-node source hints
  -> 03 active node inventory
  -> 04 source audit
  -> 05 registration/environment
  -> 06 prompt validation
  -> 07/08 runtime validation
  -> 11 package patches only with claim boundary
```

Patch artifacts must distinguish "generated package material" from "applied during validated run." In this run, validation passed without applying the Step 11 patch.

### 4.4 Branch validation DAG

```text
06 validated prompt
  -> 07 branch smoke child run(s)
  -> 08 full validation and capacity
```

Each branch smoke should have its own run attempt records, prompt, request, history, runtime log, output evidence, and failure reason.

### 4.5 Evidence / report DAG

```text
08 baseline evidence -> 09 tuning decision
03 + 06 + 07 + 08 -> 10 coverage review
08 + 09 + 10 -> 11 delivery package
```

Steps 09-11 should prefer deterministic synthesis from existing evidence. SDK sessions may assist with missing analysis or wording, but only under strict output contracts and short no-artifact-progress limits.

### 4.6 Human decision DAG

```text
gate event -> persisted question -> user decision -> typed decision ledger
  -> resume active session if still alive
  -> otherwise recompile StepContextBundle and start a new bounded run
```

Human decisions are not chat text. They are durable, auditable state that unlocks or rejects specific transitions.

### 4.7 Recovery DAG

```text
server restart / SDK timeout
  -> mark stale sdk run terminated
  -> inspect typed artifacts and run states
  -> complete only if schema/freshness/evidence gates pass
  -> otherwise retry or request human decision
```

This directly addresses the Step 11 recovered-artifact problem.

## 5. Current implementation gaps

### 5.1 Step state is too coarse

`state.ts` stores one status per step: pending/running/completed/waiting/failed/terminated. This collapsed different truths:

- SDK session status
- permission request status
- runtime run status
- artifact/report finalization status
- evidence gate status
- human gate status

Step 08 showed runtime success but SDK report-finalization failure. Step 11 showed SDK/report stall while artifact scaffold existed. These must not be represented as one step-level truth.

### 5.2 Artifact completion is still mostly existence-based

`artifactCompletion.ts` improved by rejecting `orchestrator_status: in_progress`, but it still largely treats readable non-empty files as completion. This is not enough.

Required completion checks need per-step schemas:

- `06-prompt-validation.json`: `prompt_validation_passed == true`, intended output present, no blockers
- Step 07: runtime history success, output exists, PNG integrity, executed expected nodes
- Step 08: full validation success, output integrity, telemetry/capacity recorded
- Step 11: `orchestrator_status: human_gate_reached` or `complete`, references Step 08/10 evidence, current run id or explicitly reusable evidence, not backup/recovered-only

### 5.3 No structured memory contract

`promptSkillCompiler.ts` passes `priorArtifacts`, recommended artifact names, and prose instructions. That helps, but it does not force the agent or deterministic steps to export typed memory.

Example failure: Step 02 under-reported Step 01 gaps because downstream consumption was not enforced by a structured asset memory contract.

### 5.4 StepJob is not a full StepContextBundle

The current StepJob includes:

- paths
- artifact lists
- prompt/skill text
- constraints
- human gates
- hard stop rules

It does not include:

- typed dependency state
- parsed asset ledger
- parsed validation state
- human decision ledger
- artifact freshness/run id
- allowed and forbidden transitions
- current retry/subjob state
- per-step completion schema

### 5.5 Linear auto-run hides real DAG edges

`runUntilGate` selects the next incomplete top-level step. This cannot represent:

- Step 06 validation-derived asset jobs
- multiple Step 07 branch child runs
- report-finalization retries after durable runtime success
- human decision resume with stale SDK sessions
- independent report DAG nodes after Step 08 evidence exists

### 5.6 SDK session capture was originally insufficient

The Step 11 investigation proved that raw event count and streaming deltas are poor progress signals. Useful capture needs:

- prompt capture
- JSONL event stream
- assistant/tool transcript
- permission handler requests and decisions
- final summary
- error and cleanup warnings
- artifact path references

The new `SdkSessionRecorder` is a necessary improvement, but the scheduler still needs typed records for SDK runs, permissions, cleanup, and finalization.

### 5.7 Streaming deltas are not semantic progress

Step 09, Step 10, and Step 11 emitted thousands of `assistant.streaming_delta` events. Long streams did not guarantee artifact progress.

Progress should be tied to:

- tool starts/completions
- file writes
- artifact mtime/checksum changes
- final assistant messages
- explicit status transitions

### 5.8 Report-only steps overuse free-form agent execution

When Step 08 and Step 10 evidence already exist, Step 09-11 should not depend on unbounded free-form SDK sessions. The agent can assist, but deterministic synthesis should own the completion path.

### 5.9 Human gates are not first-class enough

Human questions are stored, but they are not yet typed enough to drive a full DAG:

- what transition is blocked
- what alternatives are approved/rejected
- whether approval changes claim boundary
- whether the decision applies to one run, one step, or the whole task
- whether an active session was resumed or a new run consumed the decision

### 5.10 Permissions and cleanup are scheduler state

Step 11 stalled on an SDK `apply_patch` write permission to delete/replace `11-delivery.md`. Later, awaited SDK cleanup could block final state update after `sendAndWait` returned.

The scheduler must know:

- permission requested
- permission approved/rejected/timed out
- permission scope
- cleanup started/completed/failed/timed out
- whether cleanup failure is fatal or warning

### 5.11 Current design lacks code-agent mode separation

Compared with Claude Code, OpenCode, OpenHands, SWE-agent, and Aider, the current system does not clearly separate:

- Plan/read-only analysis
- Build/write-enabled changes
- Runtime validation
- Report synthesis
- Human approval
- Recovery/replay

Mode separation matters because each mode needs different tools, permissions, timeouts, and output contracts.

### 5.12 Current design lacks scoped project instructions

General code agents use stable project instruction layers such as `CLAUDE.md`, `AGENTS.md`, or project config. This migration agent needs an equivalent instruction layer for:

- no bypass / no node deletion / no semantic replacement
- source-identical asset policy
- ComfyUI/XPU conventions
- model path normalization rules
- claim boundary wording
- human gate wording
- report evidence citation rules

These rules should not be rediscovered or copied ad hoc into every prompt.

## 6. Cross-step session decision

### Decision

Do **not** rely on one shared long-lived Copilot SDK session across Steps 00-12.

### Rationale from this run

- SDK sessions can stall on permissions.
- SDK sessions can continue streaming without artifact progress.
- SDK cleanup can block state finalization.
- API restart cannot safely resume an in-memory SDK session.
- Recovered artifacts can be mistaken for completion if state is weak.
- Long context history would mix stale claims, obsolete blockers, and current facts.

### Replacement model

Use:

- fresh SDK/code-agent session per step or child job
- durable SDK session capture for audit/debug
- deterministic `step-XX-memory.json` exports
- global `task-memory.json` or DB-backed memory views
- artifact index with status/schema/freshness/checksum
- human decision ledger
- compiled `StepContextBundle` per run

If a live SDK session is waiting for human input, resume it only while it is active. If it is gone, start a new run with the persisted decision and compiled context.

## 7. Lessons from other agent implementations

| Project / pattern | Useful lesson | How it applies here | Limit |
| --- | --- | --- | --- |
| Copilot SDK | Embeddable sessions, permission hooks, event streams | Good step/subjob execution engine | Application must own state, recovery, contracts |
| Claude Code | Project memory, scoped settings, plan mode, subagents | Add stable migration instructions and role-scoped subagents | Its conversation memory is context, not workflow truth |
| OpenCode | Plan/Build permission separation, configurable agents | Add Plan/Build/Validate/Report modes with different tool rights | Not enough by itself for runtime evidence DAG |
| OpenHands | SDK/CLI/GUI/runtime split, sandboxed workspaces, visible states | Separate backend runtime from UI and expose long-running state | General software-agent state still needs ComfyUI-specific contracts |
| SWE-agent / mini-SWE-agent | Lean action-observation loop, trajectories, benchmark discipline | Store migration trajectory and replay/evaluate workflow migrations | Issue-to-patch loop is simpler than asset/runtime/report DAG |
| Aider | Repo-map context compression, git/diff boundaries, lint/test loop | Build ComfyUI graph/source context packs; use diff/undo boundaries for patches | Pair-programming flow does not cover GPU runtime evidence |
| AutoGPT | Workflow blocks, frontend/server split, permission manager, agent protocol | Model asset/download/validate/report as typed blocks | Needs stricter contracts than general continuous agents |
| CrewAI / AutoGen | Role/task/team orchestration and executor separation | Useful for asset resolver, source auditor, validator, reporter roles | Multi-agent chat cannot be source of truth |
| LangGraph / Temporal | Durable checkpoints/event history, replay, pending writes, activities | Use durable state, idempotent side effects, human-in-loop recovery | Framework adoption should be a separate build-vs-adopt decision |

## 8. Gap severity and priority

| Priority | Gap | Why it matters |
| --- | --- | --- |
| P0 | Typed completion gates and artifact freshness | Prevents false completion from recovered or scaffold artifacts |
| P0 | Separate step/sub-run statuses | Prevents runtime success from being overwritten by SDK/report failure |
| P0 | Structured memory exports and StepContextBundle | Ensures downstream steps consume facts, not guessed Markdown |
| P0 | Step 06 -> targeted Step 01 repair edge | Required for validation-derived missing assets without bypass |
| P1 | SQLite/event-state store with run attempts and leases | Enables restart recovery and concurrent-safe orchestration |
| P1 | Bounded SDK session capture, permission, cleanup state | Prevents Step 11-style invisible stalls |
| P1 | Deterministic report synthesis for Steps 09-11 | Reduces free-form long-running report failures |
| P1 | Agent mode/role registry | Aligns tools and permissions with task risk |
| P2 | Project instruction layer | Keeps no-bypass/source-identical/claim rules stable |
| P2 | Benchmark/replay suite | Makes future workflow migrations measurable |

## 9. Final assessment

The current implementation is a strong prototype because it already produced real evidence, discovered real DAG edges, and found concrete SDK integration bugs. Its main weakness is that evidence, memory, and scheduler state are still too implicit.

The redesigned system should keep the validated principles:

- no bypass
- source-identical assets unless explicitly approved otherwise
- evidence-bound claims
- human gates before semantic changes
- short-lived agent sessions

But it must replace "linear step + artifact exists + free-form SDK" with:

- durable DAG scheduler
- typed step contracts
- structured memory
- artifact schema/freshness checks
- sub-run attempts
- bounded agent sessions
- first-class human decisions
- deterministic report synthesis where possible

