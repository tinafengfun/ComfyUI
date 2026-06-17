# ComfyUI migration agent redesign proposal

task_id: `5d2e2cbc-8bb8-4ba4-a4fc-832d13e413f9`

workflow: `cartoon/Qwen-Image-2512-4步-20260320-william-单参考图.json`

status note: Step 11 reached a human gate after SDK permission/cleanup fixes. Step 12 GUI acceptance is not complete.

## 1. Design goal

Build a migration workflow system for ComfyUI-to-Intel-XPU work that can run long, evidence-heavy tasks safely across restarts, human gates, runtime validation, model staging, source audits, and delivery packaging.

This is not a normal general-purpose coding agent. It has coding-agent elements, but its source of truth must be workflow state and runtime evidence, not conversation memory.

## 2. Non-negotiable principles

1. **No bypass**: do not bypass, delete, collapse, or replace workflow nodes to force success.
2. **Source-identical first**: model/input/custom-node assets must be source-identical unless a human explicitly approves a named substitute and the claim boundary changes.
3. **Evidence-bound claims**: every "works" claim must point to runtime evidence, artifact evidence, or a human decision.
4. **Short-lived agent sessions**: use one SDK/code-agent session per step or subjob; persist captures for audit.
5. **Application-owned memory**: cross-step memory lives in typed state and artifacts, not in one shared conversation.
6. **Typed completion gates**: artifact existence is not completion.
7. **Human gates are state**: approvals, rejections, and claim-boundary changes are durable ledger entries.
8. **Idempotent side effects**: downloads, file writes, environment changes, and runtime validation must be retry-safe and auditable.
9. **Report steps are bounded**: if evidence exists, deterministic synthesis should complete reports without unbounded free-form agent work.

## 3. High-level architecture

```text
                         Human / Web UI / CLI
                                  |
                                  v
                     Human Decision Broker
                                  |
                                  v
+------------------------------------------------------------------+
|                    Durable Migration Orchestrator                 |
|                                                                  |
|  Step Contract Registry  ->  DAG Scheduler  ->  Run Leases        |
|          |                       |                  |              |
|          v                       v                  v              |
|  StepContextBundle        Runtime/SDK jobs     Recovery scanner    |
+------------------------------------------------------------------+
          |                       |                  |
          v                       v                  v
+------------------+   +--------------------+   +------------------+
| State Store       |   | Artifact/Evidence   |   | Agent Role Pool  |
| SQLite preferred  |   | Store + Index       |   | SDK sessions     |
+------------------+   +--------------------+   +------------------+
          |                       |                  |
          v                       v                  v
  tasks/steps/runs      Markdown/JSON/log/png     Copilot SDK
  memory/decisions      checksums/schemas         read-only explore
  sdk/runtime state     freshness/run ids         write/report roles
```

## 4. Main components

### 4.1 Durable orchestrator / scheduler

Responsibilities:

- evaluate top-level and child DAG readiness
- compile `StepContextBundle`
- start deterministic steps, runtime jobs, and SDK/code-agent jobs
- enforce max wall-clock and no-progress budgets
- persist run attempts before side effects
- recover after restart
- route human decisions back into the DAG
- mark stale live sessions as terminated without losing reusable evidence

It should not treat `step.status` as a single truth. A top-level step should summarize several sub-states.

### 4.2 Step contract registry

Each step has a machine-readable contract:

- input dependencies
- required artifacts
- structured memory inputs
- allowed actions
- forbidden actions
- agent mode
- tool permissions
- completion schema
- human gates
- retry policy
- downstream memory exports

This replaces the current loose combination of prompt text, required output string, and artifact list.

### 4.3 Artifact and evidence store

Artifacts remain useful human-review outputs, but each artifact should be indexed:

- path
- step id / run id / attempt id
- kind
- schema type
- status: `in_progress`, `complete`, `human_gate_reached`, `failed`, `reusable`
- checksum
- size
- mtime
- referenced upstream evidence
- claim boundary

Markdown can remain reviewable, but JSON memory is the scheduler contract.

### 4.4 Structured memory manager

The system should generate:

- `step-00-memory.json`
- `step-01-memory.json`
- ...
- `task-memory.json` as a generated view or DB-backed aggregate

These are not free-form summaries. They are typed state exports.

### 4.5 SDK/code-agent runner

The SDK runner should be an execution engine, not a state store.

It should persist:

- prompt capture
- JSONL event stream
- transcript
- final summary
- permission requests/decisions
- cleanup warnings
- run status
- semantic progress markers
- artifact paths touched

It should enforce:

- max runtime
- no semantic progress timeout
- no artifact progress timeout for report steps
- permission policy by mode
- bounded cleanup

### 4.6 Runtime connectors

Separate runtime connectors from agent prompts:

- ComfyUI API connector
- model/input asset resolver
- custom-node source connector
- shell/git connector
- XPU telemetry connector
- image integrity connector

Runtime connector outputs should be typed evidence, not just logs.

### 4.7 Human decision broker

Human gates need structured records:

- question id
- blocked transition
- choices
- answer
- freeform note
- decision scope: run/step/task
- claim-boundary effect
- whether active session was resumed
- whether a new run consumed the decision

## 5. Agent modes and permissions

Borrow from Claude Code, OpenCode, OpenHands, SWE-agent, Aider, AutoGPT, CrewAI, and AutoGen, but keep deterministic scheduler ownership.

| Mode | Purpose | Tools | Writes allowed | Typical steps |
| --- | --- | --- | --- | --- |
| Plan | Analyze current state and propose next subjobs | read files, read DB, inspect artifacts | no | intake review, feasibility, recovery planning |
| Explore | Read-only source/workflow research | read files, search, source index | no | source audit prep, custom-node source mapping |
| Build | Produce prompt/artifact/code/package material | bounded file writes, patch generation | yes, scoped | Step 04/06/11 when needed |
| Validate | Execute ComfyUI/runtime checks | ComfyUI API, telemetry, image checks | runtime artifacts only | Step 06/07/08 |
| Report | Synthesize evidence into review docs | read evidence, write report artifacts | report files only | Step 09/10/11 |
| Recover | Inspect stale runs and reconcile state | read DB/artifacts, update state | state only | restart/timeout handling |

Each mode should have max-step/max-time budgets and permission policies. For example, a Report agent should not install packages or modify source code.

## 6. Agent role registry

Role-specialized agents are useful, but they should be scheduled by the orchestrator rather than chatting freely.

| Role | Mode | Responsibility | Memory output |
| --- | --- | --- | --- |
| Intake agent | Plan | Summarize workflow and preflight blockers | workflow identity, initial gaps |
| Asset resolver | Build/Validate | Resolve model/input/custom-node assets | asset ledger |
| Source auditor | Explore/Report | Audit active custom-node source risks | source risk registry |
| Environment agent | Build | Prepare environment under gates | environment readiness |
| Prompt converter | Build/Validate | Convert and validate API prompt | prompt validation memory |
| Branch validator | Validate | Run branch smoke child jobs | branch run evidence |
| Full validator | Validate | Run full workflow and capacity evidence | runtime/capacity memory |
| Tuning analyst | Report | Decide safe tuning candidates | tuning decision memory |
| Coverage analyst | Report | Compare active graph with validation evidence | coverage memory |
| Delivery packager | Report/Build | Package final review artifacts | delivery memory and human gate |
| GUI acceptance agent | Validate | Clean GUI/manual acceptance | GUI evidence; future Step 12 |

## 7. DAG model

### 7.1 Top-level product DAG

```text
00 Intake
  -> 01 Asset/custom-node resolution
  -> 02 Feasibility
  -> 03 Inventory
  -> 04 Source audit
  -> 05 Environment
  -> 06 Prompt conversion validation
  -> 07 Branch smoke
  -> 08 Full validation/capacity
  -> 09 Performance tuning
  -> 10 Coverage review
  -> 11 Delivery packaging
  -> 12 GUI acceptance
```

The UI may display this as linear. The backend should not execute it as only linear.

### 7.2 Asset acquisition DAG

```text
workflow asset refs
  -> asset_resolution_jobs[]
  -> local/provider search
  -> staged file
  -> checksum/source-identical validation
  -> asset ledger update
```

Asset matching must support:

- original workflow value
- POSIX-normalized value
- backslash-relative value
- basename
- model-root-relative path

### 7.3 Validation repair DAG

```text
06 validation failure
  -> parse node_errors
  -> create targeted asset/input/custom-node jobs
  -> run resolver subjobs
  -> refresh memory/artifact ledger
  -> rerun 06 validation
```

This edge should be automated and visible. It is not a bypass.

### 7.4 Branch validation DAG

```text
06 validated prompt
  -> branch smoke job per active output branch
  -> aggregate branch smoke memory
  -> 08 full validation
```

Each branch child job needs attempt records so SDK setup failures do not equal workflow failures.

### 7.5 Evidence/report DAG

```text
08 runtime baseline -> 09 tuning
03 inventory + 06 validation + 07 branch evidence + 08 full evidence -> 10 coverage
08 full evidence + 09 tuning + 10 coverage -> 11 delivery
11 human gate -> 12 GUI acceptance
```

Report DAG nodes should be deterministic by default.

### 7.6 Recovery DAG

```text
startup/restart
  -> find running runs without live lease
  -> mark sdk/runtime run terminated
  -> inspect artifact index and memory schemas
  -> complete reusable evidence, retry incomplete finalization, or request human decision
```

## 8. Memory and session model

### 8.1 Memory layers

| Layer | Content | Lifecycle | Completion authority |
| --- | --- | --- | --- |
| Raw artifacts | workflow, prompt, logs, histories, telemetry, PNGs, patches | workspace permanent | yes, only with schema/status checks |
| Structured step memory | typed JSON exported by each step | step complete/block/fail | yes |
| Task memory | aggregate generated view | whole task | yes, if derived from typed memory |
| Runtime state DB | tasks, runs, leases, events, decisions | durable runtime | yes |
| SDK captures | prompt, JSONL, transcript, permission events | per run | audit/debug only |
| Advisory summaries | compressed context for agents | regenerable | no |
| Human decision ledger | approvals/rejections/claim changes | permanent | yes |
| Project instructions | stable migration rules | project lifetime | policy/context only |

### 8.2 StepContextBundle

Every run should receive a compiled context bundle:

```json
{
  "taskId": "...",
  "stepId": "06",
  "runId": "...",
  "mode": "Validate",
  "dependencyStates": {},
  "requiredArtifacts": [],
  "availableArtifacts": [],
  "structuredMemory": {},
  "artifactIndex": {},
  "humanDecisions": [],
  "allowedActions": [],
  "forbiddenActions": [],
  "completionSchema": {},
  "freshness": {
    "requiresCurrentRunArtifacts": true
  }
}
```

### 8.3 Session policy

Use a fresh SDK/code-agent session for:

- each top-level step run
- each Step 01 asset subjob if agent assistance is required
- each Step 07 branch smoke child job if agent assistance is required
- each report-finalization attempt if deterministic synthesis is insufficient

Do not preserve one long conversation across 00-12. If a human gate pauses an active session, resume it only while the session is live. If the process restarts, compile a new bundle and start a new run.

### 8.4 Project instruction layer

Add a stable project instruction file or DB-backed config equivalent to `CLAUDE.md` / `AGENTS.md`:

- no bypass
- source-identical asset policy
- ComfyUI path normalization
- XPU runtime policy
- artifact naming rules
- claim boundary wording
- human gate wording
- report citation rules
- secret redaction rules

This prevents prompts from drifting across steps.

## 9. Step contracts for 00-12

| Step | Inputs | Outputs | Memory exported | Completion gate | Downstream |
| --- | --- | --- | --- | --- | --- |
| 00 | workflow, model roots, ComfyUI root | `00-intake-preflight.md` | workflow identity, initial dependency hints, preflight blockers | preflight schema complete; blockers explicit | 01, 02 |
| 01 | Step 00 hints, workflow refs, local/provider paths | `01-assets.csv`, `01-custom-nodes.md`, `step-01-memory.json` | asset ledger, custom-node source ledger, gaps | all critical refs staged or human gate/approved exception | 02, 04, 05, 06 repair |
| 02 | Step 00/01 memory | `02-feasibility.md`, `step-02-memory.json` | feasibility status, hard stops, assumptions | reflects Step 01 gaps and decisions | 03 |
| 03 | workflow, Step 02 | `03-inventory.md`, graph JSON | nodes, links, active outputs, disconnected nodes | graph parsed and active branches identified | 04, 06, 10 |
| 04 | Step 01/03, source tree | `04-source-audit.md`, source risk JSON | source risks, XPU/CUDA issues, mitigation state | active critical sources audited or human hard stop | 05, 11 |
| 05 | Step 01/04, env config | `05-environment.md`, env memory | environment readiness, install/registration state | no critical asset gaps unless approved gate | 06 |
| 06 | Step 03/05, workflow, assets | `06-prompt.json`, `06-prompt-validation.json`, validation memory | API prompt, validated outputs, node errors, repair jobs | intended output validated; no blockers | 07, 08, 10 |
| 07 | Step 06 prompt/validation | branch smoke artifacts, branch memory | branch run attempts, outputs, logs | each required active branch smoke success or explicit gate | 08, 10 |
| 08 | Step 06/07, runtime | full validation artifacts, output PNG, telemetry | full run status, output integrity, capacity | runtime success, output verified, telemetry recorded | 09, 10, 11 |
| 09 | Step 08 | `09-tuning.md`, tuning memory | tuning candidates, accepted/rejected changes | no unsafe tuning or approved tuning evidence | 11 |
| 10 | Step 03/06/07/08 | `10-coverage-review.md`, coverage memory | active node coverage, unsupported/disconnected boundary | all active linked nodes covered or documented gap | 11 |
| 11 | Step 08/09/10, patch/package state | `11-delivery.md`, `migration-result-report.md`, delivery memory | delivery package, claim boundary, human gate | schema complete or human gate reached; references evidence | 12 |
| 12 | Step 11, clean GUI run | `12-gui-acceptance.md`, GUI evidence | GUI acceptance result | clean GUI workflow accepted by human/evidence | final release |

Step 12 is intentionally listed as a future contract. It has not been completed for the current task.

## 10. Runtime state schema

SQLite is recommended over one JSON file.

Suggested tables:

| Table | Purpose |
| --- | --- |
| `tasks` | task metadata, workflow path, workspace path, overall status |
| `steps` | top-level step definitions and current summary status |
| `step_runs` | each attempt at a step, mode, status, start/end, reason |
| `sub_jobs` | asset jobs, branch smoke jobs, report finalization jobs |
| `runtime_runs` | ComfyUI prompt runs, prompt id, HTTP status, history status, telemetry |
| `sdk_sessions` | SDK run captures, status, prompt path, transcript path, event path |
| `permission_requests` | SDK/tool permission request, decision, scope, timeout |
| `artifacts` | artifact index with checksum, schema, status, freshness, evidence refs |
| `step_memory` | typed memory JSON per step/run |
| `human_questions` | durable gate questions |
| `human_decisions` | approvals/rejections/claim boundary changes |
| `leases` | process/run ownership for restart recovery |
| `events` | compact event journal for UI and audit |

## 11. Completion gates

Examples:

### Step 06

```json
{
  "prompt_validation_passed": true,
  "validated_outputs": ["60"],
  "node_errors": {},
  "remaining_blockers": [],
  "source_workflow_changed": false,
  "nodes_bypassed_or_deleted": []
}
```

### Step 08

```json
{
  "run_status": "success",
  "prompt_id": "...",
  "executed_nodes": ["39", "100", "101", "38", "7", "6", "90", "93", "66", "3", "8", "60"],
  "cached_nodes": [],
  "output": {
    "path": "08-output-qwen_00001_.png",
    "sha256": "f38c786b1432bb99d6d40ebbf1733573aa502f541e53c6007b9a929077c63caf",
    "width": 1056,
    "height": 1584
  },
  "capacity": {
    "peak_xpu_smi_memory_utilization": 86.45
  }
}
```

### Step 11

```json
{
  "orchestrator_status": "human_gate_reached",
  "references": ["08-full-validation-summary.json", "10-coverage-review.md"],
  "claim_boundary": "source workflow unchanged; no nodes bypassed/deleted/replaced",
  "patches_applied_in_validated_run": false,
  "step12_status": "not_complete"
}
```

## 12. Execution policy

### 12.1 Precheck before every step

Before running a step:

- reconcile stale leases
- load typed dependency memory
- validate required upstream gates
- check artifact freshness
- compile StepContextBundle
- decide deterministic, runtime, SDK, or report execution path

### 12.2 Deterministic-first policy

Use deterministic code for:

- artifact indexing
- asset ledger generation
- workflow graph inventory
- prompt validation result parsing
- runtime history parsing
- output image integrity
- report synthesis where facts are already available

Use SDK/code-agent sessions for:

- bounded source reasoning
- missing analysis
- human-readable report drafting under schema
- patch/package material generation

### 12.3 Retry policy

Differentiate:

- SDK/session setup failure
- permission timeout
- report artifact no-progress
- runtime API failure
- model missing
- workflow validation failure
- human rejection
- server restart/terminated lease

Only retry when the failure class is retryable and input state has not become stale.

### 12.4 Report-only policy

For Steps 09-11:

- build report from structured memory first
- if SDK is used, require incremental artifact writes
- enforce short no-artifact-progress timeout
- validate final schema
- do not mark complete from non-empty file alone

## 13. Build-vs-adopt decision

Do not immediately replace the backend with a general agent framework.

Recommended path:

1. Build the migration-specific durable scheduler and typed memory first.
2. Borrow patterns from open-source agents:
   - OpenHands: UI/runtime separation and sandbox state
   - SWE-agent: trajectory/replay and benchmark discipline
   - Aider: repo-map/context selection and git boundaries
   - AutoGPT: block workflow and permission gating
   - CrewAI/AutoGen: role decomposition and executor separation
   - LangGraph/Temporal: durable checkpoints/event history patterns
3. Revisit framework adoption only after the ComfyUI-specific state model and contracts are clear.

Reason: none of the surveyed agents natively model ComfyUI graph validation, source-identical model staging, GPU telemetry, workflow claim boundaries, and no-bypass delivery evidence together.

## 14. Implementation roadmap

### Phase 1: Contracts and typed memory

- Define step contract JSON for 00-12.
- Add `step-XX-memory.json` exporters for existing deterministic steps.
- Add parsers for `01-assets.csv`, `06-prompt-validation.json`, Step 07/08 runtime artifacts.
- Update `StepJob` into `StepContextBundle`.

### Phase 2: Artifact index and completion gates

- Add artifact schema/status/freshness/checksum index.
- Replace non-empty completion with per-step validators.
- Store run id/attempt id on generated artifacts.
- Make `in_progress` scaffold impossible to complete.

### Phase 3: Durable state store

- Move runtime state from `state.json` to SQLite.
- Add tables for runs, subjobs, SDK sessions, runtime runs, permissions, decisions, leases.
- Add restart reconciliation and stale lease scanner.

### Phase 4: DAG scheduler

- Keep UI top-level 00-12.
- Add child DAGs:
  - asset jobs
  - validation repair
  - branch smoke jobs
  - report synthesis
  - recovery jobs
- Implement Step 06 -> targeted Step 01 asset jobs -> rerun Step 06.

### Phase 5: Agent modes and permissions

- Add mode registry: Plan, Explore, Build, Validate, Report, Recover.
- Restrict tools by mode.
- Add max-step/max-runtime budgets by mode.
- Add project instruction layer for no-bypass/source-identical/claim rules.

### Phase 6: Deterministic report generation

- Generate Steps 09-11 from structured evidence when possible.
- Use SDK only for bounded missing analysis or wording.
- Validate Step 11 delivery schema and human gate before marking ready for Step 12.

### Phase 7: Evaluation and replay

- Add a migration trajectory view similar to SWE-agent trajectories.
- Add replay/inspection for state + artifacts.
- Build a small workflow benchmark set:
  - missing model path cases
  - backslash/subdirectory asset paths
  - validation-derived asset repair
  - SDK permission stall recovery
  - report-only deterministic completion
  - Step 12 GUI acceptance when available

## 15. Expected result

The redesigned agent should behave like this:

1. Every step starts from a typed context bundle.
2. Every side effect is represented as a run/subjob with status.
3. Every report claim points to evidence.
4. Every human gate is resumable after restart.
5. SDK sessions can fail without losing runtime evidence.
6. Existing artifacts can be reused only if schema, freshness, and evidence gates pass.
7. Step 06 can create targeted asset jobs instead of stopping the whole migration manually.
8. Step 09-11 can finish from evidence without unbounded report-agent stalls.
9. Step 12 remains a separate GUI acceptance gate and is not implied by backend success.

