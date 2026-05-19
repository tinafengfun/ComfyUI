import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  AgentEvent,
  ArtifactRecord,
  HumanDecision,
  HumanQuestion,
  MigrationStepDefinition,
  MigrationTask,
  SubJob
} from "../shared/types";
import "./styles.css";

type ArtifactListItem = Pick<ArtifactRecord, "relativePath" | "kind" | "path">;
type ArtifactKindFilter = ArtifactRecord["kind"] | "all";
type EventCategory = "semantic" | "heartbeat" | "artifact" | "terminal" | "human";
type HealthStatus = {
  ok: boolean;
  workspaceRoot: string;
  draftDocRoot: string;
  comfyuiRoot: string;
  modelRoots: string[];
  autoApproveAgentPermissions: boolean;
};
type PreflightState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "ok"; modelsAvailable: number | null }
  | { status: "error"; error: string };
type DeliveryReadiness = {
  hasAnySignal: boolean;
  ready: boolean;
  title: string;
  message: string;
  deliveryArtifact?: string;
  acceptanceArtifact?: string;
};
type Phase1TaskState = {
  status?: string;
  current_step_id?: string;
  claim_boundary?: Record<string, unknown>;
  steps?: Array<{
    id: string;
    name?: string;
    status?: string;
    summary?: string;
    completion_decision?: {
      next_step_recommendation?: {
        recommended_step_id?: string | null;
        edge_type?: string;
        reason?: string;
        blocked_by?: string[];
      };
    };
  }>;
  compaction?: Record<string, unknown>;
};
type ProgressItem = {
  id: string;
  stepId?: string;
  title: string;
  detail: string;
  tone: EventCategory;
  createdAt: string;
};

const eventReplayLimit = 80;
const eventMemoryLimit = 150;
const maxHumanAnswerLength = 20_000;

const keyArtifactCards = [
  { label: "Phase 1 state", path: "task-state.json" },
  { label: "Phase 1 summary", path: "artifacts/phase1-context/running-summary.md" },
  { label: "Context debt", path: "artifacts/phase1-context/context-debt.json" },
  { label: "Phase 3 candidates", path: "artifacts/phase1-context/phase3-extraction-candidates.json" },
  { label: "Environment", path: "artifacts/05-environment.md" },
  { label: "Runtime prompt", path: "artifacts/06b-runtime-policy-prompt.json" },
  { label: "Branch smoke", path: "artifacts/07-first-stage-smoke.md" },
  { label: "Full validation", path: "artifacts/08-full-validation.md" },
  { label: "Coverage", path: "artifacts/10-coverage-review.md" },
  { label: "Delivery", path: "artifacts/11-delivery.md" },
  { label: "GUI acceptance", path: "artifacts/12-gui-acceptance.md" },
  { label: "Step 13 improvement", path: "artifacts/13-agent-improvement.md" }
];

function App() {
  const [steps, setSteps] = useState<MigrationStepDefinition[]>([]);
  const [tasks, setTasks] = useState<MigrationTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>();
  const [selectedStepId, setSelectedStepId] = useState<string | undefined>();
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactListItem[]>([]);
  const [selectedArtifact, setSelectedArtifact] = useState<string | undefined>();
  const [artifactContent, setArtifactContent] = useState<string>("");
  const [artifactQuery, setArtifactQuery] = useState("");
  const [artifactKindFilter, setArtifactKindFilter] = useState<ArtifactKindFilter>("all");
  const [eventCategoryFilter, setEventCategoryFilter] = useState<EventCategory | "all">("all");
  const [eventQuery, setEventQuery] = useState("");
  const [health, setHealth] = useState<HealthStatus | undefined>();
  const [preflight, setPreflight] = useState<PreflightState>({ status: "idle" });
  const [decisions, setDecisions] = useState<HumanDecision[]>([]);
  const [subJobs, setSubJobs] = useState<SubJob[]>([]);
  const [phase1State, setPhase1State] = useState<Phase1TaskState | undefined>();
  const [questionDrafts, setQuestionDrafts] = useState<Record<string, string>>({});
  const [uploadError, setUploadError] = useState<string | undefined>();
  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId),
    [selectedTaskId, tasks]
  );
  const selectedStepDefinition = useMemo(
    () => steps.find((step) => step.id === selectedStepId) ?? steps[0],
    [selectedStepId, steps]
  );
  const selectedStepState = useMemo(
    () => selectedTask?.steps.find((step) => step.id === selectedStepDefinition?.id),
    [selectedStepDefinition, selectedTask]
  );
  const selectedArtifactRecord = useMemo(
    () => artifacts.find((artifact) => artifact.relativePath === selectedArtifact),
    [artifacts, selectedArtifact]
  );
  const stepStats = useMemo(() => getStepStats(selectedTask), [selectedTask]);
  const activeStep = useMemo(
    () =>
      selectedTask?.steps.find((step) =>
        ["running", "waiting_for_human", "failed", "hard_stopped"].includes(step.status)
      ),
    [selectedTask]
  );
  const keyArtifacts = useMemo(
    () =>
      keyArtifactCards.map((card) => ({
        ...card,
        artifact: artifacts.find((artifact) => artifact.relativePath === card.path)
      })),
    [artifacts]
  );
  const nextRunnableStep = useMemo(
    () => findNextRunnableStep(steps, selectedTask),
    [selectedTask, steps]
  );
  const resumeCandidate = useMemo(
    () => selectedTask?.steps.find((step) => step.status === "waiting_for_human"),
    [selectedTask]
  );
  const deliveryReadiness = useMemo(
    () => getDeliveryReadiness(selectedTask, artifacts),
    [artifacts, selectedTask]
  );
  const filteredArtifacts = useMemo(() => {
    const query = artifactQuery.trim().toLowerCase();
    return artifacts
      .filter((artifact) => artifactKindFilter === "all" || artifact.kind === artifactKindFilter)
      .filter((artifact) => !query || artifact.relativePath.toLowerCase().includes(query))
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }, [artifactKindFilter, artifactQuery, artifacts]);
  const groupedArtifacts = useMemo(() => groupArtifacts(filteredArtifacts), [filteredArtifacts]);
  const eventSummaries = useMemo(() => summarizeEvents(events), [events]);
  const progressItems = useMemo(() => buildProgressItems(events).slice(-18), [events]);
  const filteredEvents = useMemo(
    () =>
      events.filter((event) => {
        if (eventCategoryFilter === "all") return true;
        return classifyEvent(event).category === eventCategoryFilter;
      }).filter((event) => {
        const query = eventQuery.trim().toLowerCase();
        if (!query) return true;
        const classification = classifyEvent(event);
        return [
          event.type,
          event.message,
          event.stepId,
          classification.label,
          classification.detail
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      }),
    [eventCategoryFilter, eventQuery, events]
  );
  const visibleEvents = useMemo(
    () => filteredEvents.slice(-eventReplayLimit),
    [filteredEvents]
  );

  useEffect(() => {
    void refresh();
    void loadHealth();
  }, []);

  useEffect(() => {
    const preferredStep =
      activeStep?.id ??
      nextRunnableStep?.id ??
      selectedTask?.steps.find((step) => step.status !== "pending")?.id ??
      steps[0]?.id;
    setSelectedStepId((current) => current ?? preferredStep);
  }, [activeStep?.id, nextRunnableStep?.id, selectedTask, steps]);

  useEffect(() => {
    if (!selectedTaskId) return;
    setEvents([]);
    setArtifacts([]);
    setDecisions([]);
    setSubJobs([]);
    setPhase1State(undefined);
    setSelectedArtifact(undefined);
    setArtifactContent("");
    void loadArtifacts(selectedTaskId);
    void loadDecisions(selectedTaskId);
    void loadSubJobs(selectedTaskId);
    void loadPhase1State(selectedTaskId);
    const source = new EventSource(
      `/api/tasks/${selectedTaskId}/events/stream?limit=${eventReplayLimit}`
    );
    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as AgentEvent;
      setEvents((current) => {
        if (current.some((item) => item.id === event.id)) return current;
        return [...current, event].slice(-eventMemoryLimit);
      });
      if (
        [
          "step_completed",
          "step_failed",
          "hard_stop",
          "human_question",
          "step_summary",
          "reflection_proposed"
        ].includes(event.type)
      ) {
        void refresh();
        void loadArtifacts(event.taskId);
        void loadDecisions(event.taskId);
          void loadSubJobs(event.taskId);
          void loadPhase1State(event.taskId);
      }
    };
    return () => source.close();
  }, [selectedTaskId]);

  useEffect(() => {
    if (!selectedTaskId) return;
    const timer = window.setInterval(() => {
      void loadSubJobs(selectedTaskId);
    }, subJobs.some((job) => job.status === "running") ? 1000 : 5000);
    return () => window.clearInterval(timer);
  }, [selectedTaskId, subJobs]);

  async function refresh() {
    const [stepResponse, taskResponse] = await Promise.all([
      fetch("/api/steps"),
      fetch("/api/tasks")
    ]);
    const stepData = (await stepResponse.json()) as { steps: MigrationStepDefinition[] };
    const taskData = (await taskResponse.json()) as { tasks: MigrationTask[] };
    setSteps(stepData.steps);
    setTasks(taskData.tasks);
    setSelectedTaskId((current) => current ?? taskData.tasks[0]?.id);
  }

  function replaceTasks(nextTasks: MigrationTask[], preferredTaskId?: string) {
    setTasks(nextTasks);
    setSelectedTaskId((current) => {
      if (preferredTaskId && nextTasks.some((task) => task.id === preferredTaskId)) {
        return preferredTaskId;
      }
      if (current && nextTasks.some((task) => task.id === current)) {
        return current;
      }
      return nextTasks[0]?.id;
    });
  }

  async function loadHealth() {
    const response = await fetch("/api/health");
    if (!response.ok) return;
    setHealth((await response.json()) as HealthStatus);
  }

  async function runPreflight() {
    setPreflight({ status: "checking" });
    const response = await fetch("/api/agent/preflight");
    if (!response.ok) {
      setPreflight({ status: "error", error: await response.text() });
      return;
    }
    const result = (await response.json()) as { ok: true; modelsAvailable: number | null };
    setPreflight({ status: "ok", modelsAvailable: result.modelsAvailable });
  }

  async function createZimageFixture() {
    const response = await fetch("/api/fixtures/zimage", { method: "POST" });
    if (!response.ok) throw new Error(await response.text());
    const data = (await response.json()) as { task: MigrationTask };
    setTasks((current) => [data.task, ...current]);
    setSelectedTaskId(data.task.id);
  }

  async function deleteTask(task: MigrationTask) {
    if (!isDeletableTask(task)) {
      setUploadError(`Task ${task.name} is ${task.status}; stop or complete it before deleting.`);
      return;
    }
    const confirmed = window.confirm(
      `Delete task "${task.name}" and remove its generated workspace directory?\n\n${task.workspacePath}`
    );
    if (!confirmed) return;
    setUploadError(undefined);
    const response = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    if (!response.ok) {
      setUploadError(await response.text());
      return;
    }
    const data = (await response.json()) as { tasks: MigrationTask[] };
    replaceTasks(data.tasks);
  }

  async function deleteHistoricalTasks() {
    const count = tasks.filter(isDeletableTask).length;
    if (count === 0) {
      setUploadError("No completed, failed, terminated, hard-stopped, or pending historical tasks to delete.");
      return;
    }
    const confirmed = window.confirm(
      `Delete ${count} historical task(s) and remove their generated workspace directories? Running or human-gated tasks will be preserved.`
    );
    if (!confirmed) return;
    setUploadError(undefined);
    const response = await fetch("/api/tasks/history", { method: "DELETE" });
    if (!response.ok) {
      setUploadError(await response.text());
      return;
    }
    const data = (await response.json()) as { tasks: MigrationTask[] };
    replaceTasks(data.tasks);
  }

  async function uploadWorkflow(file: File) {
    setUploadError(undefined);
    try {
      const workflowJson = JSON.parse(await file.text()) as unknown;
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowFileName: file.name,
          workflowJson
        })
      });
      if (!response.ok) throw new Error(await response.text());
      const data = (await response.json()) as { task: MigrationTask };
      setTasks((current) => [data.task, ...current]);
      setSelectedTaskId(data.task.id);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : String(error));
    }
  }

  async function runStep(stepId: string) {
    if (!selectedTask) return;
    setUploadError(undefined);
    const response = await fetch(`/api/tasks/${selectedTask.id}/steps/${stepId}/run`, {
      method: "POST"
    });
    if (!response.ok) {
      setUploadError(await response.text());
      return;
    }
    await refresh();
  }

  async function resumeStep(stepId: string) {
    if (!selectedTask) return;
    setUploadError(undefined);
    const response = await fetch(`/api/tasks/${selectedTask.id}/steps/${stepId}/resume`, {
      method: "POST"
    });
    if (!response.ok) {
      setUploadError(await response.text());
      return;
    }
    await refresh();
  }

  async function runNextStep() {
    if (!nextRunnableStep) return;
    await runStep(nextRunnableStep.id);
  }

  async function runUntilGate() {
    if (!selectedTask || !nextRunnableStep) return;
    setUploadError(undefined);
    const response = await fetch(`/api/tasks/${selectedTask.id}/run-until-gate`, {
      method: "POST"
    });
    if (!response.ok) {
      setUploadError(await response.text());
      return;
    }
    await refresh();
  }

  async function runPhase1Agent() {
    if (!selectedTask) return;
    setUploadError(undefined);
    const response = await fetch(`/api/tasks/${selectedTask.id}/run-phase1`, {
      method: "POST"
    });
    if (!response.ok) {
      setUploadError(await response.text());
      return;
    }
    await refresh();
    await loadPhase1State(selectedTask.id);
  }

  async function resumeCurrentStep() {
    if (!resumeCandidate) return;
    await resumeStep(resumeCandidate.id);
  }

  async function answerQuestion(event: AgentEvent, answer: string, wasFreeform = true) {
    if (!selectedTask) return;
    const response = await fetch(`/api/tasks/${selectedTask.id}/human-decisions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stepId: event.stepId,
        questionEventId: event.id,
        answer,
        wasFreeform
      })
    });
    if (!response.ok) {
      setUploadError(await response.text());
      return;
    }
    const result = (await response.json()) as {
      decision: HumanDecision;
      resumedLiveSession: boolean;
    };
    setQuestionDrafts((current) => {
      const next = { ...current };
      delete next[event.id];
      return next;
    });
    await Promise.all([
      refresh(),
      loadEvents(selectedTask.id),
      loadArtifacts(selectedTask.id),
      loadSubJobs(selectedTask.id),
      loadPhase1State(selectedTask.id),
      loadDecisions(selectedTask.id)
    ]);
    if (!result.resumedLiveSession && event.stepId) {
      await resumeStep(event.stepId);
      await Promise.all([
        refresh(),
        loadEvents(selectedTask.id),
        loadArtifacts(selectedTask.id),
        loadSubJobs(selectedTask.id),
        loadPhase1State(selectedTask.id),
        loadDecisions(selectedTask.id)
      ]);
    }
  }

  async function approvePermissionQuestions() {
    const permissionQuestions = pendingQuestions.filter(isPermissionQuestion);
    for (const event of permissionQuestions) {
      await answerQuestion(event, "Approve once", false);
    }
  }

  async function hardStop() {
    if (!selectedTask) return;
    const reason = window.prompt("Hard stop reason");
    if (!reason) return;
    await fetch(`/api/tasks/${selectedTask.id}/hard-stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason })
    });
    await loadArtifacts(selectedTask.id);
  }

  async function approvalProbe() {
    if (!selectedTask) return;
    const stepId = selectedTask.steps.find((step) => step.status === "running")?.id ?? "00";
    await fetch(`/api/tasks/${selectedTask.id}/approval-probe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stepId })
    });
  }

  async function createReflection() {
    if (!selectedTask) return;
    await fetch(`/api/tasks/${selectedTask.id}/reflection`, { method: "POST" });
    await loadArtifacts(selectedTask.id);
  }

  async function loadArtifacts(taskId: string) {
    const response = await fetch(`/api/tasks/${taskId}/artifacts`);
    const data = (await response.json()) as { artifacts: ArtifactListItem[] };
    setArtifacts(data.artifacts);
  }

  async function loadDecisions(taskId: string) {
    const response = await fetch(`/api/tasks/${taskId}/human-decisions`);
    if (!response.ok) return;
    const data = (await response.json()) as { decisions: HumanDecision[] };
    setDecisions(data.decisions);
  }

  async function loadEvents(taskId: string) {
    const response = await fetch(`/api/tasks/${taskId}/events`);
    if (!response.ok) return;
    const data = (await response.json()) as { events: AgentEvent[] };
    setEvents(data.events.slice(-eventMemoryLimit));
  }

  async function loadSubJobs(taskId: string) {
    const response = await fetch(`/api/tasks/${taskId}/subjobs`);
    if (!response.ok) return;
    const data = (await response.json()) as { subJobs: SubJob[] };
    setSubJobs(data.subJobs);
  }

  async function loadPhase1State(taskId: string) {
    const response = await fetch(
      `/api/tasks/${taskId}/artifacts/content?path=${encodeURIComponent("task-state.json")}`
    );
    if (!response.ok) {
      setPhase1State(undefined);
      return;
    }
    try {
      setPhase1State(JSON.parse(await response.text()) as Phase1TaskState);
    } catch {
      setPhase1State(undefined);
    }
  }

  async function startSubJob(subJobId: string) {
    if (!selectedTask) return;
    const response = await fetch(`/api/tasks/${selectedTask.id}/subjobs/${subJobId}/start`, {
      method: "POST"
    });
    if (!response.ok) {
      setUploadError(await response.text());
      return;
    }
    await loadSubJobs(selectedTask.id);
  }

  async function openArtifact(relativePath: string) {
    if (!selectedTask) return;
    setSelectedArtifact(relativePath);
    const artifact = artifacts.find((item) => item.relativePath === relativePath);
    if (artifact?.kind === "media") {
      setArtifactContent("");
      return;
    }
    const response = await fetch(
      `/api/tasks/${selectedTask.id}/artifacts/content?path=${encodeURIComponent(relativePath)}`
    );
    setArtifactContent(await response.text());
  }

  const waitingStepIds = new Set(
    selectedTask?.steps.filter((step) => step.status === "waiting_for_human").map((step) => step.id) ?? []
  );
  const latestQuestionIdByWaitingStep = new Map<string, string>();
  for (const event of events) {
    if (event.type === "human_question" && event.stepId && waitingStepIds.has(event.stepId)) {
      latestQuestionIdByWaitingStep.set(event.stepId, event.id);
    }
  }
  const pendingQuestions = events.filter((event) => {
    if (event.type !== "human_question") return false;
    const unanswered = !decisions.some((decision) => decision.questionEventId === event.id);
    const latestForStillWaiting =
      event.stepId !== undefined && latestQuestionIdByWaitingStep.get(event.stepId) === event.id;
    return unanswered || latestForStillWaiting;
  });

  return (
    <main className="layout">
      <header className="hero">
        <div>
          <p className="eyebrow">ComfyUI Intel XPU migration</p>
          <h1>Migration Agent Demo</h1>
          <p>
            Web orchestration for the draft Step 00-13 migration workflow, backed by
            Copilot SDK and Copilot CLI execution paths.
          </p>
        </div>
        <label className="upload">
          Upload workflow.json
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void uploadWorkflow(file);
            }}
          />
        </label>
        <button className="secondary-action" onClick={() => void createZimageFixture()}>
          Seed Zimage demo
        </button>
      </header>

      {uploadError ? <div className="error">{uploadError}</div> : null}
      {selectedTask ? (
        <ResultBanner
          deliveryReadiness={deliveryReadiness}
          onOpenArtifact={(relativePath) => void openArtifact(relativePath)}
        />
      ) : null}

      <section className="grid">
        <aside className="panel">
          <h2>System & start</h2>
          {selectedTask ? (
            <section className="side-progress">
              <span>Selected task</span>
              <strong>{selectedTask.name}</strong>
              <small>{selectedTask.id}</small>
              <div className="progress">
                <div style={{ width: `${stepStats.percent}%` }} />
              </div>
              <small>
                {stepStats.completed}/{stepStats.total} steps complete · current{" "}
                {activeStep ? `${activeStep.id} ${activeStep.status}` : selectedTask.status}
              </small>
            </section>
          ) : null}
          <section className="side-actions">
            <button
              className="primary-action"
              disabled={!selectedTask || Boolean(activeStep)}
              onClick={() => void runPhase1Agent()}
              title="Start the Phase 1 monolithic Copilot agent. It runs the full 00-13 flow and writes task-state/compaction artifacts."
            >
              Start Phase 1 agent (00-13)
            </button>
            <button
              disabled={!nextRunnableStep || Boolean(activeStep)}
              onClick={() => void runUntilGate()}
              title="Start or continue automatically until a human gate, hard stop, failure, or completion."
            >
              Start migration until gate
            </button>
            <small>Recommended start button after uploading or selecting a workflow.</small>
            <button
              disabled={!nextRunnableStep}
              onClick={() => void runNextStep()}
              title="Run only the next migration step."
            >
              Run next step only
            </button>
            <button
              disabled={!resumeCandidate}
              onClick={() => void resumeCurrentStep()}
              title="Resume a step paused at a human decision."
            >
              Resume human gate
            </button>
            <button onClick={() => void refresh()} title="Reload task state from the backend.">
              Refresh task state
            </button>
            <button
              className="danger-action"
              disabled={tasks.every((task) => !isDeletableTask(task))}
              onClick={() => void deleteHistoricalTasks()}
              title="Delete completed, failed, terminated, hard-stopped, and pending historical tasks plus their generated workspaces."
            >
              Delete historical tasks
            </button>
          </section>
          {tasks.length === 0 ? <p className="muted">No task yet. Upload a workflow JSON.</p> : null}
          <h2>Tasks</h2>
          {tasks.map((task) => (
            <article className={`task ${task.id === selectedTaskId ? "selected" : ""}`} key={task.id}>
              <button
                className="task-select"
                onClick={() => {
                  setSelectedTaskId(task.id);
                  setSelectedStepId(undefined);
                }}
                title="Select this migration task."
              >
                <strong>{task.name}</strong>
                <span>{task.status}</span>
                <small>
                  {getStepStats(task).completed}/{getStepStats(task).total} steps
                </small>
              </button>
              <button
                className="task-delete"
                disabled={!isDeletableTask(task)}
                onClick={() => void deleteTask(task)}
                title="Delete this task and remove its generated workspace directory."
              >
                Delete
              </button>
            </article>
          ))}
          <SystemReadiness
            health={health}
            preflight={preflight}
            onRunPreflight={() => void runPreflight()}
          />
        </aside>

        <section className="panel flow">
          <div className="panel-title">
            <div>
              <h2>Workflow graph</h2>
              <p className="muted">Click a step to review its status, operations, and summary.</p>
            </div>
            <div className="button-row">
              <button
                disabled={!selectedTask}
                onClick={() => void createReflection()}
                title="Generate a proposal for prompt/skill improvements after reviewing this task."
              >
                Reflection proposal
              </button>
              <button
                disabled={!selectedTask}
                onClick={() => void hardStop()}
                title="Force the migration to stop and write a hard-stop report."
              >
                Force hard stop
              </button>
              <button
                disabled={!selectedTask}
                onClick={() => void approvalProbe()}
                title="Create a test human approval gate to verify the interaction path."
              >
                Approval probe
              </button>
            </div>
          </div>
          <div className="steps workflow-graph">
            {steps.map((step) => {
              const state = selectedTask?.steps.find((item) => item.id === step.id);
              return (
                <article
                  className={`step ${state?.status ?? "pending"} ${selectedStepDefinition?.id === step.id ? "selected" : ""}`}
                  key={step.id}
                  onClick={() => setSelectedStepId(step.id)}
                >
                  <div>
                    <span className="step-id">{step.id}</span>
                    <h3>{step.name}</h3>
                    <p>{step.requiredOutput}</p>
                    <small>{step.humanIntervention}</small>
                  </div>
                  <div className="step-actions">
                    <span>{state?.status ?? "pending"}</span>
                    <button
                      disabled={!selectedTask || state?.status === "running"}
                      onClick={(event) => {
                        event.stopPropagation();
                        void runStep(step.id);
                      }}
                      title="Run this single step."
                    >
                      Run
                    </button>
                    <button
                      disabled={!selectedTask || state?.status !== "waiting_for_human"}
                      onClick={(event) => {
                        event.stopPropagation();
                        void resumeStep(step.id);
                      }}
                      title="Resume this step after a human decision."
                    >
                      Resume
                    </button>
                  </div>
                  {state?.summary || state?.error ? (
                    <p className="step-summary">{state.summary ?? state.error}</p>
                  ) : null}
                </article>
              );
            })}
          </div>
          {selectedStepDefinition ? (
            <section className="selected-step-panel">
              <div>
                <span>Selected step</span>
                <h3>
                  {selectedStepDefinition.id} {selectedStepDefinition.name}
                </h3>
                <p>{selectedStepDefinition.requiredOutput}</p>
                <small>{selectedStepDefinition.humanIntervention}</small>
              </div>
              <div className="button-row">
                <button
                  disabled={!selectedTask || selectedStepState?.status === "running"}
                  onClick={() => void runStep(selectedStepDefinition.id)}
                  title="Run this selected step only."
                >
                  Run selected step
                </button>
                <button
                  disabled={!selectedTask || selectedStepState?.status !== "waiting_for_human"}
                  onClick={() => void resumeStep(selectedStepDefinition.id)}
                  title="Resume selected step after answering a gate."
                >
                  Resume selected step
                </button>
              </div>
              {selectedStepState?.summary || selectedStepState?.error ? (
                <p className="step-summary">{selectedStepState.summary ?? selectedStepState.error}</p>
              ) : null}
            </section>
          ) : null}
          <section className="chat-panel">
            <h2>Human interaction</h2>
            {pendingQuestions.length === 0 ? (
              <p className="muted">No active human question. The agent will pause here when it needs operator input.</p>
            ) : null}
            {pendingQuestions.map((event) => {
              const question = event.data as HumanQuestion | undefined;
              const details = humanQuestionDetails(event);
              const artifactPath = humanQuestionArtifactPath(event);
              const draft = questionDrafts[event.id] ?? "";
              const decisionContext = question?.decisionContext;
              return (
                <article className="question" key={event.id}>
                  <strong>{question?.blockingReason ?? "question"}</strong>
                  <p>{question?.question ?? event.message}</p>
                  {decisionContext ? (
                    <div className="question-structured-context">
                      <section>
                        <h4>1. Decision background, reason, and scene</h4>
                        <p>{decisionContext.backgroundReasonScene}</p>
                      </section>
                      <section>
                        <h4>2. Terms explained</h4>
                        <ul>
                          {decisionContext.terminology.map((item) => (
                            <li key={item.term}>
                              <strong>{item.term}:</strong> {item.explanation}
                            </li>
                          ))}
                        </ul>
                      </section>
                      <section>
                        <h4>3. Consequences and follow-up</h4>
                        <ul>
                          {decisionContext.consequencesAndFollowUp.map((item) => (
                            <li key={item.choice}>
                              <strong>{item.choice}:</strong> {item.consequence} Follow-up:{" "}
                              {item.followUp}
                            </li>
                          ))}
                        </ul>
                      </section>
                    </div>
                  ) : null}
                  {details.length ? (
                    <div className="question-details">
                      <span>Blocking details</span>
                      <ul>
                        {details.map((detail) => (
                          <li key={detail}>{detail}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {artifactPath ? (
                    <button
                      className="inline-link"
                      onClick={() => void openArtifact(artifactPath)}
                      title="Open the evidence artifact with full details."
                    >
                      Open details artifact: {artifactPath.replace("artifacts/", "")}
                    </button>
                  ) : null}
                  <div className="button-row">
                    {(question?.choices ?? ["Approve and continue"]).map((choice) => (
                      <button
                        key={choice}
                        onClick={() => void answerQuestion(event, choice, false)}
                        title="Send this answer back to the active agent session."
                      >
                        {choice}
                      </button>
                    ))}
                  </div>
                  {question?.allowFreeform !== false ? (
                    <div className="answer-box">
                      <label htmlFor={`answer-${event.id}`}>Type a custom answer or source details</label>
                      <textarea
                        id={`answer-${event.id}`}
                        placeholder="Paste exact local model paths/source notes, or write the decision you want the agent to use. Do not paste credentials."
                        value={draft}
                        onPaste={(pasteEvent) => {
                          pasteEvent.preventDefault();
                          pasteEvent.stopPropagation();
                          const pasted = pasteEvent.clipboardData.getData("text/plain");
                          const nextValue = mergeTextareaPaste(
                            pasteEvent.currentTarget,
                            draft,
                            pasted
                          );
                          setQuestionDrafts((current) => ({
                            ...current,
                            [event.id]: nextValue
                          }));
                        }}
                        onChange={(inputEvent) => {
                          const nextValue = sanitizeHumanAnswer(inputEvent.currentTarget.value);
                          setQuestionDrafts((current) => ({
                            ...current,
                            [event.id]: nextValue
                          }));
                        }}
                      />
                      <button
                        disabled={!draft.trim()}
                        onClick={() => void answerQuestion(event, draft.trim(), true)}
                      >
                        Send custom answer
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </section>
        </section>

        <section className="panel">
          <SessionProgress items={progressItems} />

          <Phase1Snapshot
            state={phase1State}
            onOpenArtifact={(relativePath) => void openArtifact(relativePath)}
          />

          <SubJobsPanel
            jobs={subJobs}
            onRefresh={() => selectedTask && void loadSubJobs(selectedTask.id)}
            onStart={(jobId) => void startSubJob(jobId)}
          />

          <h2>Delivery snapshot</h2>
          <div className="artifact-cards">
            {keyArtifacts.map((card) => (
              <button
                className={`artifact-card ${card.artifact ? "available" : "missing"}`}
                disabled={!card.artifact}
                key={card.path}
                onClick={() => card.artifact && void openArtifact(card.artifact.relativePath)}
              >
                <strong>{card.label}</strong>
                <span>{card.artifact ? "available" : "missing"}</span>
                <small>{card.path.replace("artifacts/", "")}</small>
              </button>
            ))}
          </div>
          {pendingQuestions.some(isPermissionQuestion) ? (
            <button className="approve-all" onClick={() => void approvePermissionQuestions()}>
              Approve all permission requests
            </button>
          ) : null}
          <DecisionHistory decisions={decisions} />

          <h2>Artifacts</h2>
          <div className="artifact-toolbar">
            <button disabled={!selectedTask} onClick={() => selectedTask && void loadArtifacts(selectedTask.id)}>
              Refresh artifacts
            </button>
            <input
              placeholder="Filter artifacts"
              value={artifactQuery}
              onChange={(event) => setArtifactQuery(event.currentTarget.value)}
            />
            <select
              value={artifactKindFilter}
              onChange={(event) => setArtifactKindFilter(event.currentTarget.value as ArtifactKindFilter)}
            >
              {["all", "markdown", "json", "workflow", "media", "log", "patch", "other"].map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
          </div>
          <div className="artifacts">
            {groupedArtifacts.length === 0 ? <p className="muted">No artifacts match the current filters.</p> : null}
            {groupedArtifacts.map((group) => (
              <section className="artifact-group" key={group.label}>
                <h3>
                  {group.label} <span>{group.items.length}</span>
                </h3>
                {group.items.map((artifact) => (
                  <button
                    className={artifact.relativePath === selectedArtifact ? "selected artifact" : "artifact"}
                    key={artifact.relativePath}
                    onClick={() => void openArtifact(artifact.relativePath)}
                  >
                    <span>{artifact.kind}</span>
                    {artifact.relativePath}
                  </button>
                ))}
              </section>
            ))}
          </div>
          {selectedArtifact ? (
            <ArtifactPreview
              artifact={selectedArtifactRecord}
              content={artifactContent}
              taskId={selectedTask?.id}
            />
          ) : null}

          <details className="compact-log">
            <summary>Compact Copilot session log ({events.length} retained)</summary>
            <div className="event-toolbar">
              <input
                placeholder="Search compact log"
                value={eventQuery}
                onChange={(event) => setEventQuery(event.currentTarget.value)}
              />
              <button onClick={() => setEventQuery("")}>Clear</button>
            </div>
            <div className="event-summary">
              {eventSummaries.map((summary) => (
                <button
                  className={eventCategoryFilter === summary.category ? "selected" : ""}
                  key={summary.category}
                  onClick={() => setEventCategoryFilter(summary.category)}
                >
                  <strong>{summary.count}</strong>
                  <span>{summary.label}</span>
                </button>
              ))}
              <button
                className={eventCategoryFilter === "all" ? "selected" : ""}
                onClick={() => setEventCategoryFilter("all")}
              >
                <strong>{events.length}</strong>
                <span>all</span>
              </button>
            </div>
            <div className="events">
              {events.length === 0 ? <p className="muted">Events will stream here.</p> : null}
              {events.length > 0 && filteredEvents.length === 0 ? (
                <p className="muted">No events match the current filters.</p>
              ) : null}
              {filteredEvents.length > visibleEvents.length ? (
                <p className="muted">
                  Showing latest {visibleEvents.length} of {filteredEvents.length} matching events.
                </p>
              ) : null}
              {visibleEvents.map((event) => {
                const classification = classifyEvent(event);
                return (
                  <article className={`event ${classification.category}`} key={event.id}>
                    <span>{classification.label}</span>
                    <p>{event.message}</p>
                    {classification.detail ? <small>{classification.detail}</small> : null}
                    <time>{new Date(event.createdAt).toLocaleString()}</time>
                  </article>
                );
              })}
            </div>
          </details>
        </section>
      </section>
    </main>
  );
}

function SystemReadiness(input: {
  health?: HealthStatus;
  preflight: PreflightState;
  onRunPreflight(): void;
}) {
  return (
    <section className="readiness">
      <h2>System readiness</h2>
      <article className={input.health?.ok ? "ready" : "partial"}>
        <span>API</span>
        <strong>{input.health?.ok ? "online" : "not checked"}</strong>
        {input.health ? (
          <>
            <small>Workspace: {input.health.workspaceRoot}</small>
            <small>Draft docs: {input.health.draftDocRoot}</small>
            <small>ComfyUI: {input.health.comfyuiRoot}</small>
            <small>Models: {input.health.modelRoots.join(", ")}</small>
            <small>
              Permission requests:{" "}
              {input.health.autoApproveAgentPermissions ? "auto-approved" : "manual approval"}
            </small>
          </>
        ) : null}
      </article>
      <article className={input.preflight.status === "ok" ? "ready" : input.preflight.status}>
        <span>Copilot SDK</span>
        <strong>{preflightTitle(input.preflight)}</strong>
        <small>{preflightDetail(input.preflight)}</small>
        <button disabled={input.preflight.status === "checking"} onClick={input.onRunPreflight}>
          {input.preflight.status === "checking" ? "Checking..." : "Run preflight"}
        </button>
      </article>
    </section>
  );
}

function DecisionHistory(input: { decisions: HumanDecision[] }) {
  return (
    <section className="decision-history">
      <h3>Decision history</h3>
      {input.decisions.length === 0 ? <p className="muted">No recorded human decisions.</p> : null}
      {input.decisions.map((decision) => (
        <article key={`${decision.questionEventId}-${decision.decidedAt}`}>
          <span>{decision.stepId ? `Step ${decision.stepId}` : "Task"}</span>
          <p>{decision.answer}</p>
          <time>{new Date(decision.decidedAt).toLocaleString()}</time>
        </article>
      ))}
    </section>
  );
}

function SessionProgress(input: { items: ProgressItem[] }) {
  return (
    <section className="session-progress">
      <div className="panel-title">
        <div>
          <h2>Human-readable progress</h2>
          <p className="muted">Concise session progress, with SDK noise filtered out.</p>
        </div>
      </div>
      {input.items.length === 0 ? <p className="muted">Progress summaries will appear here.</p> : null}
      {input.items.map((item) => (
        <article className={`progress-item ${item.tone}`} key={item.id}>
          <span>{item.stepId ? `Step ${item.stepId}` : item.tone}</span>
          <strong>{item.title}</strong>
          <p>{item.detail}</p>
          <time>{new Date(item.createdAt).toLocaleString()}</time>
        </article>
      ))}
    </section>
  );
}

function Phase1Snapshot(input: {
  state?: Phase1TaskState;
  onOpenArtifact(relativePath: string): void;
}) {
  if (!input.state) {
    return (
      <section className="phase1-snapshot">
        <div className="panel-title">
          <div>
            <h2>Phase 1 agent</h2>
            <p className="muted">Start the 00-13 driver to create task-state and compaction artifacts.</p>
          </div>
        </div>
      </section>
    );
  }
  const currentStep = input.state.steps?.find((step) => step.id === input.state?.current_step_id);
  const latestRecommendation =
    [...(input.state.steps ?? [])]
      .reverse()
      .map((step) => step.completion_decision?.next_step_recommendation)
      .find(Boolean);
  const boundaryEntries = Object.entries(input.state.claim_boundary ?? {});
  return (
    <section className="phase1-snapshot">
      <div className="panel-title">
        <div>
          <h2>Phase 1 agent</h2>
          <p className="muted">Long-context driver state, compaction, and claim boundary.</p>
        </div>
      </div>
      <article>
        <span>Status</span>
        <strong>{input.state.status ?? "unknown"}</strong>
        <small>
          Current step: {input.state.current_step_id ?? "n/a"}
          {currentStep?.name ? ` · ${currentStep.name}` : ""}
        </small>
      </article>
      {latestRecommendation ? (
        <article>
          <span>Next recommendation</span>
          <strong>{latestRecommendation.recommended_step_id ?? "complete"}</strong>
          <small>{[latestRecommendation.edge_type, latestRecommendation.reason].filter(Boolean).join(" · ")}</small>
        </article>
      ) : null}
      {boundaryEntries.length ? (
        <article>
          <span>Claim boundary</span>
          <div className="claim-boundary">
            {boundaryEntries.map(([key, value]) => (
              <small key={key}>
                {key}: {String(value)}
              </small>
            ))}
          </div>
        </article>
      ) : null}
      <div className="button-row">
        <button onClick={() => input.onOpenArtifact("task-state.json")}>Open task-state</button>
        <button onClick={() => input.onOpenArtifact("artifacts/phase1-context/running-summary.md")}>
          Open compact summary
        </button>
      </div>
    </section>
  );
}

function SubJobsPanel(input: {
  jobs: SubJob[];
  onRefresh: () => void;
  onStart: (jobId: string) => void;
}) {
  const running = input.jobs.filter((job) => job.status === "running").length;
  return (
    <section className="subjobs">
      <div className="panel-title">
        <div>
          <h2>Sub-jobs / downloads</h2>
          <p className="muted">
            Provider search and asset download monitoring with speed, ETA, and progress.
          </p>
        </div>
        <button onClick={input.onRefresh}>Refresh</button>
      </div>
      {input.jobs.length === 0 ? <p className="muted">No sub-jobs have been created yet.</p> : null}
      {running ? <p className="muted">{running} download sub-job(s) running.</p> : null}
      {input.jobs.map((job) => (
        <article className={`subjob ${job.status}`} key={job.id}>
          <div className="subjob-head">
            <div>
              <span>{job.type.replaceAll("_", " ")}</span>
              <strong>{job.title}</strong>
            </div>
            <code>{job.status}</code>
          </div>
          <div className="subjob-progress">
            <div style={{ width: `${Math.max(0, Math.min(100, job.progress?.percent ?? 0))}%` }} />
          </div>
          <div className="subjob-metrics">
            <span>{formatPercent(job.progress?.percent)}</span>
            <span>{formatBytes(job.progress?.downloadedBytes)} / {formatBytes(job.progress?.totalBytes)}</span>
            <span>{formatRate(job.progress?.speedBytesPerSecond)}</span>
            <span>ETA {formatDuration(job.progress?.etaSeconds)}</span>
          </div>
          <p>{job.message ?? `${job.candidateCount ?? 0} candidate(s)`}</p>
          {job.provider || job.targetPath ? (
            <small>{[job.provider, job.targetPath].filter(Boolean).join(" · ")}</small>
          ) : null}
          {job.error ? <p className="error">{job.error}</p> : null}
          {job.canStart ? (
            <button onClick={() => input.onStart(job.id)}>
              {job.status === "running" ? "Running" : "Start download"}
            </button>
          ) : null}
        </article>
      ))}
    </section>
  );
}

function ArtifactPreview(input: {
  artifact?: ArtifactListItem;
  content: string;
  taskId?: string;
}) {
  if (!input.artifact || !input.taskId) return null;
  const rawUrl = `/api/tasks/${input.taskId}/artifacts/raw?path=${encodeURIComponent(input.artifact.relativePath)}`;
  if (input.artifact.kind === "media") {
    return (
      <figure className="media-preview">
        <img alt={input.artifact.relativePath} src={rawUrl} />
        <figcaption>{input.artifact.relativePath}</figcaption>
        <div className="preview-actions">
          <a href={rawUrl} target="_blank" rel="noreferrer">
            Open raw
          </a>
          <a href={rawUrl} download>
            Download
          </a>
        </div>
      </figure>
    );
  }
  return (
    <div className="text-preview">
      <div className="preview-actions">
        <a href={rawUrl} target="_blank" rel="noreferrer">
          Open raw
        </a>
        <a href={rawUrl} download>
          Download
        </a>
      </div>
      <pre className="preview">{input.content}</pre>
    </div>
  );
}

function ResultBanner(input: {
  deliveryReadiness: DeliveryReadiness;
  onOpenArtifact(relativePath: string): void;
}) {
  if (!input.deliveryReadiness.hasAnySignal) return null;
  return (
    <section className={`result-banner ${input.deliveryReadiness.ready ? "ready" : "partial"}`}>
      <div>
        <span>Delivery result</span>
        <h2>{input.deliveryReadiness.title}</h2>
        <p>{input.deliveryReadiness.message}</p>
      </div>
      <div className="result-actions">
        {input.deliveryReadiness.deliveryArtifact ? (
          <button onClick={() => input.onOpenArtifact(input.deliveryReadiness.deliveryArtifact!)}>
            Open delivery
          </button>
        ) : null}
        {input.deliveryReadiness.acceptanceArtifact ? (
          <button onClick={() => input.onOpenArtifact(input.deliveryReadiness.acceptanceArtifact!)}>
            Open GUI acceptance
          </button>
        ) : null}
      </div>
    </section>
  );
}

function getStepStats(task?: MigrationTask) {
  const total = task?.steps.length ?? 0;
  const completed = task?.steps.filter((step) => step.status === "completed").length ?? 0;
  const failed =
    task?.steps.filter((step) => ["failed", "hard_stopped", "terminated"].includes(step.status))
      .length ?? 0;
  const running =
    task?.steps.filter((step) => ["running", "waiting_for_human"].includes(step.status)).length ?? 0;
  return {
    total,
    completed,
    failed,
    running,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100)
  };
}

function findNextRunnableStep(steps: MigrationStepDefinition[], task?: MigrationTask) {
  if (!task) return undefined;
  if (task.steps.some((step) => ["running", "waiting_for_human"].includes(step.status))) {
    return undefined;
  }
  return steps.find((step) => {
    const state = task.steps.find((item) => item.id === step.id);
    return !state || ["pending", "failed", "hard_stopped", "terminated"].includes(state.status);
  });
}

function isDeletableTask(task: MigrationTask) {
  return ["completed", "failed", "hard_stopped", "terminated", "pending"].includes(task.status);
}

function formatPercent(value: number | undefined): string {
  return value === undefined ? "progress n/a" : `${Math.round(value)}%`;
}

function formatBytes(value: number | undefined): string {
  if (value === undefined) return "n/a";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatRate(value: number | undefined): string {
  return value === undefined ? "speed n/a" : `${formatBytes(value)}/s`;
}

function formatDuration(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "n/a";
  if (value < 60) return `${Math.ceil(value)}s`;
  const minutes = Math.floor(value / 60);
  const seconds = Math.ceil(value % 60);
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function getDeliveryReadiness(
  task: MigrationTask | undefined,
  artifacts: ArtifactListItem[]
): DeliveryReadiness {
  const deliveryArtifact = artifacts.find(
    (artifact) => artifact.relativePath === "artifacts/11-delivery.md"
  )?.relativePath;
  const acceptanceArtifact = artifacts.find(
    (artifact) => artifact.relativePath === "artifacts/12-gui-acceptance.md"
  )?.relativePath;
  const deliveryStep = task?.steps.find((step) => step.id === "11");
  const acceptanceStep = task?.steps.find((step) => step.id === "12");
  const hasAnySignal =
    Boolean(task) &&
    (Boolean(deliveryArtifact) ||
      Boolean(acceptanceArtifact) ||
      deliveryStep?.status === "completed" ||
      acceptanceStep?.status === "completed");
  const ready =
    deliveryStep?.status === "completed" &&
    acceptanceStep?.status === "completed" &&
    Boolean(deliveryArtifact) &&
    Boolean(acceptanceArtifact);
  if (ready) {
    return {
      hasAnySignal,
      ready,
      title: "Migration package ready for handoff",
      message:
        "Delivery and GUI acceptance artifacts are present. Manual GUI signoff can be reviewed from the acceptance package.",
      deliveryArtifact,
      acceptanceArtifact
    };
  }
  return {
    hasAnySignal,
    ready,
    title: "Delivery package is still partial",
    message:
      "Some delivery or GUI acceptance evidence is missing. Continue the remaining steps before treating this task as release-ready.",
    deliveryArtifact,
    acceptanceArtifact
  };
}

function groupArtifacts(artifacts: ArtifactListItem[]) {
  const groups = new Map<string, ArtifactListItem[]>();
  for (const artifact of artifacts) {
    const label = artifactGroupLabel(artifact.relativePath);
    groups.set(label, [...(groups.get(label) ?? []), artifact]);
  }
  return [...groups.entries()].map(([label, items]) => ({ label, items }));
}

function artifactGroupLabel(relativePath: string) {
  if (relativePath === "task-state.json" || relativePath.includes("phase1-context/")) {
    return "Phase 1 state";
  }
  const match = /(?:^|\/)(\d{2})[-_]/.exec(relativePath);
  if (match) return `Step ${match[1]}`;
  if (relativePath.includes("/outputs/") || /\.(png|jpe?g|webp|gif|mp4)$/i.test(relativePath)) {
    return "Media outputs";
  }
  if (relativePath.includes("/workflows/") || relativePath.endsWith(".json")) {
    return "Workflow and JSON";
  }
  return "Other";
}

function isPermissionQuestion(event: AgentEvent) {
  const question = event.data as HumanQuestion | undefined;
  return question?.blockingReason === "permission";
}

function humanQuestionDetails(event: AgentEvent): string[] {
  if (!isRecord(event.data)) return [];
  const details = event.data.details;
  if (!Array.isArray(details)) return [];
  return details
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function humanQuestionArtifactPath(event: AgentEvent): string | undefined {
  if (!isRecord(event.data)) return undefined;
  const value = stringValue(event.data.artifactPath);
  if (!value) return undefined;
  const marker = "artifacts/";
  const markerIndex = value.indexOf(marker);
  return markerIndex >= 0 ? value.slice(markerIndex) : value;
}

function mergeTextareaPaste(
  target: HTMLTextAreaElement,
  currentValue: string,
  pastedValue: string
): string {
  const pasted = sanitizeHumanAnswer(pastedValue);
  const start = target.selectionStart ?? currentValue.length;
  const end = target.selectionEnd ?? currentValue.length;
  return sanitizeHumanAnswer(
    `${currentValue.slice(0, start)}${pasted}${currentValue.slice(end)}`
  );
}

function sanitizeHumanAnswer(value: string): string {
  return value
    .replace(/\0/g, "")
    .replace(/\r\n?/g, "\n")
    .slice(0, maxHumanAnswerLength);
}

function buildProgressItems(events: AgentEvent[]): ProgressItem[] {
  const items: ProgressItem[] = [];
  for (const event of events) {
    const classification = classifyEvent(event);
    if (classification.category === "heartbeat") continue;
    if (event.type === "progress" && isLowValueProgress(event)) continue;
    const readable = readableEvent(event, classification);
    if (!readable) continue;
    items.push({
      id: event.id,
      stepId: event.stepId,
      title: readable.title,
      detail: readable.detail,
      tone: classification.category,
      createdAt: event.createdAt
    });
  }
  return items;
}

function readableEvent(
  event: AgentEvent,
  classification: ReturnType<typeof classifyEvent>
): { title: string; detail: string } | undefined {
  if (event.type === "step_started") {
    return { title: "Step started", detail: event.message };
  }
  if (event.type === "artifact_created" || event.type === "file_changed") {
    return { title: "Evidence artifact updated", detail: readableArtifactMessage(event) };
  }
  if (event.type === "human_question") {
    const question = event.data as HumanQuestion | undefined;
    return {
      title: question?.blockingReason === "permission" ? "Permission handled" : "Human input needed",
      detail: question?.question ?? event.message
    };
  }
  if (event.type === "step_completed") {
    return { title: "Step completed", detail: event.message };
  }
  if (event.type === "step_failed") {
    return { title: "Step failed", detail: event.message };
  }
  if (event.type === "hard_stop") {
    return { title: "Hard stop", detail: event.message };
  }
  if (event.type === "reflection_proposed") {
    return { title: "Reflection proposal generated", detail: event.message };
  }
  const detail = classification.detail ?? event.message;
  if (!detail || detail === "progress") return undefined;
  if (detail.startsWith("assistant.streaming_delta:")) {
    return { title: "Agent reasoning", detail: detail.replace("assistant.streaming_delta:", "").trim() };
  }
  if (detail.startsWith("assistant.message")) {
    return { title: "Agent update", detail };
  }
  if (detail.startsWith("tool started:")) {
    return { title: "Tool started", detail: detail.replace("tool started:", "").trim() };
  }
  if (detail.startsWith("tool completed:")) {
    return { title: "Tool completed", detail: detail.replace("tool completed:", "").trim() };
  }
  if (event.message.includes("Auto-approved Copilot")) {
    return { title: "Permission auto-approved", detail: event.message };
  }
  return { title: humanizeLabel(classification.label), detail };
}

function isLowValueProgress(event: AgentEvent) {
  const sdkType = sdkEventType(event.data) ?? event.message;
  return [
    "session.usage_info",
    "hook.start",
    "hook.end",
    "assistant.usage",
    "progress"
  ].includes(sdkType);
}

function readableArtifactMessage(event: AgentEvent) {
  if (isRecord(event.data)) {
    const path = stringValue(event.data.path) ?? stringValue(event.data.reportPath);
    if (path) return path.split("/").slice(-2).join("/");
  }
  return event.message;
}

function humanizeLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function preflightTitle(preflight: PreflightState) {
  if (preflight.status === "checking") return "checking";
  if (preflight.status === "ok") return "ready";
  if (preflight.status === "error") return "failed";
  return "not checked";
}

function preflightDetail(preflight: PreflightState) {
  if (preflight.status === "checking") return "Starting Copilot SDK and listing models.";
  if (preflight.status === "ok") {
    return preflight.modelsAvailable === null
      ? "SDK session works; model listing was unavailable."
      : `${preflight.modelsAvailable} models available.`;
  }
  if (preflight.status === "error") return preflight.error;
  return "Use this before running a migration step after reboot or auth changes.";
}

function classifyEvent(event: AgentEvent): {
  category: EventCategory;
  label: string;
  detail?: string;
} {
  if (event.type === "human_question") {
    return { category: "human", label: "human gate" };
  }
  if (["artifact_created", "file_changed", "reflection_proposed"].includes(event.type)) {
    return { category: "artifact", label: event.type.replace("_", " ") };
  }
  if (["step_completed", "step_failed", "hard_stop"].includes(event.type)) {
    return { category: "terminal", label: event.type.replace("_", " ") };
  }
  const sdkType = sdkEventType(event.data);
  if (
    sdkType &&
    ["session.usage_info", "hook.start", "hook.end", "assistant.usage"].includes(sdkType)
  ) {
    return { category: "heartbeat", label: "heartbeat", detail: sdkType };
  }
  if (
    sdkType &&
    (sdkType.includes("message") ||
      sdkType.includes("tool.execution") ||
      sdkType.includes("streaming_delta"))
  ) {
    return {
      category: "semantic",
      label: "semantic progress",
      detail: semanticDetail(event.data) ?? sdkType
    };
  }
  return { category: "semantic", label: event.type, detail: sdkType };
}

function summarizeEvents(events: AgentEvent[]) {
  const labels: Record<EventCategory, string> = {
    semantic: "semantic",
    heartbeat: "heartbeat",
    artifact: "artifacts",
    terminal: "terminal",
    human: "human"
  };
  const counts = new Map<EventCategory, number>();
  for (const event of events) {
    const category = classifyEvent(event).category;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return (Object.keys(labels) as EventCategory[]).map((category) => ({
    category,
    label: labels[category],
    count: counts.get(category) ?? 0
  }));
}

function sdkEventType(data: unknown): string | undefined {
  if (!isRecord(data)) return undefined;
  return typeof data.type === "string" ? data.type : undefined;
}

function semanticDetail(data: unknown): string | undefined {
  if (!isRecord(data)) return undefined;
  const direct = stringValue(data.semanticProgress) ?? stringValue(data.contentPreview);
  if (direct) return truncateUiText(direct);
  const nested = isRecord(data.data) ? data.data : undefined;
  const result = nested && isRecord(nested.result) ? nested.result : undefined;
  const value =
    stringValue(nested?.deltaContent) ??
    stringValue(nested?.toolName) ??
    stringValue(result?.content) ??
    stringValue(result?.detailedContent);
  if (!value) return undefined;
  return truncateUiText(value);
}

function truncateUiText(value: string): string | undefined {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error?: Error }
> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <main className="layout">
          <section className="panel fatal-error">
            <h1>Frontend error</h1>
            <p>
              The page hit a recoverable UI error instead of going blank. Copy this
              message for debugging, then reload the page.
            </p>
            <pre>{this.state.error.message}</pre>
            <button onClick={() => window.location.reload()}>Reload page</button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
