import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  AgentEvent,
  HumanDecision,
  HumanDecisionContext,
  HumanQuestion,
  MigrationStepDefinition,
  MigrationTask
} from "../shared/types";
import type { AppConfig } from "./config";
import { ensureAssetAcquisitionJob } from "./assetAcquisition";
import { ensureAssetPrep } from "./assetPrep";
import { checkRequiredArtifactCompletion, checkRequiredArtifactGate } from "./artifactCompletion";
import { ensureBranchSmokeAggregate } from "./branchSmokeAggregate";
import {
  CopilotSdkRunner,
  SdkStepTimeoutError,
  type AgentEventSink,
  type HumanDecisionWaiter,
  type SdkRunResult
} from "./copilotSdkRunner";
import {
  ContextBudgetExceededError,
  ContextBudgetTracker,
  type ContextBudgetSnapshot
} from "./contextBudget";
import { ensureFeasibility } from "./feasibility";
import { ensureDir, writeJson } from "./fsUtils";
import { HumanApprovalBroker } from "./humanApprovalBroker";
import { ensureIntakePreflight } from "./intakePreflight";
import {
  normalizePhase1StepStatus,
  preparePhase1Driver,
  readPhase1TaskState,
  type Phase1StepState
} from "./phase1Agent";
import { compileStepJob } from "./promptSkillCompiler";
import { ensureSourceAuditCheckpoint } from "./sourceAuditCheckpoint";
import type { StateStore } from "./state";
import { ensureStepArtifactScaffold } from "./stepArtifactScaffold";
import { createTaskWorkspace, deleteTaskWorkspace } from "./taskWorkspaces";
import { ensureWorkflowInventory } from "./workflowInventory";

type EventListener = (event: AgentEvent) => void;
type QuestionEventData = Record<string, unknown> & {
  question: string;
  choices: string[];
  allowFreeform: boolean;
  blockingReason: string;
  decisionContext?: HumanDecisionContext;
};

class HumanGatePauseError extends Error {
  constructor(readonly stepId: string) {
    super(`Step ${stepId} paused for human decision.`);
    this.name = "HumanGatePauseError";
  }
}

interface StepSdkRunner {
  preflight?: CopilotSdkRunner["preflight"];
  runStep(
    job: Parameters<CopilotSdkRunner["runStep"]>[0],
    emit: AgentEventSink,
    waitForDecision?: HumanDecisionWaiter
  ): Promise<SdkRunResult>;
}

export class MigrationOrchestrator {
  private readonly listeners = new Map<string, Set<EventListener>>();
  private readonly sdkRunner: StepSdkRunner;
  private readonly approvalBroker = new HumanApprovalBroker();
  private readonly autorunningTasks = new Set<string>();
  private readonly activeStepRuns = new Set<string>();

  constructor(
    private readonly config: AppConfig,
    private readonly store: StateStore,
    private readonly steps: MigrationStepDefinition[],
    sdkRunner?: StepSdkRunner
  ) {
    this.sdkRunner = sdkRunner ?? new CopilotSdkRunner(config);
  }

  async createTask(input: {
    name: string;
    workflowFileName: string;
    workflowJson: unknown;
  }) {
    await this.prepareExclusiveNewTask();

    const taskId = crypto.randomUUID();
    const layout = await createTaskWorkspace({
      workspaceRootPath: this.config.workspaceRoot,
      taskId,
      workflowFileName: input.workflowFileName
    });
    await fs.writeFile(layout.workflowPath, `${JSON.stringify(input.workflowJson, null, 2)}\n`, "utf8");

    const task = await this.store.createTask({
      id: taskId,
      name: input.name,
      workflowPath: layout.workflowPath,
      workspacePath: layout.root,
      artifactPath: layout.artifactPath,
      steps: this.steps
    });

    await this.store.appendArtifact({
      taskId,
      path: layout.workflowPath,
      relativePath: path.relative(layout.root, layout.workflowPath),
      kind: "workflow"
    });
    await this.store.appendArtifact({
      taskId,
      path: layout.packageManifestPath,
      relativePath: path.relative(layout.root, layout.packageManifestPath),
      kind: "json"
    });

    await this.emit({
      taskId,
      type: "progress",
      message: "Task workspace created.",
      data: {
        workflowPath: layout.workflowPath,
        artifactPath: layout.artifactPath,
        layout: {
          cacheDir: layout.cacheDir,
          outputsDir: layout.outputsDir,
          logsDir: layout.logsDir,
          packageManifestPath: layout.packageManifestPath
        }
      }
    });
    return task;
  }

  async createTaskFromWorkflowFile(input: { name: string; sourcePath: string }) {
    const workflowJson = JSON.parse(await fs.readFile(input.sourcePath, "utf8")) as unknown;
    return this.createTask({
      name: input.name,
      workflowFileName: path.basename(input.sourcePath),
      workflowJson
    });
  }

  async runStep(
    taskId: string,
    stepId: string,
    resumeContext?: Record<string, unknown>,
    options: { pauseOnHumanGate?: boolean } = {}
  ): Promise<void> {
    const runKey = this.stepRunKey(taskId, stepId);
    if (this.activeStepRuns.has(runKey)) {
      throw new Error(`Step is already running in this API process: ${taskId} ${stepId}`);
    }
    await this.reconcileStaleActiveTasks(
      "Before starting a migration step; stale running state from earlier server sessions must not block new work."
    );
    this.assertNoLiveStepRuns(`Start step ${stepId}`);
    const task = await this.store.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    const step = this.steps.find((item) => item.id === stepId);
    if (!step) throw new Error(`Step not found: ${stepId}`);
    const preRunArtifactCompletion = await checkRequiredArtifactCompletion(task, step);
    this.activeStepRuns.add(runKey);

    try {
    await this.store.updateStep(taskId, stepId, "running");
    await this.emit({
      taskId,
      stepId,
      type: "step_started",
      message: `Step ${stepId} ${step.name} started.`
    });

    const job = await compileStepJob({ config: this.config, task, step, resumeContext });
    const jobPath = path.join(task.artifactPath, `${stepId}-step-job.json`);
    await writeJson(jobPath, job);
    await this.emit({
      taskId,
      stepId,
      type: "artifact_created",
      message: `Compiled StepJob for step ${stepId}.`,
      data: { path: jobPath }
    });

    if (stepId === "00") {
      const intake = await ensureIntakePreflight({
        task,
        modelRoots: this.config.modelRoots,
        comfyuiRoot: this.config.comfyuiRoot
      });
      await this.store.appendArtifact({
        taskId,
        stepId,
        path: intake.artifactPath,
        relativePath: path.relative(task.workspacePath, intake.artifactPath),
        kind: "markdown"
      });
      await this.emit({
        taskId,
        stepId,
        type: "artifact_created",
        message: "Created deterministic Step 00 intake preflight artifact.",
        data: {
          path: intake.artifactPath,
          canContinueToFeasibility: intake.canContinueToFeasibility,
          hardStopCount: intake.hardStops.length
        }
      });
      const summary =
        intake.canContinueToFeasibility === "no"
          ? "Step 00 intake preflight completed with dependency-source gaps. Deep source search/download is deferred to Step 01 asset/custom-node resolution."
          : `Step 00 intake preflight completed: ${intake.canContinueToFeasibility}. Deep URL/custom-node source search is deferred to Step 01.`;
      await this.store.updateStep(taskId, stepId, "completed", { summary, error: undefined });
      await this.emit({
        taskId,
        stepId,
        type: "step_completed",
        message: summary,
        data: {
          blockingReason: intake.canContinueToFeasibility === "no" ? "missing_asset" : undefined,
          nextStep: "01",
          artifactPath: intake.artifactPath,
          hardStopCount: intake.hardStops.length,
          searchDeferredToStep: "01"
        }
      });
      return;
    }

    if (stepId === "01") {
      const prep = await ensureAssetPrep({
        task,
        modelRoots: this.config.modelRoots,
        comfyuiRoot: this.config.comfyuiRoot,
        stepId
      });
      await this.store.appendArtifact({
        taskId,
        stepId,
        path: prep.assetsPath,
        relativePath: path.relative(task.workspacePath, prep.assetsPath),
        kind: "log"
      });
      await this.store.appendArtifact({
        taskId,
        stepId,
        path: prep.customNodesPath,
        relativePath: path.relative(task.workspacePath, prep.customNodesPath),
        kind: "markdown"
      });
      await this.emit({
        taskId,
        stepId,
        type: "artifact_created",
        message: "Created deterministic Step 01 asset and custom-node resolution ledgers.",
        data: prep
      });
      if (prep.gapCount > 0) {
        const summary = `Step 01 asset/custom-node resolution found ${prep.gapCount} source-identical gap(s). Human direction is required before feasibility analysis.`;
        await this.store.updateStep(taskId, stepId, "waiting_for_human", { summary });
        await this.emit({
          taskId,
          stepId,
          type: "human_question",
          message: summary,
          data: {
            question:
              "Step 01 found missing source-identical assets/custom-node sources. Provide exact local paths/source notes, approve bounded smoke-only follow-up, or stop migration.",
            choices: [
              "Provide missing source-identical assets before feasibility",
              "Approve bounded smoke-only follow-up with documented gaps",
              "Stop migration at Step 01"
            ],
            allowFreeform: true,
            blockingReason: "missing_asset",
            artifactPath: path.relative(task.workspacePath, prep.assetsPath),
            details: [
              `${prep.modelCount} model references checked`,
              `${prep.customNodeCount} custom-node source hints checked`,
              `${prep.gapCount} documented gap(s) in 01-assets.csv`
            ]
          }
        });
        return;
      }
      await this.emit({
        taskId,
        stepId,
        type: "progress",
        message: `Step 01 deterministic ledgers are ready: ${prep.modelCount} model references, ${prep.customNodeCount} custom-node source hints, no documented gaps. Continuing to SDK agent processing.`,
        data: prep
      });
    }

    if (stepId === "02") {
      const feasibility = await ensureFeasibility({
        task,
        modelRoots: this.config.modelRoots,
        stepId
      });
      await this.store.appendArtifact({
        taskId,
        stepId,
        path: feasibility.artifactPath,
        relativePath: path.relative(task.workspacePath, feasibility.artifactPath),
        kind: "markdown"
      });
      await this.emit({
        taskId,
        stepId,
        type: "artifact_created",
        message: "Created deterministic Step 02 feasibility artifact.",
        data: feasibility
      });
      if (await this.pauseIfArtifactHumanGate(task, step)) return;
      await this.emit({
        taskId,
        stepId,
        type: "progress",
        message: `Step 02 deterministic feasibility precheck is ready: ${feasibility.criticalGapCount} critical source-identical gaps. Continuing to SDK agent processing.`,
        data: feasibility
      });
    }

    if (stepId === "03") {
      const inventory = await ensureWorkflowInventory(task, stepId);
      await this.store.appendArtifact({
        taskId,
        stepId,
        path: inventory.artifactPath,
        relativePath: path.relative(task.workspacePath, inventory.artifactPath),
        kind: "markdown"
      });
      await this.emit({
        taskId,
        stepId,
        type: "artifact_created",
        message: "Created deterministic Step 03 workflow inventory artifact.",
        data: inventory
      });
      const summary = `Step 03 deterministic workflow inventory completed: ${inventory.nodeCount} nodes, ${inventory.linkCount} links.`;
      await this.store.updateStep(taskId, stepId, "completed", { summary, error: undefined });
      await this.emit({
        taskId,
        stepId,
        type: "step_completed",
        message: summary,
        data: inventory
      });
      return;
    }

    if (stepId === "05" && await this.pauseEnvironmentDeploymentOnAssetGaps(task, step)) {
      return;
    }

    if (stepId !== "00" && stepId !== "01" && stepId !== "02" && stepId !== "03" && stepId !== "04") {
      const scaffold = await ensureStepArtifactScaffold(task, step);
      if (scaffold.path) {
        await this.store.appendArtifact({
          taskId,
          stepId,
          path: scaffold.path,
          relativePath: scaffold.relativePath ?? path.relative(task.workspacePath, scaffold.path),
          kind: scaffold.path.endsWith(".json")
            ? "json"
            : scaffold.path.endsWith(".csv")
              ? "log"
              : "markdown"
        });
        await this.emit({
          taskId,
          stepId,
          type: "artifact_created",
          message: scaffold.created
            ? `Created Step ${stepId} in-progress artifact scaffold.`
            : `Step ${stepId} artifact scaffold already exists.`,
          data: scaffold
        });
      }
    }

    if (stepId === "04") {
      const checkpoint = await ensureSourceAuditCheckpoint({
        task,
        comfyuiRoot: this.config.comfyuiRoot
      });
      if (checkpoint.created) {
        await this.store.appendArtifact({
          taskId,
          stepId,
          path: checkpoint.path,
          relativePath: path.relative(task.workspacePath, checkpoint.path),
          kind: "markdown"
        });
        await this.emit({
          taskId,
          stepId,
          type: "artifact_created",
          message: "Created Step 04 source-audit checkpoint before deep SDK analysis.",
          data: checkpoint
        });
      }
    }

    if (stepId === "07") {
      const aggregate = await ensureBranchSmokeAggregate(task);
      if (aggregate.created) {
        await this.store.appendArtifact({
          taskId,
          stepId,
          path: aggregate.path,
          relativePath: path.relative(task.workspacePath, aggregate.path),
          kind: "markdown"
        });
        await this.emit({
          taskId,
          stepId,
          type: "artifact_created",
          message: "Created Step 07 first-stage smoke aggregate from branch evidence.",
          data: aggregate
        });
      }
    }

    if (await this.pauseIfArtifactHumanGate(task, step)) return;

    if (preRunArtifactCompletion.complete) {
      const summary = `Step ${stepId} completed from existing required artifact. ${preRunArtifactCompletion.reason}`;
      await this.store.updateStep(taskId, stepId, "completed", { summary, error: undefined });
      await this.emit({
        taskId,
        stepId,
        type: "step_completed",
        message: summary,
        data: preRunArtifactCompletion
      });
      return;
    }

      const result = await this.sdkRunner.runStep(job, async (event) => {
        return this.emit(event);
      }, async (event) => {
        await this.store.updateStep(taskId, stepId, "waiting_for_human");
        await this.emit({
          taskId,
          stepId,
          type: "progress",
          message: `Step ${stepId} is waiting for a web human decision.`
        });
        if (options.pauseOnHumanGate) {
          throw new HumanGatePauseError(stepId);
        }
        const decision = await this.approvalBroker.waitForDecision(event);
        await this.store.updateStep(taskId, stepId, "running");
        return decision;
      });
      const summary = result.summary ?? "Copilot SDK session completed without a final assistant summary.";
      if (await this.pauseIfArtifactHumanGate(task, step)) return;
      if (stepId === "13") {
        const artifactCompletion = await checkRequiredArtifactCompletion(task, step);
        if (!artifactCompletion.complete) {
          throw new Error(`Step 13 self-evolution evidence is incomplete. ${artifactCompletion.reason}`);
        }
      }
      await this.store.updateStep(taskId, stepId, "completed", { summary });
      await this.emit({
        taskId,
        stepId,
        type: "step_completed",
        message: summary,
        data: result
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (error instanceof HumanGatePauseError) {
        await this.emit({
          taskId,
          stepId,
          type: "progress",
          message: `Auto-run paused at Step ${stepId} for human input.`
        });
        return;
      }
      if (error instanceof SdkStepTimeoutError) {
        if (await this.pauseIfArtifactHumanGate(task, step, message)) return;
        const artifactCompletion = await checkRequiredArtifactCompletion(task, step);
        if (artifactCompletion.complete) {
          const summary = `Step ${stepId} completed by required artifact after SDK watchdog timeout. ${artifactCompletion.reason}`;
          await this.store.updateStep(taskId, stepId, "completed", { summary });
          await this.emit({
            taskId,
            stepId,
            type: "step_completed",
            message: summary,
            data: { timeout: message, artifactCompletion }
          });
          return;
        }
      }
      const hasOpenHumanQuestion = (await this.store.listEvents(taskId)).some(
        (event) => event.stepId === stepId && event.type === "human_question"
      );
      if (hasOpenHumanQuestion) {
        await this.store.updateStep(taskId, stepId, "waiting_for_human", { error: message });
        await this.emit({
          taskId,
          stepId,
          type: "progress",
          message: `Step ${stepId} paused for human input: ${message}`
        });
      } else {
        await this.store.updateStep(taskId, stepId, "failed", { error: message });
        await this.emit({
          taskId,
          stepId,
          type: "step_failed",
          message
        });
      }
      throw error;
    } finally {
      this.activeStepRuns.delete(runKey);
    }
  }

  async runUntilGate(taskId: string): Promise<void> {
    if (this.autorunningTasks.has(taskId)) {
      throw new Error(`Task is already auto-running: ${taskId}`);
    }
    await this.reconcileStaleActiveTasks(
      "Before auto-running a migration task; stale running state from earlier server sessions must be closed."
    );
    this.assertNoLiveStepRuns("Auto-run migration task");
    this.autorunningTasks.add(taskId);
    try {
      await this.emit({
        taskId,
        type: "progress",
        message: "Auto-run started. The task will pause at human gates, hard stops, failures, or completion."
      });
      while (true) {
        const task = await this.store.getTask(taskId);
        if (!task) throw new Error(`Task not found: ${taskId}`);
        const blockingStep = task.steps.find((step) =>
          ["running", "waiting_for_human", "failed", "hard_stopped", "terminated"].includes(
            step.status
          )
        );
        if (blockingStep) {
          await this.emit({
            taskId,
            stepId: blockingStep.id,
            type: "progress",
            message: `Auto-run stopped at Step ${blockingStep.id}: ${blockingStep.status}.`
          });
          return;
        }
        const nextStep = this.steps.find((step) => {
          const state = task.steps.find((item) => item.id === step.id);
          return !state || state.status !== "completed";
        });
        if (!nextStep) {
          await this.emit({
            taskId,
            type: "step_completed",
            message: "Auto-run reached the end of the migration flow."
          });
          return;
        }
        try {
          await this.runStep(taskId, nextStep.id, undefined, { pauseOnHumanGate: true });
        } catch (error) {
          await this.emit({
            taskId,
            stepId: nextStep.id,
            type: "progress",
            message: `Auto-run stopped after Step ${nextStep.id}: ${
              error instanceof Error ? error.message : String(error)
            }`
          });
          return;
        }
      }
    } finally {
      this.autorunningTasks.delete(taskId);
    }
  }

  async runPhase1Agent(taskId: string): Promise<void> {
    const runKey = this.stepRunKey(taskId, "phase1");
    if (this.activeStepRuns.has(runKey)) {
      throw new Error(`Phase 1 agent is already running for task: ${taskId}`);
    }
    await this.reconcileStaleActiveTasks(
      "Before starting the Phase 1 monolithic agent; stale running state from earlier server sessions must not block new work."
    );
    this.assertNoLiveStepRuns("Run Phase 1 monolithic agent");
    const task = await this.store.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    const decisions = await this.store.listDecisions(taskId);
    const phase1 = await preparePhase1Driver({
      config: this.config,
      task,
      steps: this.steps,
      decisions
    });
    const contextBudget = new ContextBudgetTracker({
      budgetPath: phase1.contextBudgetPath,
      trackedPaths: [
        phase1.promptPath,
        phase1.taskStatePath,
        phase1.runningSummaryPath,
        phase1.contextDebtPath,
        phase1.phase3ExtractionPath,
        phase1.stepHandoffDir
      ]
    });

    const activeStepId = this.firstPhase1StepToMarkRunning(task);
    this.activeStepRuns.add(runKey);
    try {
      if (activeStepId) {
        await this.store.updateStep(taskId, activeStepId, "running");
      }
      for (const artifactPath of [
        phase1.taskStatePath,
        phase1.promptPath,
        phase1.runningSummaryPath,
        phase1.contextDebtPath,
        phase1.phase3ExtractionPath,
        phase1.contextBudgetPath
      ]) {
        await this.store.appendArtifact({
          taskId,
          stepId: "phase1",
          path: artifactPath,
          relativePath: path.relative(task.workspacePath, artifactPath),
          kind: artifactPath.endsWith(".json")
            ? "json"
            : artifactPath.endsWith(".md")
              ? "markdown"
              : "other"
        });
      }
      await this.emit({
        taskId,
        stepId: "phase1",
        type: "artifact_created",
        message: "Prepared Phase 1 monolithic driver state, prompt, and compaction artifacts.",
        data: {
          taskStatePath: phase1.taskStatePath,
          promptPath: phase1.promptPath,
          runningSummaryPath: phase1.runningSummaryPath,
          contextDebtPath: phase1.contextDebtPath,
          phase3ExtractionPath: phase1.phase3ExtractionPath,
          contextBudgetPath: phase1.contextBudgetPath,
          stepHandoffDir: phase1.stepHandoffDir
        }
      });
      const initialBudget = await contextBudget.writeSnapshot("phase1_start");
      await this.emitContextBudgetAlert(taskId, initialBudget, contextBudget);
      await this.emit({
        taskId,
        stepId: "phase1",
        type: "progress",
        message:
          "Phase 1 monolithic Copilot agent started. It will update task-state.json and phase1-context artifacts after each step."
      });

      let lastPhase1SyncAt = 0;
      let phase1SyncInFlight = false;
      const syncPhase1Progress = async () => {
        const now = Date.now();
        if (phase1SyncInFlight || now - lastPhase1SyncAt < 10_000) return;
        lastPhase1SyncAt = now;
        phase1SyncInFlight = true;
        try {
          await this.syncPhase1TaskState(taskId);
          const snapshot = await contextBudget.writeSnapshot("periodic_phase1_sync");
          await this.emitContextBudgetAlert(taskId, snapshot, contextBudget);
        } catch (syncError) {
          await this.emit({
            taskId,
            stepId: "phase1",
            type: "progress",
            message: `Phase 1 periodic task-state sync skipped: ${
              syncError instanceof Error ? syncError.message : String(syncError)
            }`
          });
        } finally {
          phase1SyncInFlight = false;
        }
      };

      const result = await this.sdkRunner.runStep(
        phase1.job,
        async (event) => {
          const record = await this.emit(event);
          const snapshot = await contextBudget.recordSdkEvent(event);
          if (snapshot) {
            await this.emitContextBudgetAlert(taskId, snapshot, contextBudget);
            if (snapshot.level === "critical") {
              throw new ContextBudgetExceededError(snapshot);
            }
          }
          await syncPhase1Progress();
          return record;
        },
        async (event) => this.approvalBroker.waitForDecision(event)
      );
      const synced = await this.syncPhase1TaskState(taskId);
      const finalBudget = await contextBudget.writeSnapshot("phase1_session_completed");
      await this.emitContextBudgetAlert(taskId, finalBudget, contextBudget);
      const exposedGate = await this.emitPhase1HumanGateIfNeeded(taskId);
      await this.emit({
        taskId,
        stepId: "phase1",
        type: "step_summary",
        message: result.summary ?? "Phase 1 monolithic Copilot agent completed.",
        data: {
          sessionId: result.sessionId,
          sessionArtifacts: result.sessionArtifacts,
          syncedSteps: synced,
          exposedHumanGate: exposedGate
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (error instanceof ContextBudgetExceededError) {
        await contextBudget.writeSnapshot("phase1_context_budget_pause");
        await this.syncPhase1TaskState(taskId).catch(() => []);
        await this.pausePhase1ForContextBudget(taskId, error.snapshot);
        return;
      }
      try {
        await this.syncPhase1TaskState(taskId);
      } catch (syncError) {
        await this.emit({
          taskId,
          stepId: "phase1",
          type: "progress",
          message: `Phase 1 task-state sync failed after agent error: ${
            syncError instanceof Error ? syncError.message : String(syncError)
          }`
        });
      }
      const refreshed = await this.store.getTask(taskId);
      const stillRunning = refreshed?.steps.find((step) => step.status === "running");
      if (stillRunning) {
        await this.store.updateStep(taskId, stillRunning.id, "failed", { error: message });
      }
      await this.emit({
        taskId,
        stepId: "phase1",
        type: "step_failed",
        message
      });
      throw error;
    } finally {
      this.activeStepRuns.delete(runKey);
    }
  }

  async recordHumanDecision(input: {
    taskId: string;
    stepId?: string;
    questionEventId: string;
    answer: string;
    wasFreeform: boolean;
  }): Promise<{ decision: HumanDecision; resumedLiveSession: boolean }> {
    const rawDecision: HumanDecision = {
      ...input,
      decidedAt: new Date().toISOString()
    };
    const decision: HumanDecision = {
      ...rawDecision,
      answer: redactSensitiveText(rawDecision.answer)
    };
    await this.store.appendDecision(decision);
    const phase1RunActive = this.activeStepRuns.has(this.stepRunKey(input.taskId, "phase1"));
    const deterministicGateHandled = phase1RunActive
      ? false
      : await this.applyDeterministicGateDecision(rawDecision);
    const resumedLiveSession =
      deterministicGateHandled || this.approvalBroker.resolveDecision(rawDecision);
    await this.emit({
      taskId: input.taskId,
      stepId: input.stepId,
      type: "progress",
      message: resumedLiveSession
        ? deterministicGateHandled
          ? "Human decision recorded and applied to deterministic gate."
          : "Human decision recorded and delivered to active SDK session."
        : "Human decision recorded for next resume.",
      data: { ...decision, resumedLiveSession }
    });
    return { decision, resumedLiveSession: resumedLiveSession };
  }

  private firstPhase1StepToMarkRunning(task: MigrationTask): string | undefined {
    const blocked = task.steps.find((step) =>
      ["running", "waiting_for_human", "failed", "hard_stopped", "terminated"].includes(step.status)
    );
    if (blocked) return undefined;
    return this.steps.find((step) => {
      const state = task.steps.find((item) => item.id === step.id);
      return !state || state.status === "pending";
    })?.id;
  }

  private async syncPhase1TaskState(taskId: string): Promise<string[]> {
    const task = await this.store.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    const phase1State = await readPhase1TaskState(task);
    const synced: string[] = [];
    for (const phase1Step of phase1State.steps) {
      const current = task.steps.find((step) => step.id === phase1Step.id);
      if (!current) continue;
      const normalizedStatus = normalizePhase1StepStatus(phase1Step.status);
      const status =
        phase1State.status === "running" &&
        phase1State.current_step_id === phase1Step.id &&
        normalizedStatus === "pending"
          ? "running"
          : normalizedStatus;
      if (current.status === status && current.summary === phase1Step.summary) continue;
      await this.store.updateStep(taskId, current.id, status, {
        summary: phase1Step.summary,
        error: status === "failed" || status === "hard_stopped" ? phase1Step.summary : undefined
      });
      synced.push(`${current.id}:${status}`);
    }
    await this.emit({
      taskId,
      stepId: "phase1",
      type: "progress",
      message: synced.length
        ? `Synced Phase 1 task-state step statuses: ${synced.join(", ")}.`
        : "Phase 1 task-state sync found no step status changes.",
      data: { synced, phase1Status: phase1State.status, currentStepId: phase1State.current_step_id }
    });
    return synced;
  }

  private async emitPhase1HumanGateIfNeeded(taskId: string): Promise<boolean> {
    const task = await this.store.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    const phase1State = await readPhase1TaskState(task);
    if (phase1State.status !== "waiting_for_human") return false;

    const gatedStep =
      phase1State.steps.find((step) => step.id === phase1State.current_step_id) ??
      phase1State.steps.find((step) => step.status === "waiting_for_human");
    if (!gatedStep) return false;

    const gate = phase1HumanGateFromStep(gatedStep);
    if (!gate) return false;

    const decisions = await this.store.listDecisions(taskId);
    if (decisions.some((decision) => decision.questionEventId === gate.gateId)) return false;

    const events = await this.store.listEvents(taskId);
    const alreadyExposed = events.some((event) => {
      const data = event.data as Record<string, unknown> | undefined;
      return event.type === "human_question" && data?.phase1GateId === gate.gateId;
    });
    if (alreadyExposed) return false;

    await this.emit({
      taskId,
      stepId: gatedStep.id,
      type: "human_question",
      message: gate.problemSummary,
      data: {
        question: gate.question,
        choices: gate.choices,
        allowFreeform: true,
        blockingReason: phase1BlockingReasonForStep(gatedStep.id),
        phase1GateId: gate.gateId,
        artifactPaths: gate.artifactPaths,
        claimBoundaryImpact: gate.claimBoundaryImpact,
        decisionContext: gate.decisionContext
      }
    });
    return true;
  }

  private async emitContextBudgetAlert(
    taskId: string,
    snapshot: ContextBudgetSnapshot,
    tracker: ContextBudgetTracker
  ): Promise<void> {
    if (!tracker.shouldAlert(snapshot)) return;
    await this.emit({
      taskId,
      stepId: "phase1",
      type: "progress",
      message:
        snapshot.level === "critical"
          ? "Phase 1 context budget is critical; pausing at a checkpoint before the SDK session overflows."
          : "Phase 1 context budget warning; compact checkpoint should be written before the next step.",
      data: snapshot
    });
  }

  private async pausePhase1ForContextBudget(
    taskId: string,
    snapshot: ContextBudgetSnapshot
  ): Promise<void> {
    const task = await this.store.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    const runningStep = task.steps.find((step) => step.status === "running");
    const stepId = runningStep?.id ?? "phase1";
    const summary =
      "Phase 1 paused at a context checkpoint before the monolithic SDK session could overflow. Resume Phase 1 to continue from task-state.json and phase1-context artifacts in a fresh SDK session.";
    if (runningStep) {
      await this.store.updateStep(taskId, runningStep.id, "waiting_for_human", { summary });
    }
    await this.emit({
      taskId,
      stepId,
      type: "human_question",
      message: summary,
      data: {
        question:
          "Context budget reached the critical threshold. Resume Phase 1 from the compact state in a fresh SDK session, or stop here for manual inspection.",
        choices: ["Resume Phase 1 from compact checkpoint", "Stop and inspect context artifacts"],
        allowFreeform: true,
        blockingReason: "capacity_policy",
        artifactPath: "artifacts/phase1-context/context-budget.json",
        details: [
          `estimated_tokens: ${snapshot.estimatedContextTokens}`,
          `critical_tokens: ${snapshot.limits.criticalEstimatedTokens}`,
          `sdk_events: ${snapshot.sdkEventCount}`,
          `critical_events: ${snapshot.limits.criticalSdkEvents}`
        ],
        decisionContext: {
          formatVersion: "human-gate-v1",
          backgroundReasonScene:
            "The backend detected that the long Phase 1 SDK session is near the configured context budget. Continuing in the same session risks losing instructions or overflowing the model context.",
          terminology: [
            {
              term: "context budget",
              explanation:
                "An estimated limit based on prompt/artifact size and SDK event volume used to decide when a long agent session should checkpoint and restart."
            },
            {
              term: "compact checkpoint",
              explanation:
                "The durable state files task-state.json, running-summary.md, context-debt.json, phase3-extraction-candidates.json, and step handoffs used to resume without relying on chat history."
            }
          ],
          consequencesAndFollowUp: [
            {
              choice: "Resume Phase 1 from compact checkpoint",
              consequence:
                "The current long SDK session is abandoned and the next Phase 1 run starts with a fresh model context.",
              followUp:
                "Run Phase 1 again; the backend will rebuild the driver prompt from task-state.json and phase1-context artifacts."
            },
            {
              choice: "Stop and inspect context artifacts",
              consequence:
                "The migration remains paused and no new step work starts.",
              followUp:
                "Inspect context-budget.json, running-summary.md, task-state.json, and step handoffs before resuming."
            }
          ]
        }
      }
    });
  }

  async startApprovalProbe(taskId: string, stepId?: string): Promise<AgentEvent> {
    const task = await this.store.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    const question = await this.emit({
      taskId,
      stepId,
      type: "human_question",
      message: "Approval probe: choose Approve once to verify web-mediated agent approval.",
      data: {
        question: "Approval probe: choose Approve once to verify web-mediated agent approval.",
        choices: ["Approve once", "Reject"],
        allowFreeform: true,
        blockingReason: "permission"
      }
    });
    void this.approvalBroker
      .waitForDecision(question, 2 * 60 * 1000)
      .then((decision) =>
        this.emit({
          taskId,
          stepId,
          type: "progress",
          message: `Approval probe resolved with: ${decision.answer}`,
          data: decision
        })
      )
      .catch((error: unknown) =>
        this.emit({
          taskId,
          stepId,
          type: "step_failed",
          message: error instanceof Error ? error.message : String(error)
        })
      );
    return question;
  }

  async resumeStep(taskId: string, stepId: string): Promise<void> {
    const decisions = await this.store.listDecisions(taskId);
    await this.runStep(taskId, stepId, {
      humanDecisions: decisions.filter((decision) => decision.stepId === stepId)
    });
  }

  private async applyDeterministicGateDecision(decision: HumanDecision): Promise<boolean> {
    if (!decision.stepId) return false;
    const task = await this.store.getTask(decision.taskId);
    const step = task?.steps.find((item) => item.id === decision.stepId);
    if (!task || step?.status !== "waiting_for_human") return false;
    const stepDefinition = this.steps.find((item) => item.id === decision.stepId);
    if (!stepDefinition) return false;

    if (decision.stepId !== "00") {
      const artifactGate = await checkRequiredArtifactGate(task, stepDefinition);
      if (!artifactGate.gated) return false;
    }

    if (isStopDecision(decision.answer)) {
      const message = `Operator stopped migration at Step ${decision.stepId} after human gate.`;
      await this.store.updateStep(decision.taskId, decision.stepId, "hard_stopped", {
        error: message
      });
      await this.emit({
        taskId: decision.taskId,
        stepId: decision.stepId,
        type: "hard_stop",
        message,
        data: { decision: { ...decision, answer: redactSensitiveText(decision.answer) } }
      });
      return true;
    }

    if (decision.stepId !== "00" && isActionableGateContext(decision.answer, decision.wasFreeform)) {
      await this.acceptHumanGateContext({ task, stepDefinition, decision });
      return true;
    }

    if (isContinueDecision(decision.answer)) {
      const summary = decision.stepId === "00"
        ? "Step 00 completed with human-approved bounded smoke-only follow-up. Blocking dependency-source gaps remain documented in 00-intake-preflight.md."
        : `Step ${decision.stepId} completed with human-approved continuation under documented risk/gaps.`;
      await this.store.updateStep(decision.taskId, decision.stepId, "completed", {
        summary,
        error: undefined
      });
      await this.emit({
        taskId: decision.taskId,
        stepId: decision.stepId,
        type: "step_completed",
        message: summary,
        data: {
          decision: { ...decision, answer: redactSensitiveText(decision.answer) },
          boundary: "documented risk/gaps; no source-identical claim"
        }
      });
      return true;
    }

    if (decision.stepId === "00") {
      const questionData = await this.buildStep00FollowupQuestionData(task, decision.answer);
      await this.emit({
        taskId: decision.taskId,
        stepId: decision.stepId,
        type: "human_question",
        message: questionData.question,
        data: questionData
      });
    } else {
      await this.emit({
        taskId: decision.taskId,
        stepId: decision.stepId,
        type: "human_question",
        message:
          `Step ${decision.stepId} still needs missing context before continuing. Type the required context, choose Continue with documented risk/gaps, or stop at this gate.`,
        data: {
          question:
            `Step ${decision.stepId} still needs missing context before continuing. What should the agent use next?`,
          choices: [
            "Continue with documented risk/gaps",
            "Stop at this gate",
            "Provide missing context before continuing"
          ],
          allowFreeform: true,
          blockingReason: "quality_review"
        }
      });
    }
    return true;
  }

  private async acceptHumanGateContext(input: {
    task: MigrationTask;
    stepDefinition: MigrationStepDefinition;
    decision: HumanDecision;
  }): Promise<void> {
    const { task, stepDefinition, decision } = input;
    if (!decision.stepId) throw new Error("Cannot accept human gate context without a step id.");
    const stepId = decision.stepId;
    const contextKind = stepId === "01" ? "source instructions" : "operator context";
    const artifactName =
      stepId === "01"
        ? "01-human-source-instructions.md"
        : `${stepId}-human-context.md`;
    const artifactPath = path.join(task.artifactPath, artifactName);
    const redactedAnswer = redactSensitiveText(decision.answer);
    await fs.writeFile(
      artifactPath,
      [
        `# Step ${stepId} human-provided ${contextKind}`,
        "",
        "orchestrator_status: human_context_received",
        "",
        `task_id: \`${task.id}\``,
        `step_id: \`${stepId}\``,
        `step_name: \`${stepDefinition.name}\``,
        `question_event_id: \`${decision.questionEventId}\``,
        `decided_at: \`${decision.decidedAt}\``,
        "",
        "## Operator-provided context",
        "",
        "```text",
        redactedAnswer,
        "```",
        "",
        "## Boundary",
        "",
        "Credentials and private tokens are redacted and are not persisted in task state or artifacts.",
        stepId === "01"
          ? "This step records actionable source locations/instructions for the acquisition phase; it does not claim source-identical assets are already staged."
          : "This step records operator context for the gate; it does not claim validation success beyond the existing artifact evidence.",
        ""
      ].join("\n"),
      "utf8"
    );
    await this.store.appendArtifact({
      taskId: decision.taskId,
      stepId,
      path: artifactPath,
      relativePath: path.relative(task.workspacePath, artifactPath),
      kind: "markdown"
    });
    await this.emit({
      taskId: decision.taskId,
      stepId,
      type: "artifact_created",
      message: `Recorded redacted Step ${stepId} human ${contextKind}.`,
      data: {
        path: artifactPath,
        redacted: redactedAnswer !== decision.answer
      }
    });
    let step01Acquisition:
      | Awaited<ReturnType<typeof ensureAssetAcquisitionJob>>
      | undefined;
    if (stepId === "01") {
      step01Acquisition = await ensureAssetAcquisitionJob({
        task,
        modelRoots: this.config.modelRoots,
        comfyuiRoot: this.config.comfyuiRoot,
        humanContext: decision.answer,
        redactedHumanContext: redactedAnswer,
        modelRepoPath: path.resolve(this.config.projectRoot, "../model_repo"),
        stepId
      });
      await this.store.appendArtifact({
        taskId: decision.taskId,
        stepId,
        path: step01Acquisition.jobPath,
        relativePath: path.relative(task.workspacePath, step01Acquisition.jobPath),
        kind: "json"
      });
      await this.store.appendArtifact({
        taskId: decision.taskId,
        stepId,
        path: step01Acquisition.reportPath,
        relativePath: path.relative(task.workspacePath, step01Acquisition.reportPath),
        kind: "markdown"
      });
      await this.emit({
        taskId: decision.taskId,
        stepId,
        type: "artifact_created",
        message: "Executed Step 01 asset acquisition job local-search phase.",
        data: {
          jobPath: step01Acquisition.jobPath,
          reportPath: step01Acquisition.reportPath,
          status: step01Acquisition.status,
          resolvedCount: step01Acquisition.resolvedCount,
          unresolvedCount: step01Acquisition.unresolvedCount,
          pendingDownloadCount: step01Acquisition.pendingDownloadCount
        }
      });
    }
    const summary =
      step01Acquisition?.status === "waiting_for_secure_download"
        ? `Step 01 asset acquisition job searched local roots and still has ${step01Acquisition.unresolvedCount} unresolved source-identical asset(s). Secure download or local staging is required before feasibility.`
        : stepId === "01"
        ? "Step 01 accepted human-provided asset/custom-node source instructions. Continue to feasibility with documented acquisition context; source-identical staging is still tracked in 01-assets.csv."
        : `Step ${stepId} accepted human-provided context and completed the gate with documented operator input.`;
    const nextStatus = step01Acquisition?.status === "waiting_for_secure_download"
      ? "waiting_for_human"
      : "completed";
    await this.store.updateStep(decision.taskId, stepId, nextStatus, {
      summary,
      error: undefined
    });
    if (nextStatus === "waiting_for_human" && step01Acquisition) {
      await this.emit({
        taskId: decision.taskId,
        stepId,
        type: "human_question",
        message: summary,
        data: {
          question:
            "Step 01 created an asset acquisition job and completed local search, but unresolved assets remain. Provide exact local staged files, approve continuing with documented gaps, or stop migration.",
          choices: [
            "Provide exact local staged files for unresolved assets",
            "Approve bounded smoke-only follow-up with documented gaps",
            "Stop migration at Step 01"
          ],
          allowFreeform: true,
          blockingReason: "missing_asset",
          artifactPath: path.relative(task.workspacePath, step01Acquisition.reportPath),
          details: [
            `resolved_or_already_staged: ${step01Acquisition.resolvedCount}`,
            `unresolved: ${step01Acquisition.unresolvedCount}`,
            `pending_secure_download: ${step01Acquisition.pendingDownloadCount}`
          ]
        }
      });
      return;
    }
    await this.emit({
      taskId: decision.taskId,
      stepId,
      type: "step_completed",
      message: summary,
      data: {
        decision: { ...decision, answer: redactedAnswer },
        humanContextArtifact: path.relative(task.workspacePath, artifactPath),
        acquisitionJobArtifact: step01Acquisition
          ? path.relative(task.workspacePath, step01Acquisition.jobPath)
          : undefined,
        boundary:
          stepId === "01"
            ? "source instructions accepted; no source-identical success claim yet"
            : "operator context accepted; no additional validation success claim"
      }
    });
  }

  async terminateWithHardStop(input: {
    taskId: string;
    stepId?: string;
    reason: string;
    improvementStrategy?: string;
  }) {
    const task = await this.store.getTask(input.taskId);
    if (!task) throw new Error(`Task not found: ${input.taskId}`);
    const now = new Date().toISOString();
    const strategy =
      input.improvementStrategy?.trim() ||
      "Review missing inputs, prompt/skill gaps, environment blockers, and retry from the last evidence-backed step.";
    const reportPath = path.join(
      task.artifactPath,
      input.stepId ? `${input.stepId}-hard-stop-report.md` : "hard-stop-report.md"
    );
    const content = [
      "# Migration hard stop report",
      "",
      `task_id: ${task.id}`,
      `step_id: ${input.stepId ?? "task"}`,
      `created_at: ${now}`,
      "",
      "## Reason",
      "",
      input.reason,
      "",
      "## Improvement strategy",
      "",
      strategy,
      "",
      "## Boundary",
      "",
      "No later migration step should claim success beyond the evidence available before this hard stop."
    ].join("\n");
    await fs.writeFile(reportPath, `${content}\n`, "utf8");
    if (input.stepId) {
      await this.store.updateStep(input.taskId, input.stepId, "hard_stopped", {
        error: input.reason
      });
    }
    await this.store.appendArtifact({
      taskId: input.taskId,
      stepId: input.stepId,
      path: reportPath,
      relativePath: path.relative(task.workspacePath, reportPath),
      kind: "markdown"
    });
    await this.emit({
      taskId: input.taskId,
      stepId: input.stepId,
      type: "hard_stop",
      message: input.reason,
      data: { reportPath, improvementStrategy: strategy }
    });
    return { taskId: input.taskId, stepId: input.stepId, reason: input.reason, improvementStrategy: strategy, artifactPath: reportPath, createdAt: now };
  }

  async createReflectionProposal(taskId: string) {
    const task = await this.store.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    const events = await this.store.listEvents(taskId);
    const decisions = await this.store.listDecisions(taskId);
    const reportPath = path.join(task.artifactPath, "reflection-proposal.md");
    const content = [
      "# Prompt/skill reflection proposal",
      "",
      `task_id: ${task.id}`,
      `created_at: ${new Date().toISOString()}`,
      "",
      "## Inputs reviewed",
      "",
      `- events: ${events.length}`,
      `- human decisions: ${decisions.length}`,
      "",
      "## Proposed improvements",
      "",
      "1. Review any human gate that occurred repeatedly and decide whether it should be added to the relevant prompt/skill hard-stop or checklist section.",
      "2. Review any failed or hard-stopped step and decide whether the prompt should ask for missing context earlier.",
      "3. Review generated artifacts and decide whether file naming, evidence, or GUI review requirements should be clarified.",
      "",
      "## Approval boundary",
      "",
      "This file is a proposal only. Do not modify shared prompt/skill docs automatically without user approval."
    ].join("\n");
    await fs.writeFile(reportPath, `${content}\n`, "utf8");
    await this.store.appendArtifact({
      taskId,
      path: reportPath,
      relativePath: path.relative(task.workspacePath, reportPath),
      kind: "markdown"
    });
    await this.emit({
      taskId,
      type: "reflection_proposed",
      message: "Reflection proposal generated.",
      data: { reportPath }
    });
    return { reportPath };
  }

  async preflightSdk() {
    if (this.sdkRunner.preflight) return this.sdkRunner.preflight();
    return new CopilotSdkRunner(this.config).preflight();
  }

  private async pauseIfArtifactHumanGate(
    task: MigrationTask,
    step: MigrationStepDefinition,
    detail?: string
  ): Promise<boolean> {
    const gate = await checkRequiredArtifactGate(task, step);
    if (!gate.gated) return false;
    const message = `Step ${step.id} reached a human decision gate. ${gate.reason}`;
    await this.store.updateStep(task.id, step.id, "waiting_for_human", {
      summary: message,
      error: detail
    });
    await this.emit({
      taskId: task.id,
      stepId: step.id,
      type: "human_question",
      message,
      data: {
        question: `${message} How should validation continue?`,
        choices: [
          "Continue with documented risk/gaps",
          "Stop at this gate",
          "Provide missing context before continuing"
        ],
        allowFreeform: true,
        blockingReason: step.id === "01" ? "capacity_policy" : "quality_review",
        artifactPath: gate.matchedPath
      }
    });
    return true;
  }

  private async pauseEnvironmentDeploymentOnAssetGaps(
    task: MigrationTask,
    step: MigrationStepDefinition
  ): Promise<boolean> {
    const assetsPath = path.join(task.artifactPath, "01-assets.csv");
    let assetsContent = "";
    try {
      assetsContent = await fs.readFile(assetsPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (!/source-identical asset not staged/i.test(assetsContent)) return false;

    const environmentPath = path.join(task.artifactPath, "05-environment.md");
    await fs.writeFile(
      environmentPath,
      [
        "# Step 05 Environment Deployment",
        "",
        "orchestrator_status: human_gate_reached",
        "",
        "## Status",
        "",
        "Environment deployment is blocked before SDK execution because Step 01 still documents source-identical asset gaps.",
        "",
        "No packages were installed, no ComfyUI environment was modified, no credentials were recorded, and no workflow nodes were bypassed.",
        "",
        "## Blocking evidence",
        "",
        "- `01-assets.csv` contains one or more `source-identical asset not staged` rows.",
        "- Continuing into install/runtime work would blur source-complete migration with smoke-only validation.",
        "",
        "## Required human decision",
        "",
        "Provide the missing source-identical assets, stop the migration here, or explicitly approve a bounded smoke-only environment attempt with documented gaps.",
        ""
      ].join("\n"),
      "utf8"
    );
    await this.store.appendArtifact({
      taskId: task.id,
      stepId: step.id,
      path: environmentPath,
      relativePath: path.relative(task.workspacePath, environmentPath),
      kind: "markdown"
    });
    const message =
      "Step 05 stopped before environment deployment because Step 01 still has source-identical asset gaps.";
    await this.store.updateStep(task.id, step.id, "waiting_for_human", {
      summary: message
    });
    await this.emit({
      taskId: task.id,
      stepId: step.id,
      type: "artifact_created",
      message: "Created Step 05 environment deployment gate artifact.",
      data: { path: environmentPath }
    });
    await this.emit({
      taskId: task.id,
      stepId: step.id,
      type: "human_question",
      message,
      data: {
        question:
          "Step 05 is blocked by source-identical asset gaps from Step 01. How should validation continue?",
        choices: [
          "Provide missing source-identical assets before Step 05",
          "Approve bounded smoke-only environment attempt with documented gaps",
          "Stop migration at Step 05"
        ],
        allowFreeform: true,
        blockingReason: "missing_asset",
        artifactPath: environmentPath
      }
    });
    return true;
  }

  private async buildStep00FollowupQuestionData(
    task: MigrationTask,
    previousAnswer: string
  ): Promise<QuestionEventData> {
    const artifactPath = path.join(task.artifactPath, "00-intake-preflight.md");
    const content = await fs.readFile(artifactPath, "utf8").catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
      throw error;
    });
    const details = step00DetailsFromArtifact(content);
    return {
      question:
        `Step 00 recorded your answer, but it still needs actionable source information before Step 01. Paste exact local file paths/source notes for the missing assets, approve bounded smoke-only follow-up, or stop migration.`,
      choices: [
        "Approve bounded smoke-only follow-up with documented gaps",
        "Stop migration at Step 00"
      ],
      allowFreeform: true,
      blockingReason: "missing_asset",
      artifactPath: "artifacts/00-intake-preflight.md",
      details: [
        `Previous answer: ${redactSensitiveText(previousAnswer)}`,
        ...details,
        "If providing assets, include exact local paths or approved source locations. Do not paste credentials."
      ]
    };
  }

  async reconcileStaleActiveTasks(
    reason = "Stale active task state cleaned up; no active SDK session is attached in this API process."
  ): Promise<Array<{ id: string; name: string; stepIds: string[] }>> {
    const tasks = await this.store.listTasks();
    const liveTaskIds = this.liveTaskIds();
    const cleaned: Array<{ id: string; name: string; stepIds: string[] }> = [];

    for (const task of tasks) {
      if (!hasPersistedActiveState(task) || liveTaskIds.has(task.id)) continue;

      const stepIds = task.steps.filter((step) => step.status === "running").map((step) => step.id);
      const updated = await this.store.terminateActiveTaskState(task.id, reason);
      if (!updated) continue;
      cleaned.push({ id: task.id, name: task.name, stepIds });
      await this.emit({
        taskId: task.id,
        type: "progress",
        message: `Cleaned up stale active task state: ${reason}`,
        data: { staleStepIds: stepIds }
      });
    }

    return cleaned;
  }

  private async prepareExclusiveNewTask(): Promise<void> {
    await this.reconcileStaleActiveTasks(
      "Before creating a new migration task; previous server sessions cannot keep SDK steps attached."
    );
    this.assertNoLiveStepRuns("Create a new migration task");

    const tasks = await this.store.listTasks();
    for (const task of tasks) {
      await deleteTaskWorkspace(this.config.workspaceRoot, task.workspacePath);
      await this.store.deleteTask(task.id);
    }
  }

  subscribe(taskId: string, listener: EventListener): () => void {
    const listeners = this.listeners.get(taskId) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(taskId, listeners);
    return () => listeners.delete(listener);
  }

  private async emit(event: Omit<AgentEvent, "id" | "createdAt">): Promise<AgentEvent> {
    const record = await this.store.appendEvent(normalizeHumanQuestionEvent(event));
    for (const listener of this.listeners.get(record.taskId) ?? []) {
      listener(record);
    }
    return record;
  }

  private stepRunKey(taskId: string, stepId: string): string {
    return `${taskId}:${stepId}`;
  }

  private liveTaskIds(): Set<string> {
    return new Set([...this.activeStepRuns].map((key) => key.split(":", 1)[0]));
  }

  private assertNoLiveStepRuns(action: string): void {
    if (this.activeStepRuns.size === 0) return;
    throw new Error(
      `${action} cannot continue while another migration step is actively running in this API process.`
    );
  }
}

function hasPersistedActiveState(task: MigrationTask): boolean {
  return task.status === "running" || task.steps.some((step) => step.status === "running");
}

function normalizeHumanQuestionEvent(
  event: Omit<AgentEvent, "id" | "createdAt">
): Omit<AgentEvent, "id" | "createdAt"> {
  if (event.type !== "human_question") return event;
  const data = isRecord(event.data) ? event.data : {};
  const question = stringValue(data.question) ?? event.message;
  const choices = stringArray(data.choices);
  const blockingReason = humanQuestionBlockingReason(data.blockingReason, event.stepId);
  const allowFreeform = typeof data.allowFreeform === "boolean" ? data.allowFreeform : true;
  const normalizedChoices =
    choices.length > 0 ? choices : ["Provide requested input", "Stop at this gate"];
  return {
    ...event,
    data: {
      ...data,
      question,
      choices: normalizedChoices,
      allowFreeform,
      blockingReason,
      decisionContext: normalizeDecisionContext({
        existing: data.decisionContext,
        stepId: event.stepId,
        question,
        choices: normalizedChoices,
        blockingReason,
        fallbackBackground: event.message,
        details: stringArray(data.details),
        claimBoundaryImpact: data.claimBoundaryImpact
      })
    }
  };
}

function normalizeDecisionContext(input: {
  existing: unknown;
  stepId?: string;
  question: string;
  choices: string[];
  blockingReason: HumanQuestion["blockingReason"];
  fallbackBackground: string;
  details: string[];
  claimBoundaryImpact?: unknown;
}): HumanDecisionContext {
  const existing = isRecord(input.existing) ? input.existing : undefined;
  const existingBackground =
    stringValue(existing?.backgroundReasonScene) ?? stringValue(existing?.background_reason_scene);
  const existingTerms = normalizeTerms(existing?.terminology);
  const existingConsequences = normalizeConsequences(
    existing?.consequencesAndFollowUp ?? existing?.consequences_and_follow_up
  );
  const background =
    existingBackground ??
    [
      input.fallbackBackground,
      input.details.length ? `Known details: ${input.details.slice(0, 4).join("; ")}.` : "",
      input.stepId ? `This decision blocks Step ${input.stepId} until an operator chooses a safe edge.` : ""
    ]
      .filter(Boolean)
      .join(" ");
  return {
    formatVersion: "human-gate-v1",
    backgroundReasonScene: background,
    terminology: dedupeTerms([...existingTerms, ...defaultHumanGateTerms(input.blockingReason)]),
    consequencesAndFollowUp:
      existingConsequences.length > 0
        ? existingConsequences
        : input.choices.map((choice) =>
            consequenceForChoice(choice, input.blockingReason, input.claimBoundaryImpact)
          )
  };
}

function defaultHumanGateTerms(reason: HumanQuestion["blockingReason"]): HumanDecisionContext["terminology"] {
  const common = [
    {
      term: "claim boundary",
      explanation:
        "The exact scope the agent is allowed to claim after the decision, such as smoke-only, full-size, source-identical, GUI-accepted, or customer-ready."
    },
    {
      term: "human gate",
      explanation:
        "A pause where the agent cannot safely choose between valid routes because the choice changes risk, evidence, credentials, cost, or delivery claims."
    }
  ];
  if (reason === "missing_asset") {
    return [
      {
        term: "source-identical asset",
        explanation:
          "The exact model, LoRA, input, or custom-node source requested by the workflow; similar filenames or replacements are not treated as identical evidence."
      },
      {
        term: "substitute or alias",
        explanation:
          "A different local file or source used only after human approval; it downgrades fidelity claims unless later source-identical evidence is supplied."
      },
      {
        term: "bounded smoke-only follow-up",
        explanation:
          "A limited continuation to test basic load/runtime behavior while explicitly avoiding source-identical, full-size, or customer-ready claims."
      },
      ...common
    ];
  }
  if (reason === "capacity_policy") {
    return [
      {
        term: "full-size",
        explanation:
          "A run at the original workflow resolution/duration/settings rather than a reduced runtime-policy validation path."
      },
      {
        term: "cache-assisted",
        explanation:
          "A pass that reused already-computed outputs or loaded state; it is weaker evidence than a cold full run."
      },
      ...common
    ];
  }
  if (reason === "permission") {
    return [
      {
        term: "approve once",
        explanation:
          "Allow this single tool or SDK permission request only for the current operation; it is not a permanent grant."
      },
      {
        term: "reject",
        explanation:
          "Deny the requested operation, which may pause, fail, or route the step to a safer alternative."
      },
      ...common
    ];
  }
  if (reason === "quality_review") {
    return [
      {
        term: "GUI/manual acceptance",
        explanation:
          "A human-run validation in ComfyUI Web with recorded outputs/logs/signoff; preparation artifacts alone do not count."
      },
      {
        term: "customer-ready",
        explanation:
          "A stronger delivery claim that requires evidence matching the requested fidelity, runtime scope, and acceptance criteria."
      },
      ...common
    ];
  }
  return common;
}

function consequenceForChoice(
  choice: string,
  reason: HumanQuestion["blockingReason"],
  claimBoundaryImpact: unknown
): HumanDecisionContext["consequencesAndFollowUp"][number] {
  const normalized = choice.toLowerCase();
  if (normalized.includes("stop") || normalized.includes("reject")) {
    return {
      choice,
      consequence: "The agent will not continue along the blocked path.",
      followUp: "Record the gate decision and leave the step stopped, rejected, hard-stopped, or awaiting a revised route."
    };
  }
  if (normalized.includes("exact") || normalized.includes("source-identical") || normalized.includes("provide")) {
    return {
      choice,
      consequence: "The agent can retry only the affected resolution or validation work with the supplied evidence.",
      followUp:
        reason === "missing_asset"
          ? "Stage/verify the provided paths or source records, update ledgers, then rerun the next dependent step."
          : "Record the supplied context, update artifacts, and continue only if the evidence closes the gate."
    };
  }
  if (normalized.includes("bounded") || normalized.includes("smoke") || normalized.includes("documented risk")) {
    return {
      choice,
      consequence:
        "The workflow may continue, but downstream success claims remain downgraded to the documented bounded route.",
      followUp: `Persist the downgrade in task-state/artifacts and carry it into later reports.${
        claimBoundaryImpact ? ` Claim impact: ${String(claimBoundaryImpact)}` : ""
      }`
    };
  }
  if (normalized.includes("approve")) {
    return {
      choice,
      consequence: "The agent may perform the approved operation for this gate only.",
      followUp: "Record the approval, execute the requested continuation edge, and keep all claim-boundary limits visible."
    };
  }
  return {
    choice,
    consequence: "The selected route determines whether the step can continue, retry, or stop.",
    followUp: "The agent records the answer, updates task-state, and resumes only along the matching safe edge."
  };
}

function normalizeTerms(value: unknown): HumanDecisionContext["terminology"] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item) => ({
      term: stringValue(item.term) ?? "",
      explanation: stringValue(item.explanation) ?? ""
    }))
    .filter((item) => item.term && item.explanation);
}

function normalizeConsequences(value: unknown): HumanDecisionContext["consequencesAndFollowUp"] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item) => ({
      choice: stringValue(item.choice) ?? "",
      consequence: stringValue(item.consequence) ?? "",
      followUp: stringValue(item.followUp) ?? stringValue(item.follow_up) ?? ""
    }))
    .filter((item) => item.choice && item.consequence && item.followUp);
}

function dedupeTerms(terms: HumanDecisionContext["terminology"]): HumanDecisionContext["terminology"] {
  const seen = new Set<string>();
  const result: HumanDecisionContext["terminology"] = [];
  for (const term of terms) {
    const key = term.term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(term);
  }
  return result.slice(0, 8);
}

function humanQuestionBlockingReason(
  value: unknown,
  stepId?: string
): HumanQuestion["blockingReason"] {
  const allowed: HumanQuestion["blockingReason"][] = [
    "schema_change",
    "missing_asset",
    "hard_stop",
    "quality_review",
    "capacity_policy",
    "permission",
    "other"
  ];
  return allowed.includes(value as HumanQuestion["blockingReason"])
    ? (value as HumanQuestion["blockingReason"])
    : phase1BlockingReasonForStep(stepId ?? "");
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildStep00QuestionData(
  task: MigrationTask,
  intake: {
    artifactPath: string;
    hardStops: string[];
    modelRows: Array<{ requestedAsset: string; state: string; humanAction: string }>;
    customNodeRows: Array<{ nodeType: string; state: string; humanAction: string }>;
  }
): QuestionEventData {
  const details = [
    ...intake.hardStops.slice(0, 8),
    ...intake.modelRows
      .filter((row) => row.state !== "staged")
      .slice(0, 8)
      .map((row) => `${row.requestedAsset}: ${row.state}; ${row.humanAction}`),
    ...intake.customNodeRows
      .filter((row) => row.state !== "source known")
      .slice(0, 5)
      .map((row) => `${row.nodeType}: ${row.state}; ${row.humanAction}`)
  ];
  const uniqueDetails = [...new Set(details)];
  return {
    question:
      `Step 00 found ${uniqueDetails.length || "blocking"} dependency-source gap(s) before feasibility analysis. Review the details, then provide exact source-identical files/source notes, approve bounded smoke-only follow-up, or stop migration.`,
    choices: [
      "Provide missing source-identical assets before Step 01",
      "Approve bounded smoke-only follow-up with documented gaps",
      "Stop migration at Step 00"
    ],
    allowFreeform: true,
    blockingReason: "missing_asset",
    artifactPath: path.relative(task.workspacePath, intake.artifactPath),
    details: uniqueDetails.length
      ? uniqueDetails
      : ["See artifacts/00-intake-preflight.md for dependency-source details."]
  };
}

function step00DetailsFromArtifact(content: string): string[] {
  const details: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const hardStops = line.match(/^hard_stops:\s*(.+)$/i)?.[1];
    if (hardStops && hardStops !== "none") {
      details.push(...hardStops.split(";").map((item) => item.trim()).filter(Boolean));
    }
    const blockingModels = line.match(/^\|\s*Blocking model\/input gaps\s*\|\s*(.+?)\s*\|$/i)?.[1];
    if (blockingModels && blockingModels !== "none") details.push(`Blocking model/input gaps: ${blockingModels}`);
    const blockingCustomNodes = line.match(/^\|\s*Blocking custom-node gaps\s*\|\s*(.+?)\s*\|$/i)?.[1];
    if (blockingCustomNodes && blockingCustomNodes !== "none") {
      details.push(`Blocking custom-node gaps: ${blockingCustomNodes}`);
    }
  }
  return [...new Set(details)].slice(0, 10);
}

function isActionableSourceContext(answer: string): boolean {
  const normalized = answer.toLowerCase();
  return (
    /(^|\s)\/[\w./@+-]+/.test(answer) ||
    /https?:\/\//i.test(answer) ||
    /\b(ssh|scp|rsync|remote|hf_endpoint|huggingface|hf-mirror|civitai|proxy|custom[-\s]?node|model root|hf_models|weights|models)\b/i.test(
      normalized
    )
  );
}

function isActionableGateContext(answer: string, wasFreeform: boolean): boolean {
  const trimmed = answer.trim();
  if (!trimmed || isStopDecision(trimmed) || isBareChoice(trimmed)) return false;
  if (isActionableSourceContext(trimmed)) return true;
  return wasFreeform && trimmed.length >= 16 && /[\p{L}\p{N}]/u.test(trimmed);
}

function isBareChoice(answer: string): boolean {
  const normalized = answer.trim().toLowerCase();
  return [
    "provide missing context before continuing",
    "provide missing source-identical assets before feasibility",
    "provide missing source-identical assets before step 05"
  ].includes(normalized);
}

function isStopDecision(answer: string): boolean {
  const normalized = answer.trim().toLowerCase();
  if (/\b(do not|don't|dont|not)\s+stop\b/.test(normalized)) return false;
  return (
    normalized === "stop" ||
    normalized.startsWith("stop ") ||
    normalized.includes("stop migration") ||
    normalized.includes("stop at this gate") ||
    normalized.includes("停止")
  );
}

function isContinueDecision(answer: string): boolean {
  const normalized = answer.trim().toLowerCase();
  if (/\b(do not|don't|dont|not)\s+(approve|continue)\b/.test(normalized)) return false;
  return (
    normalized.includes("approve") ||
    normalized.includes("smoke") ||
    normalized.includes("continue") ||
    normalized.includes("继续") ||
    normalized.includes("批准") ||
    normalized.includes("同意")
  );
}

function phase1HumanGateFromStep(step: Phase1StepState):
  | {
      gateId: string;
      problemSummary: string;
      question: string;
      choices: string[];
      artifactPaths: string[];
      claimBoundaryImpact?: unknown;
      decisionContext: HumanDecisionContext;
    }
  | undefined {
  const decision = step.completion_decision;
  if (!decision || typeof decision !== "object") return undefined;
  const gate = decision.human_gate;
  const gateRecord =
    gate && typeof gate === "object" ? (gate as Record<string, unknown>) : undefined;
  const promptRecord =
    decision.human_gate_prompt && typeof decision.human_gate_prompt === "object"
      ? (decision.human_gate_prompt as Record<string, unknown>)
      : undefined;
  const recommendation =
    decision.next_step_recommendation && typeof decision.next_step_recommendation === "object"
      ? (decision.next_step_recommendation as Record<string, unknown>)
      : undefined;
  const isGateLike =
    gateRecord ||
    promptRecord ||
    decision.status === "human_gate_reached" ||
    decision.status === "waiting_for_human" ||
    recommendation?.edge_type === "human_gate" ||
    typeof decision.human_gate_prompt === "string";
  if (!isGateLike) return undefined;
  const blockedBy = Array.isArray(recommendation?.blocked_by)
    ? recommendation.blocked_by.filter((item): item is string => typeof item === "string")
    : [];
  const effectiveGateRecord = gateRecord ?? promptRecord;
  const gateId =
    stringValue(effectiveGateRecord?.question_event_id) ??
    blockedBy[0] ??
    `phase1-step-${step.id}-human-gate`;
  const problemSummary =
    stringValue(effectiveGateRecord?.problem_summary) ??
    stringValue(decision.human_gate_prompt) ??
    step.summary ??
    `Step ${step.id} is waiting for a Phase 1 human decision.`;
  const choices = effectiveGateRecord ? phase1HumanGateChoices(effectiveGateRecord) : [];
  const artifactPaths = phase1ArtifactPathList(decision);
  return {
    gateId,
    problemSummary,
    question: `${problemSummary}\n\nReply with one of the listed choices or provide the requested exact context. Phase 1 gate id: ${gateId}.`,
    choices:
      choices.length > 0
        ? choices
        : [
            "Provide missing context before continuing",
            "Continue with documented risk/gaps",
            "Stop at this gate"
          ],
    artifactPaths,
    claimBoundaryImpact: effectiveGateRecord?.claim_boundary_impact ?? blockedBy,
    decisionContext: phase1DecisionContext(step, problemSummary, choices, effectiveGateRecord)
  };
}

function phase1ArtifactPathList(decision: Record<string, unknown>): string[] {
  const paths = new Set<string>();
  for (const key of ["evidence", "evidence_artifacts"]) {
    const value = decision[key];
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (typeof item === "string") paths.add(item);
    }
  }
  return [...paths];
}

function phase1HumanGateChoices(gateRecord: Record<string, unknown>): string[] {
  const allowed = gateRecord.allowed_decisions;
  if (!Array.isArray(allowed)) return [];
  return allowed
    .map((item) => {
      if (!item || typeof item !== "object") return undefined;
      const record = item as Record<string, unknown>;
      const choice = stringValue(record.choice);
      const label = stringValue(record.label);
      const aliasPath = stringValue(record.alias_path);
      return [choice, label, aliasPath ? `(${aliasPath})` : undefined].filter(Boolean).join(" ");
    })
    .filter((item): item is string => Boolean(item));
}

function phase1DecisionContext(
  step: Phase1StepState,
  problemSummary: string,
  choices: string[],
  gateRecord?: Record<string, unknown>
): HumanDecisionContext {
  if (
    gateRecord?.decision_context ||
    gateRecord?.background_reason_scene ||
    gateRecord?.consequences_and_follow_up
  ) {
    return normalizeDecisionContext({
      existing: gateRecord.decision_context ?? gateRecord,
      stepId: step.id,
      question: problemSummary,
      choices,
      blockingReason: phase1BlockingReasonForStep(step.id),
      fallbackBackground: problemSummary,
      details: [],
      claimBoundaryImpact: gateRecord.claim_boundary_impact
    });
  }
  const why = stringArray(gateRecord?.why_agent_cannot_decide);
  const unresolvedItems = Array.isArray(gateRecord?.unresolved_items)
    ? gateRecord.unresolved_items.filter(isRecord)
    : [];
  const itemSummaries = unresolvedItems.slice(0, 3).map((item) => {
    const kind = stringValue(item.kind) ?? "item";
    const state = stringValue(item.current_state) ?? stringValue(item.blocker) ?? "requires human decision";
    const nodes = Array.isArray(item.source_node_ids) ? item.source_node_ids.join(", ") : undefined;
    return `${kind}${nodes ? ` on node(s) ${nodes}` : ""}: ${state}`;
  });
  const allowed = Array.isArray(gateRecord?.allowed_decisions)
    ? gateRecord.allowed_decisions.filter(isRecord)
    : [];
  const consequences =
    allowed.length > 0
      ? allowed.map((item) => {
          const choice = [stringValue(item.choice), stringValue(item.label)].filter(Boolean).join(" ");
          return {
            choice: choice || "Unnamed decision",
            consequence:
              stringValue(item.claim_boundary) ??
              stringValue(gateRecord?.claim_boundary_impact) ??
              "This choice changes whether the migration continues, retries, or stops.",
            followUp:
              stringValue(item.continuation_edge) ??
              "Record the answer, update task-state, and continue only along the matching safe edge."
          };
        })
      : choices.map((choice) =>
          consequenceForChoice(choice, phase1BlockingReasonForStep(step.id), gateRecord?.claim_boundary_impact)
        );
  return {
    formatVersion: "human-gate-v1",
    backgroundReasonScene: [problemSummary, ...why, ...itemSummaries].filter(Boolean).join(" "),
    terminology: dedupeTerms([
      ...defaultHumanGateTerms(phase1BlockingReasonForStep(step.id)),
      {
        term: "continuation edge",
        explanation:
          "The next safe route the agent will execute after the human answer, such as retrying an item, continuing with downgraded claims, or stopping."
      }
    ]),
    consequencesAndFollowUp: consequences
  };
}

function phase1BlockingReasonForStep(stepId: string): HumanQuestion["blockingReason"] {
  if (stepId === "00" || stepId === "01" || stepId === "05") return "missing_asset";
  if (stepId === "12") return "quality_review";
  if (stepId === "13") return "quality_review";
  return "other";
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/(hf_)[A-Za-z0-9]{12,}/g, "$1[REDACTED]")
    .replace(/([?&](?:token|key|secret|password|pwd)=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/\b(export\s+)?(HF_TOKEN|HUGGING_FACE_HUB_TOKEN|HUGGINGFACE_TOKEN|HF_MIRROR_TOKEN|HF_ACCESS_TOKEN|CIVITAI_TOKEN|CIVITAI_API_TOKEN|GITHUB_TOKEN|GH_TOKEN|TOKEN|PASSWORD|PASSWD|PWD)\s*=\s*[^\s]+/gi, (_match, exportPrefix = "", name) => `${exportPrefix}${name}=[REDACTED]`)
    .replace(/\b(pwd|password|passwd|token|secret|api[_-]?key)\s*[:=]?\s+[^\s,;]+/gi, "$1 [REDACTED]")
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [REDACTED]");
}
