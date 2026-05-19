import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { MigrationTask } from "../shared/types";
import {
  buildSourceProviderConfig,
  extractHuggingFaceFileSources,
  searchAssetSourceProviders,
  type AssetSourceCandidate,
  type ProviderSearchIssue,
  type SearchResult
} from "./assetSourceProviders";
import { demoModelRoot } from "./config";

const execFileAsync = promisify(execFile);

interface AssetRow {
  asset_name: string;
  requested_name: string;
  resolved_path: string;
  source: string;
  state: string;
  staged_path: string;
  custom_node_repo: string;
  custom_node_cache_path: string;
  wrapper_source_evidence: string;
  commit: string;
  install_status: string;
  acquisition_status: string;
  mirror_used: string;
  credential_recorded: string;
  gap: string;
}

interface AssetJobItem {
  assetName: string;
  previousState: string;
  status: "already_staged" | "resolved_local_exact" | "pending_secure_download";
  resolvedPath?: string;
  plannedActions: string[];
  targetPath?: string;
  candidates?: AssetSourceCandidate[];
  searchIssues?: ProviderSearchIssue[];
}

interface CustomNodeJobItem {
  packageHint: string;
  nodeType: string;
  status: "source_known" | "candidate_sources_found" | "source_search_pending";
  candidates: AssetSourceCandidate[];
  searchIssues: ProviderSearchIssue[];
}

export interface AssetAcquisitionJobResult {
  jobPath: string;
  reportPath: string;
  assetsPath: string;
  status: "completed" | "waiting_for_secure_download";
  resolvedCount: number;
  unresolvedCount: number;
  pendingDownloadCount: number;
  localSearchRoots: string[];
  remoteOrWebSourceCount: number;
  providerCandidateCount: number;
  customNodeCandidateCount: number;
  remoteCandidateCount: number;
}

interface RemoteModelSource {
  host: string;
  user?: string;
  root: string;
}

const assetHeaders = [
  "asset_name",
  "requested_name",
  "resolved_path",
  "source",
  "state",
  "staged_path",
  "custom_node_repo",
  "custom_node_cache_path",
  "wrapper_source_evidence",
  "commit",
  "install_status",
  "acquisition_status",
  "mirror_used",
  "credential_recorded",
  "gap"
];

export async function ensureAssetAcquisitionJob(input: {
  task: MigrationTask;
  modelRoots: string[];
  comfyuiRoot: string;
  humanContext: string;
  redactedHumanContext: string;
  stepId?: string;
  modelRepoPath?: string;
  sourceContextPaths?: string[];
  sourceSearch?: (input: {
    query: string;
    assetName?: string;
    kind: "model" | "custom_node";
    targetPath?: string;
  }) => Promise<SearchResult>;
  remoteSearch?: (assetName: string, targetPath: string, remotes: RemoteModelSource[]) => Promise<{
    candidates: AssetSourceCandidate[];
    issues: ProviderSearchIssue[];
  }>;
}): Promise<AssetAcquisitionJobResult> {
  const stepId = input.stepId ?? "01";
  const assetsPath = path.join(input.task.artifactPath, `${stepId}-assets.csv`);
  const rows = parseAssetRows(await fs.readFile(assetsPath, "utf8"));
  const sourceContextPaths = uniquePaths([
    ...(input.modelRepoPath ? [input.modelRepoPath] : []),
    ...(input.modelRepoPath ? [path.join(path.dirname(input.modelRepoPath), "huggingface_mode.md")] : []),
    ...(input.sourceContextPaths ?? [])
  ]);
  const sourceRegistryContext = (await Promise.all(sourceContextPaths.map(readOptionalText))).filter(Boolean).join("\n");
  const combinedContext = `${input.humanContext}\n${sourceRegistryContext}`;
  const combinedRedactedContext = `${input.redactedHumanContext}\n${redactRegistrySecrets(sourceRegistryContext)}`;
  const remoteModelSources = extractRemoteModelSources(combinedRedactedContext);
  const localSearchRoots = await existingDirectories(
    uniquePaths([
      demoModelRoot,
      ...input.modelRoots,
      path.join(input.comfyuiRoot, "models"),
      ...extractLocalPaths(combinedContext),
      ...extractLocalModelDirs(sourceRegistryContext)
    ])
  );
  const localIndex = await indexFilesByBasename(localSearchRoots);
  const remoteOrWebSources = extractRemoteOrWebSources(combinedRedactedContext);
  const providerConfig = sourceProviderConfigFromContext(combinedRedactedContext);
  const items: AssetJobItem[] = [];
  const customNodeItems: CustomNodeJobItem[] = [];
  let resolvedCount = 0;
  let unresolvedCount = 0;
  let pendingDownloadCount = 0;
  let providerCandidateCount = 0;
  let customNodeCandidateCount = 0;
  let remoteCandidateCount = 0;
  const sourceSearch =
    input.sourceSearch ??
    ((queryInput: {
      query: string;
      assetName?: string;
      kind: "model" | "custom_node";
      targetPath?: string;
    }) => searchAssetSourceProviders({ ...queryInput, config: providerConfig }));
  const remoteSearch = input.remoteSearch ?? searchRemoteExactAssets;

  for (const row of rows) {
    if (!row.gap) {
      items.push({
        assetName: row.asset_name,
        previousState: row.state,
        status: "already_staged",
        resolvedPath: row.resolved_path,
        plannedActions: ["No acquisition needed; asset was already staged before the job."]
      });
      resolvedCount += 1;
      continue;
    }

    const exact = localIndex.get(row.requested_name || row.asset_name)?.[0];
    if (exact) {
      row.resolved_path = exact;
      row.source = "local source context exact match";
      row.state = "staged";
      row.staged_path = exact;
      row.install_status = "present";
      row.acquisition_status = "complete";
      row.mirror_used = "none";
      row.credential_recorded = "false";
      row.gap = "";
      items.push({
        assetName: row.asset_name,
        previousState: "source-identical asset not staged",
        status: "resolved_local_exact",
        resolvedPath: exact,
        plannedActions: ["Resolved by exact filename search in approved local roots."]
      });
      resolvedCount += 1;
      continue;
    }

    unresolvedCount += 1;
    pendingDownloadCount += 1;
    const targetPath = path.join(
      primaryModelRoot(input.modelRoots, input.comfyuiRoot),
      targetSubdir(row),
      ...assetPathSegments(row.requested_name || row.asset_name)
    );
    const remoteSearchResult = await remoteSearch(row.requested_name || row.asset_name, targetPath, remoteModelSources);
    remoteCandidateCount += remoteSearchResult.candidates.length;
    const search = await sourceSearch({
      query: searchQueryForAsset(row),
      assetName: row.requested_name || row.asset_name,
      kind: "model",
      targetPath
    });
    const candidates = [...remoteSearchResult.candidates, ...search.candidates];
    const searchIssues = [...remoteSearchResult.issues, ...search.issues];
    providerCandidateCount += candidates.length;
    items.push({
      assetName: row.asset_name,
      previousState: row.state,
      status: "pending_secure_download",
      targetPath,
      candidates,
      searchIssues,
      plannedActions: [
        "Exact file was not found in local search roots.",
        candidates.length
          ? `Provider/remote search found ${candidates.length} candidate source(s); inspect candidates and execute a secure download plan if source-identical.`
          : "Provider search did not find a confirmed candidate source.",
        remoteOrWebSources.length
          ? "Remote/web sources were provided, but downloads require a secure credential/proxy execution channel outside chat-persisted state."
          : "No remote/web source was provided; operator must provide a local file path or approved source."
      ]
    });
  }

  for (const customNode of await parseCustomNodeRows(path.join(input.task.artifactPath, `${stepId}-custom-nodes.md`))) {
    if (customNode.evidence.startsWith("custom_nodes/")) {
      customNodeItems.push({
        packageHint: customNode.packageHint,
        nodeType: customNode.nodeType,
        status: "source_known",
        candidates: [],
        searchIssues: []
      });
      continue;
    }
    const search = await sourceSearch({
      query: customNode.packageHint,
      kind: "custom_node"
    });
    customNodeCandidateCount += search.candidates.length;
    customNodeItems.push({
      packageHint: customNode.packageHint,
      nodeType: customNode.nodeType,
      status: search.candidates.length ? "candidate_sources_found" : "source_search_pending",
      candidates: search.candidates,
      searchIssues: search.issues
    });
  }

  await fs.writeFile(assetsPath, csv(rows), "utf8");
  const status = pendingDownloadCount === 0 ? "completed" : "waiting_for_secure_download";
  const job = {
    jobId: `${input.task.id}:${stepId}:asset-acquisition`,
    taskId: input.task.id,
    stepId,
    status,
    createdAt: new Date().toISOString(),
    credentialsPersisted: false,
    sourceProviderConfig: {
      profileName: providerConfig.profileName,
      enableNetworkSearch: providerConfig.enableNetworkSearch,
      allowInsecureTls: providerConfig.allowInsecureTls,
      huggingFaceEndpoint: providerConfig.huggingFaceEndpoint,
      modelScopeEndpoint: providerConfig.modelScopeEndpoint,
      proxyConfigured: providerConfig.proxyConfigured,
      proxySource: providerConfig.proxySource,
      hasHuggingFaceToken: providerConfig.hasHuggingFaceToken,
      hasCivitaiToken: providerConfig.hasCivitaiToken,
      hasGitHubToken: providerConfig.hasGitHubToken,
      enableDownload: providerConfig.enableDownload,
      explicitHuggingFaceFileSources: providerConfig.explicitHuggingFaceFiles.length,
      huggingFaceFallbackEndpoints: providerConfig.huggingFaceFallbackEndpoints,
      tokenEnvNames: providerConfig.tokenEnvNames,
      proxyEnvNames: providerConfig.proxyEnvNames
    },
    remoteModelSources: remoteModelSources.map((remote) => ({
      host: remote.host,
      user: remote.user,
      root: remote.root
    })),
    localSearchRoots,
    remoteOrWebSources,
    providerCandidateCount,
    customNodeCandidateCount,
    remoteCandidateCount,
    items,
    customNodeItems
  };
  const jobPath = path.join(input.task.artifactPath, `${stepId}-acquisition-job.json`);
  const reportPath = path.join(input.task.artifactPath, `${stepId}-acquisition-report.md`);
  await fs.writeFile(jobPath, `${JSON.stringify(job, null, 2)}\n`, "utf8");
  await fs.writeFile(
    reportPath,
    [
      `# Step ${stepId} asset acquisition job`,
      "",
      `orchestrator_status: ${status}`,
      "",
      `task_id: \`${input.task.id}\``,
      `credentials_persisted: false`,
      `download_profile: \`${providerConfig.profileName}\``,
      `provider_search_enabled: ${providerConfig.enableNetworkSearch}`,
      `proxy_configured: ${providerConfig.proxyConfigured}`,
      `proxy_source: \`${providerConfig.proxySource ?? "none"}\``,
      `huggingface_endpoint: \`${providerConfig.huggingFaceEndpoint}\``,
      `huggingface_fallback_endpoints: ${providerConfig.huggingFaceFallbackEndpoints.map((endpoint) => `\`${endpoint}\``).join(", ") || "none"}`,
      `token_env_names: HuggingFace=${providerConfig.tokenEnvNames.huggingface.join("/")}; Civitai=${providerConfig.tokenEnvNames.civitai.join("/")}; GitHub=${providerConfig.tokenEnvNames.github.join("/")}`,
      `local_search_roots: ${localSearchRoots.length ? localSearchRoots.map((root) => `\`${root}\``).join(", ") : "none"}`,
      `remote_or_web_sources: ${remoteOrWebSources.length}`,
      `remote_model_sources: ${remoteModelSources.length}`,
      "",
      "## Result",
      "",
      `- Resolved or already staged: ${resolvedCount}`,
      `- Still unresolved: ${unresolvedCount}`,
      `- Pending secure download/provisioning: ${pendingDownloadCount}`,
      `- Model provider candidates: ${providerCandidateCount}`,
      `- SSH remote exact-file candidates: ${remoteCandidateCount}`,
      `- Custom-node provider candidates: ${customNodeCandidateCount}`,
      "",
      "## Model items",
      "",
      "| Asset | Status | Target / resolved path | Provider candidates | Next action |",
      "| --- | --- | --- | --- | --- |",
      ...items.map((item) =>
        `| ${cell(item.assetName)} | ${item.status} | ${cell(item.resolvedPath ?? item.targetPath ?? "")} | ${item.candidates?.length ?? 0} | ${cell(item.plannedActions.join(" "))} |`
      ),
      "",
      "## Custom-node source candidates",
      "",
      "| Package hint | Node type | Status | Provider candidates |",
      "| --- | --- | --- | --- |",
      ...customNodeItems.map((item) =>
        `| ${cell(item.packageHint)} | ${cell(item.nodeType)} | ${item.status} | ${item.candidates.length} |`
      ),
      "",
      "## Download execution design",
      "",
      "- Provider search uses source-specific APIs where available: HuggingFace model API, Civitai model API, GitHub repository API, and a configurable ModelScope API endpoint.",
      "- SSH remote search uses exact filename lookup only and requires key-based auth or an external secure credential channel; registry passwords are not persisted or injected from artifacts.",
      "- `curl` is used as the execution substrate for downloads because it honors `ASSET_DOWNLOAD_PROXY`, `HTTPS_PROXY`, `HTTP_PROXY`, `ALL_PROXY`, `CURL_CA_BUNDLE`, and resumable `--continue-at -` behavior.",
      "- Auth headers and proxy values are represented with environment-variable placeholders in job candidates, never concrete credential or proxy URL values.",
      "- Set `ASSET_SOURCE_SEARCH=1` to force provider API search, `ASSET_SOURCE_INSECURE_TLS=1` only for trusted corporate TLS interception, and `ASSET_ACQUISITION_ENABLE_DOWNLOAD=1` or `MIGRATION_AGENT_DOWNLOAD_PROFILE=demo` before enabling controlled downloads.",
      "",
      "## Boundary",
      "",
      "The backend executed local exact-file search, provider API discovery, and updated `01-assets.csv` for exact matches. It did not execute remote SSH/web downloads from chat-provided credentials; unresolved items require a secure credential/proxy download channel or locally staged files.",
      ""
    ].join("\n"),
    "utf8"
  );

  return {
    jobPath,
    reportPath,
    assetsPath,
    status,
    resolvedCount,
    unresolvedCount,
    pendingDownloadCount,
    localSearchRoots,
    remoteOrWebSourceCount: remoteOrWebSources.length,
    providerCandidateCount,
    customNodeCandidateCount,
    remoteCandidateCount
  };
}

function parseAssetRows(content: string): AssetRow[] {
  const lines = content.trimEnd().split(/\r?\n/);
  const headers = parseCsvLine(lines[0] ?? "");
  return lines.slice(1).filter(Boolean).map((line) => {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    return Object.fromEntries(assetHeaders.map((header) => [header, row[header] ?? ""])) as unknown as AssetRow;
  });
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function csv(rows: AssetRow[]): string {
  return [
    assetHeaders.join(","),
    ...rows.map((row) => assetHeaders.map((header) => quote(row[header as keyof AssetRow] ?? "")).join(",")),
    ""
  ].join("\n");
}

function quote(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function existingDirectories(paths: string[]): Promise<string[]> {
  const result: string[] = [];
  for (const item of paths) {
    const stat = await fs.stat(item).catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    });
    if (stat?.isDirectory()) result.push(item);
  }
  return uniquePaths(result);
}

function extractLocalPaths(context: string): string[] {
  const matches = context.match(/\/[A-Za-z0-9._/@+-]+/g) ?? [];
  return matches.map((item) => item.replace(/[),.;，。]+$/g, ""));
}

function extractLocalModelDirs(context: string): string[] {
  return context
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*local\s+dir\s+(.+)$/i)?.[1]?.trim())
    .filter((item): item is string => Boolean(item));
}

function extractRemoteOrWebSources(context: string): string[] {
  const urls = context.match(/https?:\/\/[^\s`'")]+/g) ?? [];
  const sshHints = context.match(/\b(?:ssh|remote|scp|rsync)\b[^。\n]*/gi) ?? [];
  return uniqueStrings([...urls, ...sshHints].map((item) => item.trim()).filter(Boolean));
}

function sourceProviderConfigFromContext(context: string) {
  const base = buildSourceProviderConfig();
  const proxyUrl =
    context.match(/\b(?:ASSET_DOWNLOAD_PROXY|MIGRATION_AGENT_DOWNLOAD_PROXY|https?_proxy|HTTPS?_PROXY|ALL_PROXY|all_proxy)\s*=\s*(https?:\/\/[^\s`'")]+)/)?.[1] ??
    base.proxyUrl;
  const huggingFaceEndpoint =
    context.match(/\b(?:HF_ENDPOINT|HUGGINGFACE_ENDPOINT)\s*=\s*(https?:\/\/[^\s`'")]+)/)?.[1] ?? base.huggingFaceEndpoint;
  const explicitHuggingFaceFiles = extractHuggingFaceFileSources(context);
  const huggingFaceFallbackEndpoints =
    context.match(/\bHF_FALLBACK_ENDPOINTS\s*=\s*([^\s`'")]+)/)?.[1]
      ?.split(",")
      .map((endpoint) => endpoint.replace(/\/+$/, ""))
      .filter(Boolean) ?? base.huggingFaceFallbackEndpoints;
  return {
    ...base,
    proxyUrl,
    proxySource: proxyUrl && proxyUrl !== base.proxyUrl ? "source_context" : base.proxySource,
    proxyConfigured: Boolean(proxyUrl),
    huggingFaceEndpoint: huggingFaceEndpoint.replace(/\/+$/, ""),
    huggingFaceFallbackEndpoints,
    hasHuggingFaceToken: base.hasHuggingFaceToken || /\b(?:HF_TOKEN|HUGGING_FACE_HUB_TOKEN|HUGGINGFACE_TOKEN|HF_MIRROR_TOKEN|HF_ACCESS_TOKEN)\b/.test(context),
    hasCivitaiToken: base.hasCivitaiToken || /\b(?:CIVITAI_TOKEN|CIVITAI_API_TOKEN)\b|\bcivitai\b[^。\n]*(?:token|api[_-]?key)/i.test(context),
    hasGitHubToken: base.hasGitHubToken || /\b(?:GITHUB_TOKEN|GH_TOKEN)\b/.test(context),
    explicitHuggingFaceFiles
  };
}

async function readOptionalText(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf8").catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  });
}

function redactRegistrySecrets(context: string): string {
  return context
    .replace(/\b(export\s+)?(HF_TOKEN|HUGGING_FACE_HUB_TOKEN|HUGGINGFACE_TOKEN|HF_MIRROR_TOKEN|HF_ACCESS_TOKEN|CIVITAI_TOKEN|CIVITAI_API_TOKEN|GITHUB_TOKEN|GH_TOKEN)\s*=\s*['"]?[^'"\s]+['"]?/gi, (_match, exportPrefix = "", name) => `${exportPrefix}${name}=[REDACTED]`)
    .replace(/\b(pwd|password|passwd|token|secret|api[_-]?key)\s*[:=]?\s+[^\s,;]+/gi, "$1 [REDACTED]")
    .replace(/(hf_)[A-Za-z0-9]{12,}/g, "$1[REDACTED]");
}

function extractRemoteModelSources(context: string): RemoteModelSource[] {
  const remotes: RemoteModelSource[] = [];
  for (const line of context.split(/\r?\n/)) {
    const match = line.match(/remote:\s*([A-Za-z0-9_.-]+):([~/$A-Za-z0-9_.@+-][^\s,;]*)/i);
    if (!match) continue;
    const user = line.match(/login\s+user:\s*([A-Za-z0-9_.-]+)/i)?.[1];
    remotes.push({
      host: match[1],
      root: match[2],
      user
    });
  }
  return remotes;
}

async function searchRemoteExactAssets(
  assetName: string,
  targetPath: string,
  remotes: RemoteModelSource[]
): Promise<{ candidates: AssetSourceCandidate[]; issues: ProviderSearchIssue[] }> {
  const candidates: AssetSourceCandidate[] = [];
  const issues: ProviderSearchIssue[] = [];
  const searchNames = uniqueStrings([assetName, assetName.split(/[\\/]+/).filter(Boolean).at(-1) ?? assetName]);
  for (const remote of remotes) {
    const login = remote.user ? `${remote.user}@${remote.host}` : remote.host;
    const nameExpression = searchNames.map((name) => `-name ${shellQuote(name)}`).join(" -o ");
    const command = `find ${remotePathExpression(remote.root)} -type f \\( ${nameExpression} \\) -print -quit 2>/dev/null`;
    try {
      const { stdout } = await execFileAsync(
        "ssh",
        ["-o", "BatchMode=yes", "-o", "ConnectTimeout=8", login, command],
        { timeout: 12_000, maxBuffer: 256 * 1024 }
      );
      const remotePath = stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
      if (!remotePath) continue;
      const sizeBytes = await remoteFileSize(login, remotePath).catch(() => undefined);
      candidates.push({
        provider: "ssh_remote",
        title: `${login}:${remotePath}`,
        url: `ssh://${login}/${remotePath.replace(/^\/+/, "")}`,
        downloadUrl: `${login}:${remotePath}`,
        sizeBytes,
        score: 100,
        requiresToken: false,
        notes: "Exact filename found on configured SSH remote. Download requires key-based auth or an external secure credential channel.",
        downloadCommand: [
          "scp",
          "-o",
          "BatchMode=yes",
          "-o",
          "ConnectTimeout=30",
          `${login}:${remotePath}`,
          targetPath
        ]
      });
    } catch (error) {
      issues.push({
        provider: "ssh_remote",
        message: `SSH exact search failed for ${login}:${remote.root}: ${
          error instanceof Error ? error.message.split("\n")[0] : String(error)
        }`
      });
    }
  }
  return { candidates, issues };
}

async function remoteFileSize(login: string, remotePath: string): Promise<number | undefined> {
  const { stdout } = await execFileAsync(
    "ssh",
    ["-o", "BatchMode=yes", "-o", "ConnectTimeout=8", login, `stat -c%s ${shellQuote(remotePath)} 2>/dev/null`],
    { timeout: 12_000, maxBuffer: 64 * 1024 }
  );
  const value = Number(stdout.trim());
  return Number.isFinite(value) ? value : undefined;
}

function remotePathExpression(remotePath: string): string {
  if (remotePath.startsWith("~/")) return `"$HOME/${remotePath.slice(2).replaceAll('"', '\\"')}"`;
  return shellQuote(remotePath);
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function parseCustomNodeRows(filePath: string): Promise<Array<{
  nodeType: string;
  packageHint: string;
  evidence: string;
}>> {
  const content = await fs.readFile(filePath, "utf8").catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  });
  const rows: Array<{ nodeType: string; packageHint: string; evidence: string }> = [];
  for (const line of content.split(/\r?\n/)) {
    if (!line.startsWith("|") || line.includes("---") || line.includes("Node type")) continue;
    const cells = line.split("|").slice(1, -1).map((cellValue) => cellValue.trim());
    const [nodeType, packageHint, evidence] = cells;
    if (!nodeType || !packageHint || packageHint === "-" || nodeType === "none detected") continue;
    rows.push({ nodeType, packageHint, evidence: evidence ?? "" });
  }
  return rows;
}

function searchQueryForAsset(row: AssetRow): string {
  return (row.requested_name || row.asset_name).replace(/\.(safetensors|ckpt|pt|pth|onnx|gguf|bin)$/i, "");
}

function primaryModelRoot(modelRoots: string[], comfyuiRoot: string): string {
  if (modelRoots.map((root) => path.resolve(root)).includes(path.resolve(demoModelRoot))) return demoModelRoot;
  return modelRoots[0] ?? path.join(comfyuiRoot, "models");
}

function targetSubdir(row: AssetRow): string {
  const evidence = row.wrapper_source_evidence.toLowerCase();
  const name = (row.requested_name || row.asset_name).toLowerCase();
  if (evidence.includes("upscalemodelloader") || name.includes("ultrasharp")) return "upscale_models";
  if (evidence.includes("lora") || name.includes("lora")) return "loras";
  if (evidence.includes("vae") || name.includes("vae") || name === "ae.safetensors") return "vae";
  if (evidence.includes("clip") || name.includes("qwen")) return "text_encoders";
  if (evidence.includes("seedvr2") || name.includes("seedvr2")) return "SEEDVR2";
  if (evidence.includes("unet") || name.includes("z_image")) return "diffusion_models";
  return "";
}

async function indexFilesByBasename(roots: string[]): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  for (const root of roots) {
    await walk(root, (file) => {
      for (const key of localIndexKeys(root, file)) {
        const matches = result.get(key) ?? [];
        matches.push(file);
        result.set(key, matches);
      }
    });
  }
  return result;
}

function localIndexKeys(root: string, file: string): string[] {
  const relative = path.relative(root, file).split(path.sep).join("/");
  const parts = relative.split("/").filter(Boolean);
  const basename = parts.at(-1) ?? path.basename(file);
  const parentAndName = parts.length >= 2 ? parts.slice(-2).join("/") : basename;
  return uniqueStrings([
    basename,
    relative,
    relative.replaceAll("/", "\\"),
    parentAndName,
    parentAndName.replaceAll("/", "\\")
  ]);
}

async function walk(dir: string, visit: (file: string) => void): Promise<void> {
  let entries: Array<{ name: string; isDirectory(): boolean }>;
  try {
    entries = (await fs.readdir(dir, { withFileTypes: true })) as Array<{
      name: string;
      isDirectory(): boolean;
    }>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(fullPath, visit);
    else visit(fullPath);
  }
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.filter(Boolean).map((item) => path.resolve(item)))];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function assetPathSegments(assetName: string): string[] {
  return assetName.split(/[\\/]+/).filter(Boolean);
}

function cell(value: string): string {
  return value.replaceAll("|", "\\|").replace(/\r?\n/g, "<br>");
}
