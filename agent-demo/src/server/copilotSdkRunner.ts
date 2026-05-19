import { CopilotClient } from "@github/copilot-sdk";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  AgentEvent,
  HumanDecision,
  HumanQuestion,
  StepJob
} from "../shared/types";
import type { AppConfig } from "./config";
import { serializeStepJobForAgent } from "./promptSkillCompiler";


export type AgentEventSink = (
  event: Omit<AgentEvent, "id" | "createdAt">
) => Promise<AgentEvent>;

export type HumanDecisionWaiter = (event: AgentEvent) => Promise<HumanDecision>;

export interface SdkRunResult {
  sessionId: string;
  summary?: string;
  sessionArtifacts?: SdkSessionArtifactPaths;
}

export interface SdkSessionArtifactPaths {
  jsonlPath: string;
  transcriptPath: string;
  promptPath: string;
}

export class SdkStepTimeoutError extends Error {
  constructor(
    readonly stepId: string,
    readonly timeoutMs: number,
    readonly lastProgressReason: string
  ) {
    super(
      `Copilot SDK step ${stepId} had no semantic progress for ${timeoutMs}ms; last progress: ${lastProgressReason}`
    );
    this.name = "SdkStepTimeoutError";
  }
}

export class CopilotSdkRunner {
  constructor(private readonly config: AppConfig) {}

  async preflight(): Promise<{ ok: true; modelsAvailable: number | null }> {
    const gitHubToken = this.getExplicitGitHubToken();
    const client = this.createClient(this.config.projectRoot, gitHubToken);
    try {
      await client.start();
      let modelsAvailable: number | null = null;
      try {
        const models = await client.listModels();
        modelsAvailable = models.length;
      } catch {
        modelsAvailable = null;
      }
      return { ok: true, modelsAvailable };
    } finally {
      const errors = await client.stop();
      if (errors.length > 0) {
        throw new Error(`Copilot SDK preflight cleanup failed: ${errors.map((e) => e.message).join("; ")}`);
      }
    }
  }

  async runStep(
    job: StepJob,
    emit: AgentEventSink,
    waitForDecision?: HumanDecisionWaiter
  ): Promise<SdkRunResult> {
    const gitHubToken = this.getExplicitGitHubToken();
    const client = this.createClient(job.workspacePath, gitHubToken);
    const prompt = serializeStepJobForAgent(job);
    const isPhase1Driver = job.stepId === "phase1";
    const noProgressTimeoutMs = Number(
      isPhase1Driver
        ? process.env.MIGRATION_AGENT_PHASE1_TIMEOUT_MS ??
            process.env.MIGRATION_AGENT_STEP_TIMEOUT_MS ??
            5 * 60 * 1000
        : process.env.MIGRATION_AGENT_STEP_TIMEOUT_MS ?? 3 * 60 * 1000
    );
    const maxRuntimeMs = Number(
      isPhase1Driver
        ? process.env.MIGRATION_AGENT_PHASE1_MAX_MS ??
            process.env.MIGRATION_AGENT_STEP_MAX_MS ??
            6 * 60 * 60 * 1000
        : process.env.MIGRATION_AGENT_STEP_MAX_MS ?? 30 * 60 * 1000
    );
    const sdkIdleTimeoutMs = Number(
      process.env.MIGRATION_AGENT_SDK_IDLE_TIMEOUT_MS ??
        String(maxRuntimeMs || Math.max(noProgressTimeoutMs * 12, 2 * 60 * 60 * 1000))
    );
    const watchdog = createProgressWatchdog({
      stepId: job.stepId,
      noProgressTimeoutMs,
      maxRuntimeMs
    });
    const recorder = await SdkSessionRecorder.create(job, prompt);

    await emit({
      taskId: job.taskId,
      stepId: job.stepId,
      type: "progress",
      message: "Starting Copilot SDK session for migration step."
    });
    await emit({
      taskId: job.taskId,
      stepId: job.stepId,
      type: "artifact_created",
      message: "Created Copilot SDK session capture artifacts.",
      data: recorder.paths
    });

    let session: Awaited<ReturnType<CopilotClient["createSession"]>> | undefined;
    let runStatus: "completed" | "failed" = "failed";
    try {
      session = await client.createSession({
        clientName: "comfy-xpu-migration-demo",
        gitHubToken,
        workingDirectory: job.workspacePath,
        streaming: true,
        includeSubAgentStreamingEvents: true,
        onPermissionRequest: async (request) => {
          await recorder.recordPermissionHandlerRequest(request);
          if (this.config.autoApproveAgentPermissions || request.kind === "read") {
            await recorder.recordPermissionDecision(request, { kind: "approve-once" });
            await emit({
              taskId: job.taskId,
              stepId: job.stepId,
              type: "progress",
              message: `Auto-approved Copilot ${request.kind} permission for step ${job.stepId}.`,
              data: { permissionKind: request.kind, autoApproved: true }
            });
            return { kind: "approve-once" };
          }
          const question: HumanQuestion = {
            question: `Copilot requested ${request.kind} permission for step ${job.stepId}. Approve this request to let the active SDK session continue.`,
            choices: ["Approve once", "Reject"],
            allowFreeform: true,
            blockingReason: "permission"
          };
          const event = await emit({
            taskId: job.taskId,
            stepId: job.stepId,
            type: "human_question",
            message: question.question,
            data: question
          });
          if (!waitForDecision) {
            await recorder.recordPermissionDecision(request, { kind: "user-not-available" });
            return { kind: "user-not-available" };
          }
          const decision = await waitForDecision(event);
          if (decision.answer.toLowerCase().startsWith("approve")) {
            await recorder.recordPermissionDecision(request, { kind: "approve-once" });
            return { kind: "approve-once" };
          }
          await recorder.recordPermissionDecision(request, { kind: "reject", feedback: decision.answer });
          return { kind: "reject", feedback: decision.answer };
        },
        onUserInputRequest: async (request) => {
          const question: HumanQuestion = {
            question: request.question,
            choices: request.choices,
            allowFreeform: request.allowFreeform ?? true,
            blockingReason: "other"
          };
          const event = await emit({
            taskId: job.taskId,
            stepId: job.stepId,
            type: "human_question",
            message: request.question,
            data: question
          });
          if (waitForDecision) {
            const decision = await waitForDecision(event);
            return {
              answer: decision.answer,
              wasFreeform: decision.wasFreeform
            };
          }
          return {
            answer: "Human input is required in the migration web UI before this step can continue.",
            wasFreeform: true
          };
        },
        onEvent: async (event) => {
          const semanticProgress = getSemanticProgress(event);
          if (semanticProgress) {
            watchdog.markProgress(semanticProgress);
          }
          await recorder.recordEvent(event, semanticProgress);
          await emit({
            taskId: job.taskId,
            stepId: job.stepId,
            type: "progress",
            message: semanticProgress ?? event.type,
            data: summarizeSdkEvent(event, semanticProgress)
          });
        }
      });

      if (this.config.autoApproveAgentPermissions) {
        await withTimeout(
          session.rpc.permissions.setApproveAll({ enabled: true }),
          5_000,
          "set SDK approve-all permissions"
        );
        await emit({
          taskId: job.taskId,
          stepId: job.stepId,
          type: "progress",
          message: "Enabled Copilot SDK approve-all permissions for this migration step."
        });
      }

      const response = await watchdog.watch(session.sendAndWait({ prompt }, sdkIdleTimeoutMs));
      runStatus = "completed";
      await recorder.recordFinalSummary(response?.data.content);
      return {
        sessionId: session.sessionId,
        summary: response?.data.content,
        sessionArtifacts: recorder.paths
      };
    } catch (error) {
      await recorder.recordError(error);
      throw error;
    } finally {
      await recorder.finalize(runStatus);
      if (session) {
        void withTimeout(session.disconnect(), 5_000, "disconnect Copilot SDK session").catch(
          (error) => recorder.recordCleanupError("disconnect", error)
        );
      }
      void withTimeout(client.stop(), 5_000, "stop Copilot SDK client")
        .then((errors) =>
          errors.length > 0
            ? recorder.recordCleanupError(
                "client.stop",
                new Error(`Copilot SDK cleanup failed: ${errors.map((e) => e.message).join("; ")}`)
              )
            : undefined
        )
        .catch((error) => recorder.recordCleanupError("client.stop", error));
    }
  }

  private createClient(cwd: string, gitHubToken?: string): CopilotClient {
    return new CopilotClient({
      cwd,
      cliPath: this.config.copilotCliPath,
      logLevel: "error",
      gitHubToken,
      useLoggedInUser: gitHubToken ? false : true
    });
  }

  private getExplicitGitHubToken(): string | undefined {
    if (process.env.COPILOT_SDK_GITHUB_TOKEN) return process.env.COPILOT_SDK_GITHUB_TOKEN;
    if (process.env.COPILOT_SDK_GH_TOKEN) return process.env.COPILOT_SDK_GH_TOKEN;
    return undefined;
  }
}

class SdkSessionRecorder {
  private assistantBuffer = "";
  private eventCount = 0;
  private lastEventAt = new Date().toISOString();
  private readonly startedAt = new Date().toISOString();

  private constructor(
    private readonly job: StepJob,
    readonly paths: SdkSessionArtifactPaths
  ) {}

  static async create(job: StepJob, prompt: string): Promise<SdkSessionRecorder> {
    const stamp = new Date().toISOString().replaceAll(":", "").replaceAll(".", "");
    const folder = path.join(job.artifactPath, "sdk-sessions");
    await fs.mkdir(folder, { recursive: true });
    const base = `${job.stepId}-${stamp}`;
    const paths = {
      jsonlPath: path.join(folder, `${base}.jsonl`),
      transcriptPath: path.join(folder, `${base}.md`),
      promptPath: path.join(folder, `${base}.prompt.md`)
    };
    await fs.writeFile(paths.promptPath, redactSecrets(prompt), "utf8");
    const recorder = new SdkSessionRecorder(job, paths);
    await recorder.appendJsonl({
      kind: "session_start",
      timestamp: recorder.startedAt,
      taskId: job.taskId,
      stepId: job.stepId,
      stepName: job.stepName,
      expectedArtifacts: job.expectedArtifacts,
      promptPath: paths.promptPath
    });
    await fs.writeFile(
      paths.transcriptPath,
      [
        `# Copilot SDK session capture - Step ${job.stepId}`,
        "",
        `task_id: \`${job.taskId}\``,
        `step: \`${job.stepId} ${job.stepName}\``,
        `started_at: \`${recorder.startedAt}\``,
        `prompt_capture: \`${paths.promptPath}\``,
        "",
        "## Assistant / tool transcript",
        ""
      ].join("\n"),
      "utf8"
    );
    return recorder;
  }

  async recordEvent(event: unknown, semanticProgress?: string): Promise<void> {
    const timestamp = new Date().toISOString();
    this.lastEventAt = timestamp;
    this.eventCount += 1;
    const eventType = isRecord(event) ? stringValue(event.type) : undefined;
    const text = extractProgressText(event);
    if (text && isAssistantEventType(eventType)) {
      this.assistantBuffer += text;
    }
    const safeEvent = safeJsonValue(event, 12_000);
    await this.appendJsonl({
      kind: "sdk_event",
      timestamp,
      eventIndex: this.eventCount,
      eventType,
      semanticProgress,
      text,
      event: safeEvent
    });
    if (semanticProgress || text || eventType?.startsWith("tool.") || eventType?.startsWith("assistant.")) {
      await this.appendTranscriptEvent({ timestamp, eventType, semanticProgress, text });
    }
  }

  async recordFinalSummary(summary: string | undefined): Promise<void> {
    const timestamp = new Date().toISOString();
    await this.appendJsonl({
      kind: "final_summary",
      timestamp,
      summary
    });
    await fs.appendFile(
      this.paths.transcriptPath,
      ["", "## Final summary", "", summary?.trim() || "(empty final summary)", ""].join("\n"),
      "utf8"
    );
  }

  async recordError(error: unknown): Promise<void> {
    const timestamp = new Date().toISOString();
    const message = error instanceof Error ? error.message : String(error);
    await this.appendJsonl({
      kind: "session_error",
      timestamp,
      error: {
        name: error instanceof Error ? error.name : undefined,
        message,
        stack: error instanceof Error ? error.stack : undefined
      }
    });
    await fs.appendFile(
      this.paths.transcriptPath,
      ["", "## Error", "", "```text", message, "```", ""].join("\n"),
      "utf8"
    );
  }

  async recordPermissionHandlerRequest(request: unknown): Promise<void> {
    await this.appendJsonl({
      kind: "permission_handler_request",
      timestamp: new Date().toISOString(),
      request: safeJsonValue(request, 20_000)
    });
  }

  async recordPermissionDecision(request: unknown, result: unknown): Promise<void> {
    await this.appendJsonl({
      kind: "permission_handler_decision",
      timestamp: new Date().toISOString(),
      request: safeJsonValue(request, 20_000),
      result: safeJsonValue(result, 5_000)
    });
  }

  async recordCleanupError(phase: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await this.appendJsonl({
      kind: "cleanup_error",
      timestamp: new Date().toISOString(),
      phase,
      error: {
        name: error instanceof Error ? error.name : undefined,
        message,
        stack: error instanceof Error ? error.stack : undefined
      }
    });
    await fs.appendFile(
      this.paths.transcriptPath,
      ["", `## Cleanup warning: ${phase}`, "", "```text", message, "```", ""].join("\n"),
      "utf8"
    );
  }

  async finalize(status: "completed" | "failed"): Promise<void> {
    const timestamp = new Date().toISOString();
    await this.appendJsonl({
      kind: "session_end",
      timestamp,
      status,
      eventCount: this.eventCount,
      startedAt: this.startedAt,
      lastEventAt: this.lastEventAt,
      assistantTextLength: this.assistantBuffer.length
    });
    if (this.assistantBuffer.trim()) {
      await fs.appendFile(
        this.paths.transcriptPath,
        [
          "",
          "## Reconstructed assistant streaming text",
          "",
          "```text",
          redactSecrets(this.assistantBuffer).slice(-80_000),
          "```",
          ""
        ].join("\n"),
        "utf8"
      );
    }
    await fs.appendFile(
      this.paths.transcriptPath,
      [
        "",
        "## Session end",
        "",
        `status: \`${status}\``,
        `ended_at: \`${timestamp}\``,
        `event_count: \`${this.eventCount}\``,
        ""
      ].join("\n"),
      "utf8"
    );
  }

  private async appendTranscriptEvent(input: {
    timestamp: string;
    eventType?: string;
    semanticProgress?: string;
    text?: string;
  }): Promise<void> {
    const label = input.semanticProgress ?? input.eventType ?? "event";
    const text = input.text?.trim();
    const body = [
      `### ${input.timestamp} - ${label}`,
      "",
      text ? "```text" : "",
      text ? redactSecrets(text).slice(0, 12_000) : "",
      text ? "```" : "",
      ""
    ]
      .filter((line) => line !== "")
      .join("\n");
    await fs.appendFile(this.paths.transcriptPath, `${body}\n`, "utf8");
  }

  private async appendJsonl(value: Record<string, unknown>): Promise<void> {
    await fs.appendFile(this.paths.jsonlPath, `${JSON.stringify(safeJsonValue(value, 40_000))}\n`, "utf8");
  }
}

function summarizeSdkEvent(
  event: unknown,
  semanticProgress?: string
): {
  type?: string;
  semanticProgress?: string;
  toolName?: string;
  success?: boolean;
  contentPreview?: string;
} {
  if (!isRecord(event)) return { semanticProgress };
  const data = isRecord(event.data) ? event.data : undefined;
  const result = data && isRecord(data.result) ? data.result : undefined;
  return {
    type: stringValue(event.type),
    semanticProgress,
    toolName: data ? stringValue(data.toolName) : undefined,
    success: data && typeof data.success === "boolean" ? data.success : undefined,
    contentPreview: data
      ? truncateForProgress(
          stringValue(data.deltaContent) ??
            stringValue(result?.content) ??
            stringValue(result?.detailedContent) ??
            ""
        ) || undefined
      : undefined
  };
}

interface ProgressWatchdog {
  markProgress(reason: string): void;
  watch<T>(promise: Promise<T>): Promise<T>;
}

export function getSemanticProgress(event: unknown): string | undefined {
  if (!isRecord(event)) return undefined;
  const eventType = stringValue(event.type);
  if (!eventType) return undefined;
  const data = isRecord(event.data) ? event.data : undefined;
  const text = extractProgressText(event);

  if (eventType === "assistant.message_delta" || eventType === "assistant.streaming_delta") {
    return undefined;
  }

  if (eventType === "assistant.message") {
    return text && isAssistantArtifactProgress(text)
      ? `${eventType}: ${truncateForProgress(text)}`
      : undefined;
  }

  if (eventType === "tool.execution_start") {
    const toolName = data ? stringValue(data.toolName) : undefined;
    return toolName ? `tool started: ${toolName}` : eventType;
  }

  if (eventType === "tool.execution_complete") {
    const toolName = data ? stringValue(data.toolName) : undefined;
    const success =
      data && typeof data.success === "boolean" ? ` success=${String(data.success)}` : "";
    return toolName ? `tool completed: ${toolName}${success}` : `${eventType}${success}`;
  }

  if (
    eventType.includes("file") ||
    eventType.includes("artifact") ||
    eventType === "progress"
  ) {
    return text ? `${eventType}: ${truncateForProgress(text)}` : eventType;
  }

  return undefined;
}

export function createProgressWatchdog(input: {
  stepId: string;
  noProgressTimeoutMs: number;
  maxRuntimeMs?: number;
}): ProgressWatchdog {
  const startedAt = Date.now();
  let lastProgressAt = startedAt;
  let lastProgressReason = "SDK session started";
  const checkIntervalMs = Math.max(
    1_000,
    Math.min(30_000, Math.floor(input.noProgressTimeoutMs / 10))
  );

  return {
    markProgress(reason: string) {
      lastProgressAt = Date.now();
      lastProgressReason = reason;
    },
    async watch<T>(promise: Promise<T>): Promise<T> {
      let timer: NodeJS.Timeout | undefined;
      try {
        return await Promise.race([
          promise,
          new Promise<T>((_resolve, reject) => {
            timer = setInterval(() => {
              const now = Date.now();
              if (now - lastProgressAt > input.noProgressTimeoutMs) {
                reject(
                  new SdkStepTimeoutError(
                    input.stepId,
                    input.noProgressTimeoutMs,
                    lastProgressReason
                  )
                );
                return;
              }
              if (input.maxRuntimeMs && now - startedAt > input.maxRuntimeMs) {
                reject(
                  new Error(
                    `Copilot SDK step ${input.stepId} exceeded maximum runtime ${input.maxRuntimeMs}ms; last progress: ${lastProgressReason}`
                  )
                );
              }
            }, checkIntervalMs);
          })
        ]);
      } finally {
        if (timer) clearInterval(timer);
      }
    }
  };
}

function extractProgressText(event: unknown): string | undefined {
  if (!isRecord(event)) return undefined;
  const data = isRecord(event.data) ? event.data : undefined;
  const nestedData = data && isRecord(data.data) ? data.data : undefined;
  const result = data && isRecord(data.result) ? data.result : undefined;
  const nestedResult =
    nestedData && isRecord(nestedData.result) ? nestedData.result : undefined;
  const candidates = [
    data?.deltaContent,
    data?.content,
    data?.message,
    nestedData?.deltaContent,
    nestedData?.content,
    nestedData?.message,
    nestedData?.toolName,
    result?.content,
    result?.detailedContent,
    nestedResult?.content,
    nestedResult?.detailedContent
  ];
  for (const candidate of candidates) {
    const value = stringValue(candidate);
    if (value?.trim()) return value.trim();
  }
  return undefined;
}

function truncateForProgress(value: string): string {
  return value.length > 120 ? `${value.slice(0, 117)}...` : value;
}

function isAssistantArtifactProgress(value: string): boolean {
  return (
    /\.(md|json|csv|py|ts|tsx|js|sh|log|patch|diff)\b/i.test(value) ||
    /\b(artifact|file|write|wrote|written|create|created|creating|update|updated|updating|save|saved|saving)\b/i.test(value)
  );
}

function isAssistantEventType(value: string | undefined): boolean {
  return value === "assistant.message_delta" ||
    value === "assistant.streaming_delta" ||
    value === "assistant.message";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function safeJsonValue(value: unknown, maxStringLength: number, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") return redactSecrets(truncateString(value, maxStringLength));
  if (typeof value !== "object" || value === null) return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) {
    return value.slice(0, 200).map((item) => safeJsonValue(item, maxStringLength, seen));
  }
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = safeJsonValue(item, maxStringLength, seen);
  }
  return output;
}

function truncateString(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...[truncated ${value.length - maxLength} chars]` : value;
}

function redactSecrets(value: string): string {
  return value
    .replace(/(gh[pousr]_[A-Za-z0-9_]{20,})/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/(github_pat_[A-Za-z0-9_]{20,})/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/(hf_[A-Za-z0-9]{20,})/g, "[REDACTED_HF_TOKEN]")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1[REDACTED_BEARER_TOKEN]");
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out while trying to ${label}`)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
