import fs from "node:fs/promises";
import path from "node:path";
import type { MigrationStepDefinition, MigrationTask } from "../shared/types";

export interface ArtifactCompletionResult {
  complete: boolean;
  matchedPath?: string;
  reason: string;
}

export interface ArtifactGateResult {
  gated: boolean;
  matchedPath?: string;
  reason: string;
}

export async function checkRequiredArtifactCompletion(
  task: MigrationTask,
  step: MigrationStepDefinition
): Promise<ArtifactCompletionResult> {
  const candidates = expectedArtifactCandidates(step);
  if (candidates.length === 0) {
    return { complete: false, reason: `No concrete artifact candidate for ${step.requiredOutput}` };
  }

  if (step.id === "13") {
    const missing: string[] = [];
    for (const candidate of candidates) {
      const fullPath = path.join(task.artifactPath, candidate);
      if (!(await isReadableNonEmptyFile(fullPath))) missing.push(candidate);
    }
    if (!missing.length) {
      return {
        complete: true,
        matchedPath: task.artifactPath,
        reason: `All Step 13 self-evolution artifacts exist and are non-empty: ${candidates.join(", ")}`
      };
    }
    return {
      complete: false,
      reason: `Step 13 is missing required self-evolution artifacts: ${missing.join(", ")}`
    };
  }

  for (const candidate of candidates) {
    const fullPath = path.join(task.artifactPath, candidate);
    if (await isReadableNonEmptyFile(fullPath)) {
      return {
        complete: true,
        matchedPath: fullPath,
        reason: `Required artifact exists and is non-empty: ${candidate}`
      };
    }
  }
  return {
    complete: false,
    reason: `None of the required artifact candidates exist: ${candidates.join(", ")}`
  };
}

export async function checkRequiredArtifactGate(
  task: MigrationTask,
  step: MigrationStepDefinition
): Promise<ArtifactGateResult> {
  const candidates = expectedArtifactCandidates(step);
  for (const candidate of candidates) {
    const fullPath = path.join(task.artifactPath, candidate);
    const gateReason = await readGateReason(fullPath);
    if (gateReason) {
      return {
        gated: true,
        matchedPath: fullPath,
        reason: gateReason
      };
    }
  }
  return { gated: false, reason: "No human-gate marker found in required artifacts" };
}

export function expectedArtifactCandidates(step: MigrationStepDefinition): string[] {
  switch (step.id) {
    case "00":
      return ["00-intake-preflight.md"];
    case "01":
      return ["01-assets.csv", "01-custom-nodes.md"];
    case "02":
      return ["02-feasibility.md"];
    case "03":
      return ["03-inventory.md", "03-workflow-topology.md"];
    case "04":
      return ["04-source-audit.md"];
    case "05":
      return ["05-environment.md"];
    case "06":
      return ["06-prompt-validation.json", "06-prompt.json"];
    case "07":
      return ["07-first-stage-smoke.md"];
    case "08":
      return ["08-full-validation.md"];
    case "09":
      return ["09-tuning.md"];
    case "10":
      return ["10-coverage-review.md"];
    case "11":
      return ["11-delivery.md", "migration-result-report.md"];
    case "12":
      return ["12-gui-acceptance.md"];
    case "13":
      return [
        "13-agent-improvement.json",
        "13-agent-improvement.md",
        "13-playbook-patch-plan.md",
        "13-phase3-readiness.json",
        "13-reflection.md",
        "13-reflection.json"
      ];
    default:
      return [];
  }
}

async function isReadableNonEmptyFile(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile() || stat.size === 0) return false;
    if (stat.size <= 1024 * 1024) {
      const content = await fs.readFile(filePath, "utf8");
      if (isInProgressScaffold(content)) return false;
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function readGateReason(filePath: string): Promise<string | undefined> {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile() || stat.size === 0 || stat.size > 1024 * 1024) return undefined;
    const content = await fs.readFile(filePath, "utf8");
    if (isInProgressScaffold(content)) return undefined;
    if (/["']?orchestrator_status["']?\s*[:=]\s*["']?human_gate_reached/i.test(content)) {
      return `Required artifact reached a human gate: ${path.basename(filePath)}`;
    }
    if (/["']?orchestrator_status["']?\s*[:=]\s*["']?complete/i.test(content)) return undefined;
    if (/No Step \d+ human gate triggered/i.test(content)) return undefined;
    if (
      /human[- ]?gated|human gate|human decision|human input|requires human approval|requires human direction|stop for the declared human gate|stop for human|hard stop before runtime/i.test(
        content
      )
    ) {
      return `Required artifact requests human decision: ${path.basename(filePath)}`;
    }
    return undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function isInProgressScaffold(content: string): boolean {
  return /["']?orchestrator_status["']?\s*[:=]\s*["']?in_progress/i.test(content);
}
