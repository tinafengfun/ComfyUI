import fs from "node:fs/promises";
import path from "node:path";

export async function deleteTaskWorkspace(
  workspaceRootPath: string,
  workspacePath: string
): Promise<void> {
  const workspaceRoot = path.resolve(workspaceRootPath);
  const resolved = path.resolve(workspacePath);
  if (resolved === workspaceRoot || !resolved.startsWith(`${workspaceRoot}${path.sep}`)) {
    throw new Error(`Refusing to delete task workspace outside workspace root: ${workspacePath}`);
  }
  await fs.rm(resolved, { recursive: true, force: true });
}
