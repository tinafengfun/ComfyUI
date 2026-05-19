import fs from "node:fs/promises";
import path from "node:path";
import type {
  HumanDecision,
  MigrationStepDefinition,
  MigrationTask,
  StepJob,
  StepStatus
} from "../shared/types";
import type { AppConfig } from "./config";
import { ensureDir, readJson, writeJson } from "./fsUtils";

const phase1AgentName = "phase1-monolithic-copilot-driver";
const phase1ContextDir = "phase1-context";
const phase1StepHandoffDir = path.join(phase1ContextDir, "step-handoffs");
const phase1TaskStateFile = "task-state.json";
const phase1DriverPromptFile = path.join(phase1ContextDir, "phase1-driver-prompt.md");
const phase1RunningSummaryFile = path.join(phase1ContextDir, "running-summary.md");
const phase1ContextDebtFile = path.join(phase1ContextDir, "context-debt.json");
const phase1ExtractionFile = path.join(phase1ContextDir, "phase3-extraction-candidates.json");
const phase1ContextBudgetFile = path.join(phase1ContextDir, "context-budget.json");

export interface Phase1DriverArtifacts {
  taskStatePath: string;
  promptPath: string;
  runningSummaryPath: string;
  contextDebtPath: string;
  phase3ExtractionPath: string;
  contextBudgetPath: string;
  stepHandoffDir: string;
  job: StepJob;
}

export interface Phase1StepState {
  id: string;
  name?: string;
  status: string;
  summary?: string;
  artifacts?: string[];
  completion_decision?: Record<string, unknown>;
  next_step_context?: Record<string, unknown>;
  context_debt?: unknown[];
}

export interface Phase1TaskState {
  schema_version: number;
  agent: string;
  mode: "monolithic_driver";
  task_id: string;
  status: string;
  current_step_id?: string;
  workflow_path: string;
  workspace_path: string;
  artifact_path: string;
  updated_at: string;
  steps: Phase1StepState[];
  human_decisions: HumanDecision[];
  claim_boundary: Record<string, unknown>;
  compaction: {
    running_summary: string;
    context_debt: string;
    phase3_extraction_candidates: string;
    context_budget: string;
    step_handoffs: string;
    compact_checkpoints: string;
    required_after_each_step: boolean;
  };
}

export async function preparePhase1Driver(input: {
  config: AppConfig;
  task: MigrationTask;
  steps: MigrationStepDefinition[];
  decisions: HumanDecision[];
}): Promise<Phase1DriverArtifacts> {
  const stepHandoffDir = path.join(input.task.artifactPath, phase1StepHandoffDir);
  await ensureDir(stepHandoffDir);

  const taskStatePath = path.join(input.task.workspacePath, phase1TaskStateFile);
  const runningSummaryPath = path.join(input.task.artifactPath, phase1RunningSummaryFile);
  const contextDebtPath = path.join(input.task.artifactPath, phase1ContextDebtFile);
  const phase3ExtractionPath = path.join(input.task.artifactPath, phase1ExtractionFile);
  const contextBudgetPath = path.join(input.task.artifactPath, phase1ContextBudgetFile);
  const promptPath = path.join(input.task.artifactPath, phase1DriverPromptFile);

  const taskState = await buildPhase1TaskState({
    task: input.task,
    steps: input.steps,
    decisions: input.decisions,
    taskStatePath
  });
  await writeJson(taskStatePath, taskState);
  await ensureRunningSummary(runningSummaryPath, input.task, taskState);
  await ensureContextDebt(contextDebtPath);
  await ensurePhase3Extraction(phase3ExtractionPath);

  const prompt = await compilePhase1DriverPrompt({
    config: input.config,
    task: input.task,
    steps: input.steps,
    taskState,
    taskStatePath,
    runningSummaryPath,
    contextDebtPath,
    phase3ExtractionPath,
    contextBudgetPath,
    stepHandoffDir
  });
  await fs.writeFile(promptPath, prompt, "utf8");

  return {
    taskStatePath,
    promptPath,
    runningSummaryPath,
    contextDebtPath,
    phase3ExtractionPath,
    contextBudgetPath,
    stepHandoffDir,
    job: {
      taskId: input.task.id,
      stepId: "phase1",
      stepName: "Phase 1 monolithic migration driver",
      promptPath,
      skillPath: path.join(input.config.draftDocRoot, "migration-workflow-v2", "agent.md"),
      workspacePath: input.task.workspacePath,
      artifactPath: input.task.artifactPath,
      workflowPath: input.task.workflowPath,
      modelRoots: input.config.modelRoots,
      comfyuiRoot: input.config.comfyuiRoot,
      instructions: prompt,
      constraints: [
        "Run the 00-13 migration in this single backend-controlled session until completion, human gate, hard stop, or failure.",
        "Update workspace task-state.json after every step transition.",
        "Write all step outputs and compaction artifacts under the task artifact folder.",
        "Respect artifacts/phase1-context/context-budget.json: checkpoint on warning and stop before starting a new step on critical.",
        "Do not bypass, delete, disable, collapse, or replace workflow nodes to force success.",
        "Do not persist credentials or secret values."
      ],
      requiredContext: {
        workflowPath: input.task.workflowPath,
        workspacePath: input.task.workspacePath,
        artifactPath: input.task.artifactPath,
        taskStatePath,
        runningSummaryPath,
        contextDebtPath,
        phase3ExtractionPath,
        contextBudgetPath,
        stepHandoffDir,
        phase1AgentContractPath: path.join(
          input.config.draftDocRoot,
          "migration-workflow-v2",
          "agent.md"
        ),
        modelRoots: input.config.modelRoots,
        comfyuiRoot: input.config.comfyuiRoot
      },
      expectedArtifacts: [
        phase1TaskStateFile,
        phase1RunningSummaryFile,
        phase1ContextDebtFile,
        phase1ExtractionFile,
        phase1DriverPromptFile
      ],
      humanGates: [
        "Use the web human-decision channel for any Phase 1 gate. The gate must name the exact step, blocker, choices, claim-boundary impact, decision background/reason/scene, terminology explanations, and consequences/follow-up for every choice."
      ],
      hardStopRules: [
        "Stop if success would require bypassing or semantically changing workflow nodes.",
        "Stop if required source-identical assets are unavailable and no human-approved substitute exists.",
        "Stop if a required secret would need to be persisted.",
        "Stop if required upstream context cannot be repaired safely from artifacts."
      ]
    }
  };
}

export async function readPhase1TaskState(task: MigrationTask): Promise<Phase1TaskState> {
  const taskStatePath = path.join(task.workspacePath, phase1TaskStateFile);
  const state = await readJson<Phase1TaskState | undefined>(taskStatePath, undefined);
  if (!state) {
    throw new Error(`Phase 1 task-state.json was not found: ${taskStatePath}`);
  }
  if (state.agent !== phase1AgentName || state.mode !== "monolithic_driver") {
    throw new Error(`Invalid Phase 1 task-state.json agent/mode at ${taskStatePath}`);
  }
  if (!Array.isArray(state.steps)) {
    throw new Error(`Invalid Phase 1 task-state.json steps array at ${taskStatePath}`);
  }
  return state;
}

export function normalizePhase1StepStatus(status: string): StepStatus {
  switch (status) {
    case "pending":
    case "running":
    case "waiting_for_human":
    case "hard_stopped":
    case "completed":
    case "failed":
    case "terminated":
      return status;
    case "human_gate_reached":
      return "waiting_for_human";
    case "hard_stop":
      return "hard_stopped";
    default:
      throw new Error(`Unsupported Phase 1 step status: ${status}`);
  }
}

async function buildPhase1TaskState(input: {
  task: MigrationTask;
  steps: MigrationStepDefinition[];
  decisions: HumanDecision[];
  taskStatePath: string;
}): Promise<Phase1TaskState> {
  const existing = await readJson<Partial<Phase1TaskState> | undefined>(
    input.taskStatePath,
    undefined
  );
  const activeStepId = findCurrentStepId(input.task, input.steps);
  const now = new Date().toISOString();
  const existingSteps = new Map((existing?.steps ?? []).map((step) => [step.id, step]));

  const steps = input.steps.map((step) => {
    const persisted = existingSteps.get(step.id);
    const taskStep = input.task.steps.find((item) => item.id === step.id);
    const status = resolvePhase1StepStatus({ persisted, taskStep, activeStepId });
    return {
      id: step.id,
      name: step.name,
      status,
      summary: persisted?.summary ?? taskStep?.summary,
      artifacts: persisted?.artifacts ?? [],
      completion_decision: persisted?.completion_decision ?? {},
      next_step_context: persisted?.next_step_context ?? {},
      context_debt: persisted?.context_debt ?? []
    };
  });

  return {
    schema_version: 1,
    agent: phase1AgentName,
    mode: "monolithic_driver",
    task_id: input.task.id,
    status: derivePhase1TaskStatus(steps),
    current_step_id: steps.find((step) => step.status !== "completed")?.id ?? activeStepId,
    workflow_path: input.task.workflowPath,
    workspace_path: input.task.workspacePath,
    artifact_path: input.task.artifactPath,
    updated_at: now,
    steps,
    human_decisions: input.decisions,
    claim_boundary: existing?.claim_boundary ?? {
      no_bypass: true,
      source_identical: "unknown",
      runtime_policy: "not_started",
      full_size: "not_claimed",
      gui_acceptance: "not_claimed",
      customer_ready: false
    },
    compaction: {
      running_summary: path.join("artifacts", phase1RunningSummaryFile),
      context_debt: path.join("artifacts", phase1ContextDebtFile),
      phase3_extraction_candidates: path.join("artifacts", phase1ExtractionFile),
      context_budget: path.join("artifacts", phase1ContextBudgetFile),
      step_handoffs: path.join("artifacts", phase1StepHandoffDir),
      compact_checkpoints: path.join("artifacts", phase1ContextDir),
      required_after_each_step: true
    }
  };
}

function resolvePhase1StepStatus(input: {
  persisted?: Phase1StepState;
  taskStep?: MigrationTask["steps"][number];
  activeStepId?: string;
}): string {
  const { persisted, taskStep, activeStepId } = input;
  if (taskStep?.status === "completed" && persisted?.status !== "completed") {
    return "completed";
  }
  if (
    taskStep?.id === activeStepId &&
    taskStep?.status === "pending" &&
    (!persisted?.status || persisted.status === "pending")
  ) {
    return "running";
  }
  if (persisted?.status) return persisted.status;
  return taskStep?.status ?? "pending";
}

function derivePhase1TaskStatus(steps: Array<{ status: string }>): string {
  if (steps.every((step) => step.status === "completed")) return "completed";
  if (steps.some((step) => step.status === "waiting_for_human" || step.status === "human_gate_reached")) {
    return "waiting_for_human";
  }
  if (steps.some((step) => step.status === "failed")) return "failed";
  if (steps.some((step) => step.status === "hard_stopped" || step.status === "hard_stop")) {
    return "hard_stopped";
  }
  if (steps.some((step) => step.status === "terminated")) return "terminated";
  return "running";
}

function findCurrentStepId(
  task: MigrationTask,
  steps: MigrationStepDefinition[]
): string | undefined {
  const active = task.steps.find((step) =>
    ["running", "waiting_for_human", "failed", "hard_stopped", "terminated"].includes(step.status)
  );
  if (active) return active.id;
  return steps.find((step) => {
    const state = task.steps.find((item) => item.id === step.id);
    return !state || state.status !== "completed";
  })?.id;
}

async function ensureRunningSummary(
  filePath: string,
  task: MigrationTask,
  state: Phase1TaskState
): Promise<void> {
  try {
    await fs.access(filePath);
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  await fs.writeFile(
    filePath,
    [
      "# Phase 1 running summary",
      "",
      `task_id: \`${task.id}\``,
      `workflow: \`${task.workflowPath}\``,
      `current_step_id: \`${state.current_step_id ?? "none"}\``,
      "",
      "This file is the compact handoff summary for the monolithic Phase 1 agent. Update it after every step before continuing.",
      "",
      "## Current claim boundary",
      "",
      "- no bypass is allowed",
      "- source-identical status is unknown until Step 01 proves or human-bounds it",
      "- full-size, GUI acceptance, and customer-ready claims are not available at startup",
      ""
    ].join("\n"),
    "utf8"
  );
}

async function ensureContextDebt(filePath: string): Promise<void> {
  try {
    await fs.access(filePath);
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await writeJson(filePath, []);
}

async function ensurePhase3Extraction(filePath: string): Promise<void> {
  try {
    await fs.access(filePath);
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await writeJson(filePath, {
    schema_version: 1,
    agent: phase1AgentName,
    candidates: []
  });
}

async function compilePhase1DriverPrompt(input: {
  config: AppConfig;
  task: MigrationTask;
  steps: MigrationStepDefinition[];
  taskState: Phase1TaskState;
  taskStatePath: string;
  runningSummaryPath: string;
  contextDebtPath: string;
  phase3ExtractionPath: string;
  contextBudgetPath: string;
  stepHandoffDir: string;
}): Promise<string> {
  const agentContractPath = path.join(
    input.config.draftDocRoot,
    "migration-workflow-v2",
    "agent.md"
  );
  const agentContract = await fs.readFile(agentContractPath, "utf8");
  const stepTable = input.steps
    .map((step) =>
      [
        `### Step ${step.id}: ${step.name}`,
        `- prompt: ${step.promptPath ?? "none"}`,
        `- skill: ${step.skillPath ?? "none"}`,
        `- required output: ${step.requiredOutput}`,
        `- human intervention: ${step.humanIntervention}`
      ].join("\n")
    )
    .join("\n\n");

  return [
    "# Phase 1 monolithic backend agent run",
    "",
    "You are running as the backend-controlled Phase 1 Copilot agent for one ComfyUI Intel XPU migration task.",
    "Run the 00-13 workflow in this single session, but externalize state after every step so the future Phase 2/3 split does not depend on this conversation.",
    "",
    "## Paths",
    "",
    `- workflow: ${input.task.workflowPath}`,
    `- workspace: ${input.task.workspacePath}`,
    `- artifact folder: ${input.task.artifactPath}`,
    `- task state: ${input.taskStatePath}`,
    `- running summary: ${input.runningSummaryPath}`,
    `- context debt: ${input.contextDebtPath}`,
    `- Phase 3 extraction candidates: ${input.phase3ExtractionPath}`,
    `- context budget monitor: ${input.contextBudgetPath}`,
    `- step handoff dir: ${input.stepHandoffDir}`,
    `- ComfyUI root: ${input.config.comfyuiRoot}`,
    `- model roots: ${input.config.modelRoots.join(", ") || "(none)"}`,
    "",
    "## Required startup sequence",
    "",
    "1. Read `task-state.json`.",
    "2. Read `artifacts/phase1-context/running-summary.md`.",
    "3. Read this Phase 1 contract.",
    "4. Find the first non-completed or gated step from `task-state.json`.",
    "5. Read that step's prompt and skill document before doing step work.",
    "6. If the current step is `waiting_for_human`, first inspect `human_decisions` in `task-state.json`. If a new decision answers the gate, apply it, update the gate artifact/claim boundary, and continue. Only stop again if the decision is insufficient or unsafe.",
    "7. Read `artifacts/phase1-context/context-budget.json` if it exists. If its level is `warning`, write a compact checkpoint before starting the next step. If its level is `critical`, do not start a new step; stop with a context checkpoint summary so the backend can resume in a fresh SDK session.",
    "8. Update `task-state.json`, the step handoff, the running summary, context debt, Phase 3 extraction candidates, and any compact checkpoint before moving to the next step.",
    "",
    "## Current task-state snapshot",
    "",
    "```json",
    JSON.stringify(input.taskState, null, 2),
    "```",
    "",
    "## Phase 1 agent contract",
    "",
    agentContract,
    "",
    "## Step document map",
    "",
    stepTable,
    "",
    "## Final instruction",
    "",
    "Proceed now. Do not ask whether to start. Stop only for a valid human gate, hard stop, backend/tool failure, or completion of Step 13."
  ].join("\n");
}
