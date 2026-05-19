import { afterEach, describe, expect, it, vi } from "vitest";
import { createProgressWatchdog, getSemanticProgress } from "./copilotSdkRunner";

describe("Copilot SDK progress watchdog", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("distinguishes semantic progress from heartbeat events", () => {
    expect(
      getSemanticProgress({
        type: "assistant.message_delta",
        data: { deltaContent: "writing 06-prompt-validation.json" }
      })
    ).toBeUndefined();
    expect(
      getSemanticProgress({
        type: "assistant.message_delta",
        data: { deltaContent: "I will inspect the workflow next" }
      })
    ).toBeUndefined();
    expect(
      getSemanticProgress({
        type: "assistant.message_delta",
        data: { data: { deltaContent: "creating branch smoke prompt" } }
      })
    ).toBeUndefined();
    expect(
      getSemanticProgress({
        type: "assistant.message",
        data: { content: "wrote 06-prompt-validation.json" }
      })
    ).toContain("wrote 06-prompt-validation.json");
    expect(
      getSemanticProgress({
        type: "tool.execution_start",
        data: { toolName: "bash" }
      })
    ).toBe("tool started: bash");
    expect(getSemanticProgress({ type: "session.usage_info", data: {} })).toBeUndefined();
    expect(
      getSemanticProgress({
        type: "assistant.streaming_delta",
        data: { deltaContent: "" }
      })
    ).toBeUndefined();
  });

  it("keeps a long SDK wait alive while semantic progress continues", async () => {
    vi.useFakeTimers();
    let resolvePromise: (value: string) => void = () => undefined;
    const watchdog = createProgressWatchdog({
      stepId: "06",
      noProgressTimeoutMs: 2_000
    });
    const watched = watchdog.watch(
      new Promise<string>((resolve) => {
        resolvePromise = resolve;
      })
    );

    await vi.advanceTimersByTimeAsync(1_500);
    watchdog.markProgress("tool completed: apply_patch success=true");
    await vi.advanceTimersByTimeAsync(1_500);
    resolvePromise("done");
    await expect(watched).resolves.toBe("done");
  });
});
