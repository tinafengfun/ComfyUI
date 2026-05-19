import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AppConfig } from "./config";
import { ensureDir } from "./fsUtils";
import { MigrationOrchestrator } from "./orchestrator";
import { preparePhase1Driver } from "./phase1Agent";
import { StateStore } from "./state";
import { loadStepDefinitions } from "./workflowLoader";

function testConfig(root: string): AppConfig {
  return {
    port: 0,
    projectRoot: root,
    workspaceRoot: path.join(root, "workspaces"),
    stateRoot: path.join(root, "state"),
    draftDocRoot: testDraftDocRoot(),
    comfyuiRoot: path.join(root, "ComfyUI"),
    modelRoots: [path.join(root, "models")],
    autoApproveAgentPermissions: false
  };
}

function testDraftDocRoot(): string {
  const candidates = [
    path.resolve(process.cwd(), "../ComfyUI/docs/draft"),
    path.resolve(process.cwd(), "../docs/draft")
  ];
  const found = candidates.find((candidate) => fsSync.existsSync(candidate));
  return found ?? candidates[0];
}

describe("Phase 1 monolithic agent", () => {
  it("loads the v2 00-13 step definitions", async () => {
    const root = path.join(process.cwd(), ".demo-state", "tests", `phase1-steps-${Date.now()}`);
    const steps = await loadStepDefinitions(testConfig(root));

    expect(steps.map((step) => step.id)).toEqual([
      "00",
      "01",
      "02",
      "03",
      "04",
      "05",
      "06",
      "07",
      "08",
      "09",
      "10",
      "11",
      "12",
      "13"
    ]);
    expect(steps.find((step) => step.id === "13")?.promptPath).toContain(
      "13-agent-improvement-prompt.md"
    );
  });

  it("prepares task-state, compaction, and Phase 3 extraction artifacts", async () => {
    const root = path.join(process.cwd(), ".demo-state", "tests", `phase1-prepare-${Date.now()}`);
    const config = testConfig(root);
    await ensureDir(config.workspaceRoot);
    const store = new StateStore(config);
    await store.initialize();
    const steps = await loadStepDefinitions(config);
    const orchestrator = new MigrationOrchestrator(config, store, steps);
    const task = await orchestrator.createTask({
      name: "Phase1 prep",
      workflowFileName: "workflow.json",
      workflowJson: { nodes: [], links: [] }
    });

    const prepared = await preparePhase1Driver({
      config,
      task,
      steps,
      decisions: []
    });

    expect(await fs.readFile(prepared.taskStatePath, "utf8")).toContain(
      "phase1-monolithic-copilot-driver"
    );
    expect(await fs.readFile(prepared.promptPath, "utf8")).toContain("00-13");
    expect(await fs.readFile(prepared.promptPath, "utf8")).toContain("context budget monitor");
    expect(await fs.readFile(prepared.phase3ExtractionPath, "utf8")).toContain("candidates");
  });

  it("runs the Phase 1 backend runner and syncs task-state step statuses", async () => {
    const root = path.join(process.cwd(), ".demo-state", "tests", `phase1-runner-${Date.now()}`);
    const config = testConfig(root);
    await ensureDir(config.workspaceRoot);
    const store = new StateStore(config);
    await store.initialize();
    const steps = [
      {
        id: "00",
        name: "Intake",
        requiredOutput: "00-intake-preflight.md",
        humanIntervention: "Provide sources"
      },
      {
        id: "13",
        name: "Agent improvement",
        requiredOutput: "13-agent-improvement.md",
        humanIntervention: "Approve patch plan"
      }
    ];
    const orchestrator = new MigrationOrchestrator(config, store, steps, {
      async runStep(job, emit) {
        const taskStatePath = String(job.requiredContext.taskStatePath);
        const raw = JSON.parse(await fs.readFile(taskStatePath, "utf8")) as {
          status: string;
          steps: Array<{ id: string; status: string; summary?: string }>;
        };
        for (const step of raw.steps) {
          step.status = "completed";
          step.summary = `Fake completed Step ${step.id}.`;
        }
        raw.status = "completed";
        await fs.writeFile(taskStatePath, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
        await emit({
          taskId: job.taskId,
          stepId: job.stepId,
          type: "progress",
          message: "Fake Phase 1 SDK completed."
        });
        return { sessionId: "fake-phase1", summary: "Fake Phase 1 complete." };
      }
    });
    const task = await orchestrator.createTask({
      name: "Phase1 run",
      workflowFileName: "workflow.json",
      workflowJson: { nodes: [], links: [] }
    });

    await orchestrator.runPhase1Agent(task.id);

    const updated = await store.getTask(task.id);
    expect(updated?.steps.every((step) => step.status === "completed")).toBe(true);
    expect(await fs.readFile(path.join(task.workspacePath, "task-state.json"), "utf8")).toContain(
      "Fake completed Step 13"
    );
  });

  it("exposes Phase 1 task-state human gates as backend human questions", async () => {
    const root = path.join(process.cwd(), ".demo-state", "tests", `phase1-gate-${Date.now()}`);
    const config = testConfig(root);
    await ensureDir(config.workspaceRoot);
    const store = new StateStore(config);
    await store.initialize();
    const steps = [
      {
        id: "00",
        name: "Intake",
        requiredOutput: "00-intake-preflight.md",
        humanIntervention: "Provide sources"
      },
      {
        id: "01",
        name: "Assets",
        requiredOutput: "01-assets.csv",
        humanIntervention: "Approve substitute"
      }
    ];
    const orchestrator = new MigrationOrchestrator(config, store, steps, {
      async runStep(job) {
        const taskStatePath = String(job.requiredContext.taskStatePath);
        const raw = JSON.parse(await fs.readFile(taskStatePath, "utf8")) as {
          status: string;
          current_step_id?: string;
          steps: Array<{
            id: string;
            status: string;
            summary?: string;
            completion_decision?: Record<string, unknown>;
          }>;
        };
        raw.status = "waiting_for_human";
        raw.current_step_id = "01";
        raw.steps[0].status = "completed";
        raw.steps[0].summary = "Fake Step 00 complete.";
        raw.steps[1].status = "waiting_for_human";
        raw.steps[1].summary = "Need alias approval.";
        raw.steps[1].completion_decision = {
          status: "waiting_for_human",
          evidence: ["01-human-gate.md"],
          human_gate: {
            question_event_id: "phase1-test-gate",
            problem_summary: "Need alias approval.",
            allowed_decisions: [
              { choice: "A", label: "Provide exact file" },
              { choice: "B", label: "Approve alias", alias_path: "/models/alias.safetensors" }
            ],
            claim_boundary_impact: "Smoke-only if alias is approved."
          }
        };
        await fs.writeFile(taskStatePath, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
        return { sessionId: "fake-phase1", summary: "Fake Phase 1 paused." };
      }
    });
    const task = await orchestrator.createTask({
      name: "Phase1 gate",
      workflowFileName: "workflow.json",
      workflowJson: { nodes: [], links: [] }
    });

    await orchestrator.runPhase1Agent(task.id);

    const events = await store.listEvents(task.id);
    const question = events.find((event) => event.type === "human_question");
    expect(question?.stepId).toBe("01");
    expect(question?.message).toContain("Need alias approval");
    expect(question?.data).toMatchObject({
      phase1GateId: "phase1-test-gate",
      choices: ["A Provide exact file", "B Approve alias (/models/alias.safetensors)"]
    });
    const data = question?.data as
      | {
          decisionContext?: {
            formatVersion: string;
            backgroundReasonScene: string;
            terminology: Array<{ term: string; explanation: string }>;
            consequencesAndFollowUp: Array<{ choice: string; consequence: string; followUp: string }>;
          };
        }
      | undefined;
    expect(data?.decisionContext?.formatVersion).toBe("human-gate-v1");
    expect(data?.decisionContext?.backgroundReasonScene).toContain("Need alias approval");
    expect(data?.decisionContext?.terminology.some((item) => item.term === "source-identical asset")).toBe(
      true
    );
    expect(data?.decisionContext?.consequencesAndFollowUp).toHaveLength(2);
  });

  it("uses backend-completed gate state when preparing a Phase 1 resume", async () => {
    const root = path.join(process.cwd(), ".demo-state", "tests", `phase1-resume-${Date.now()}`);
    const config = testConfig(root);
    await ensureDir(config.workspaceRoot);
    const store = new StateStore(config);
    await store.initialize();
    const steps = [
      {
        id: "00",
        name: "Intake",
        requiredOutput: "00-intake-preflight.md",
        humanIntervention: "Provide sources"
      },
      {
        id: "01",
        name: "Assets",
        requiredOutput: "01-assets.csv",
        humanIntervention: "Approve substitute"
      },
      {
        id: "02",
        name: "Feasibility",
        requiredOutput: "02-feasibility.md",
        humanIntervention: "Review route"
      }
    ];
    const orchestrator = new MigrationOrchestrator(config, store, steps);
    const task = await orchestrator.createTask({
      name: "Phase1 resume",
      workflowFileName: "workflow.json",
      workflowJson: { nodes: [], links: [] }
    });
    const prepared = await preparePhase1Driver({ config, task, steps, decisions: [] });
    const raw = JSON.parse(await fs.readFile(prepared.taskStatePath, "utf8")) as {
      status: string;
      current_step_id?: string;
      steps: Array<{ id: string; status: string; summary?: string }>;
    };
    raw.status = "waiting_for_human";
    raw.current_step_id = "01";
    raw.steps.find((step) => step.id === "00")!.status = "completed";
    raw.steps.find((step) => step.id === "01")!.status = "waiting_for_human";
    await fs.writeFile(prepared.taskStatePath, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
    await store.updateStep(task.id, "00", "completed");
    await store.updateStep(task.id, "01", "completed");
    const updatedTask = await store.getTask(task.id);
    if (!updatedTask) throw new Error("Task missing after test setup.");

    await preparePhase1Driver({ config, task: updatedTask, steps, decisions: [] });

    const resumed = JSON.parse(await fs.readFile(prepared.taskStatePath, "utf8")) as {
      status: string;
      current_step_id?: string;
      steps: Array<{ id: string; status: string }>;
    };
    expect(resumed.steps.find((step) => step.id === "01")?.status).toBe("completed");
    expect(resumed.current_step_id).toBe("02");
    expect(resumed.steps.find((step) => step.id === "02")?.status).toBe("running");
  });
});
