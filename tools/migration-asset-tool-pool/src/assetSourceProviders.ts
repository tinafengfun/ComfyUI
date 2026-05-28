import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type SourceProvider =
  | "huggingface"
  | "modelscope"
  | "github"
  | "civitai"
  | "comfyicu"
  | "ssh_remote";
type HttpJson = (url: string, provider: SourceProvider) => Promise<unknown>;
type ProviderSearchFn = (
  input: SearchInput,
  config: SourceProviderConfig,
  httpJson: HttpJson
) => Promise<AssetSourceCandidate[]>;

export interface AssetSourceCandidate {
  provider: SourceProvider;
  title: string;
  url: string;
  apiUrl?: string;
  downloadUrl?: string;
  sizeBytes?: number;
  sha256?: string;
  score: number;
  requiresToken: boolean;
  notes: string;
  downloadCommand?: string[];
}

export interface ProviderSearchIssue {
  provider: SourceProvider;
  message: string;
}

export interface SourceProviderConfig {
  enableNetworkSearch: boolean;
  allowInsecureTls: boolean;
  requestTimeoutSeconds: number;
  maxResultsPerProvider: number;
  huggingFaceEndpoint: string;
  modelScopeEndpoint: string;
  hasHuggingFaceToken: boolean;
  hasCivitaiToken: boolean;
  hasGitHubToken: boolean;
  proxyConfigured: boolean;
  proxyUrl?: string;
  enableDownload: boolean;
  explicitHuggingFaceFiles: HuggingFaceFileSource[];
  huggingFaceFallbackEndpoints: string[];
}

export interface HuggingFaceFileSource {
  endpoint: string;
  repoId: string;
  revision: string;
  filename: string;
  sourceUrl: string;
}

export interface SearchInput {
  query: string;
  assetName?: string;
  kind: "model" | "custom_node";
  targetPath?: string;
  config?: SourceProviderConfig;
  httpJson?: (url: string, provider: SourceProvider) => Promise<unknown>;
}

export interface SearchResult {
  candidates: AssetSourceCandidate[];
  issues: ProviderSearchIssue[];
  config: SourceProviderConfig;
}

export function buildSourceProviderConfig(env: NodeJS.ProcessEnv = process.env): SourceProviderConfig {
  const huggingFaceEndpoint = stripTrailingSlash(
    env.HF_ENDPOINT ?? env.HUGGINGFACE_ENDPOINT ?? "https://hf-mirror.com"
  );
  const huggingFaceFallbackEndpoints = (env.HF_FALLBACK_ENDPOINTS ?? defaultHuggingFaceFallbacks(huggingFaceEndpoint))
    .split(",")
    .map(stripTrailingSlash)
    .filter(Boolean);
  return {
    enableNetworkSearch: env.ASSET_SOURCE_SEARCH === "1" || (env.ASSET_SOURCE_SEARCH !== "0" && env.NODE_ENV !== "test"),
    allowInsecureTls: env.ASSET_SOURCE_INSECURE_TLS === "1",
    requestTimeoutSeconds: Number(env.ASSET_SOURCE_TIMEOUT_SECONDS ?? "12"),
    maxResultsPerProvider: Number(env.ASSET_SOURCE_MAX_RESULTS ?? "5"),
    huggingFaceEndpoint,
    modelScopeEndpoint: stripTrailingSlash(env.MODELSCOPE_ENDPOINT ?? "https://www.modelscope.cn"),
    hasHuggingFaceToken: Boolean(huggingFaceToken(env)),
    hasCivitaiToken: Boolean(civitaiToken(env)),
    hasGitHubToken: Boolean(githubToken(env)),
    proxyUrl: env.HTTPS_PROXY ?? env.HTTP_PROXY ?? env.ALL_PROXY ?? env.https_proxy ?? env.http_proxy ?? env.all_proxy,
    proxyConfigured: Boolean(env.HTTPS_PROXY ?? env.HTTP_PROXY ?? env.ALL_PROXY ?? env.https_proxy ?? env.http_proxy ?? env.all_proxy),
    enableDownload: env.ASSET_ACQUISITION_ENABLE_DOWNLOAD === "1",
    explicitHuggingFaceFiles: [],
    huggingFaceFallbackEndpoints
  };
}

export function extractHuggingFaceFileSources(context: string): HuggingFaceFileSource[] {
  const sources: HuggingFaceFileSource[] = [];
  const pattern = /https:\/\/(?:huggingface\.co|hf-mirror\.com)\/([^/\s`'")]+\/[^/\s`'")]+)\/(?:blob|resolve)\/([^/\s`'")]+)\/([^\s`'")]+)/g;
  for (const match of context.matchAll(pattern)) {
    const endpoint = stripTrailingSlash(new URL(match[0]).origin);
    const filePath = match[3].replace(/[),.;，。]+$/g, "");
    const filename = decodeURIComponent(path.basename(filePath));
    sources.push({
      endpoint,
      repoId: match[1],
      revision: match[2],
      filename,
      sourceUrl: `${endpoint}/${match[1]}/resolve/${match[2]}/${encodePathSegments(filePath)}`
    });
  }
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = `${source.endpoint}/${source.repoId}/${source.revision}/${source.filename}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function searchAssetSourceProviders(input: SearchInput): Promise<SearchResult> {
  const config = input.config ?? buildSourceProviderConfig();
  const httpJson = input.httpJson ?? ((url, provider) => curlJson(url, provider, config));
  const candidates: AssetSourceCandidate[] = [];
  const issues: ProviderSearchIssue[] = [];

  if (!config.enableNetworkSearch) {
    return {
      candidates,
      issues: [{ provider: "huggingface", message: "Network provider search disabled by ASSET_SOURCE_SEARCH or test mode." }],
      config
    };
  }

  const providers: Array<[SourceProvider, ProviderSearchFn]> =
    input.kind === "model"
      ? [
          ["huggingface", searchHuggingFace],
          ["modelscope", searchModelScope],
          ["civitai", searchCivitai]
        ]
      : [
          ["github", searchGitHub],
          ["comfyicu", searchComfyIcu]
        ];
  for (const [providerName, provider] of providers) {
    try {
      candidates.push(...(await provider(input, config, httpJson)));
    } catch (error) {
      issues.push({
        provider: providerName,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    candidates: rankCandidates(input.query, candidates).slice(0, config.maxResultsPerProvider * providers.length),
    issues,
    config
  };
}

export async function executeCandidateDownload(
  candidate: AssetSourceCandidate,
  env: NodeJS.ProcessEnv = process.env
): Promise<{ targetPath: string; stdout: string; stderr: string }> {
  if (!candidate.downloadCommand?.length) {
    throw new Error(`Candidate has no download command: ${candidate.title}`);
  }
  const [binary, ...rawArgs] = candidate.downloadCommand;
  if (binary !== "curl") {
    throw new Error(`Unsupported download command: ${binary}`);
  }
  const args = rawArgs.map((arg) => substituteEnvPlaceholders(arg, env));
  const outputIndex = args.indexOf("--output");
  const targetPath = outputIndex >= 0 ? args[outputIndex + 1] : undefined;
  if (!targetPath) throw new Error("Download command is missing --output target path.");
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const { stdout, stderr } = await execFileAsync(binary, args, {
    maxBuffer: 1024 * 1024,
    env
  });
  return { targetPath, stdout, stderr };
}

async function searchHuggingFace(
  input: SearchInput,
  config: SourceProviderConfig,
  httpJson: HttpJson
): Promise<AssetSourceCandidate[]> {
  const explicitCandidates = await searchExplicitHuggingFaceFiles(input, config, httpJson);
  const apiUrl = `${config.huggingFaceEndpoint}/api/models?search=${encodeURIComponent(input.query)}&limit=${config.maxResultsPerProvider}&full=true`;
  const response = await httpJson(apiUrl, "huggingface").catch(() => []);
  if (!Array.isArray(response)) return explicitCandidates;
  return [
    ...explicitCandidates,
    ...response.flatMap((item) => {
      const modelId = stringField(item, "modelId") || stringField(item, "id");
      if (!modelId) return [];
      const exactSibling = input.assetName ? siblingForFile(item, input.assetName) : undefined;
      const url = `${config.huggingFaceEndpoint}/${modelId}`;
      return [
        withDownloadCommand(
          {
            provider: "huggingface",
            title: modelId,
            url,
            apiUrl,
            downloadUrl: input.assetName && exactSibling
              ? `${config.huggingFaceEndpoint}/${modelId}/resolve/main/${encodeURIComponent(input.assetName)}`
              : undefined,
            sizeBytes: exactSibling?.sizeBytes,
            sha256: exactSibling?.sha256,
            score: scoreText(input.query, modelId),
            requiresToken: config.hasHuggingFaceToken,
            notes: exactSibling
              ? "HuggingFace model API search result with exact filename metadata."
              : "HuggingFace model API search result; exact filename was not present in returned metadata, so automatic download is disabled."
          },
          input,
          config
        )
      ];
    })
  ];
}

async function searchExplicitHuggingFaceFiles(
  input: SearchInput,
  config: SourceProviderConfig,
  httpJson: HttpJson
): Promise<AssetSourceCandidate[]> {
  if (!input.assetName) return [];
  const sources = config.explicitHuggingFaceFiles.filter((source) => source.filename === input.assetName);
  const candidates: AssetSourceCandidate[] = [];
  for (const source of sources) {
    const metadata = await huggingFaceFileMetadata(source, config, httpJson);
    for (const endpoint of uniqueStrings([source.endpoint, ...config.huggingFaceFallbackEndpoints])) {
      const downloadUrl = `${endpoint}/${source.repoId}/resolve/${source.revision}/${encodePathSegments(source.filename)}`;
      candidates.push(
        withDownloadCommand(
          {
            provider: "huggingface",
            title: `${source.repoId}/${source.filename}${endpoint === source.endpoint ? "" : ` via ${new URL(endpoint).hostname}`}`,
            url: `${endpoint}/${source.repoId}`,
            apiUrl: `${endpoint}/api/models/${source.repoId}`,
            downloadUrl,
            sizeBytes: metadata?.sizeBytes,
            sha256: metadata?.sha256,
            score: 120,
            requiresToken: config.hasHuggingFaceToken,
            notes:
              endpoint === source.endpoint
                ? "Explicit HuggingFace file source from operator context."
                : "Explicit HuggingFace file source using fallback endpoint after direct HuggingFace route is unavailable."
          },
          input,
          config
        )
      );
    }
  }
  return candidates;
}

async function huggingFaceFileMetadata(
  source: HuggingFaceFileSource,
  config: SourceProviderConfig,
  httpJson: HttpJson
): Promise<{ sizeBytes?: number; sha256?: string } | undefined> {
  for (const endpoint of uniqueStrings([config.huggingFaceEndpoint, source.endpoint, ...config.huggingFaceFallbackEndpoints])) {
    try {
      const response = await httpJson(`${endpoint}/api/models/${source.repoId}?blobs=true`, "huggingface");
      return siblingForFile(response, source.filename);
    } catch {
      // Metadata is best-effort; candidate execution can still attempt the exact source URL.
    }
  }
  return undefined;
}

async function searchModelScope(
  input: SearchInput,
  config: SourceProviderConfig,
  httpJson: HttpJson
): Promise<AssetSourceCandidate[]> {
  const apiUrl = `${config.modelScopeEndpoint}/api/v1/models?search=${encodeURIComponent(input.query)}&pageNumber=1&pageSize=${config.maxResultsPerProvider}`;
  const response = await httpJson(apiUrl, "modelscope");
  const rows = Array.isArray(response)
    ? response
    : Array.isArray((response as { data?: unknown[] })?.data)
      ? (response as { data: unknown[] }).data
      : Array.isArray((response as { Data?: { Models?: unknown[] } })?.Data?.Models)
        ? (response as { Data: { Models: unknown[] } }).Data.Models
        : [];
  return rows.flatMap((item) => {
    const modelId =
      stringField(item, "modelId") ||
      stringField(item, "name") ||
      stringField(item, "Name") ||
      stringField(item, "Path");
    if (!modelId) return [];
    const url = `${config.modelScopeEndpoint}/models/${modelId}`;
    return [
      withDownloadCommand(
        {
          provider: "modelscope",
          title: modelId,
          url,
          apiUrl,
          score: scoreText(input.query, modelId),
          requiresToken: false,
          notes: "ModelScope API search result; use modelscope/hub snapshot APIs or model-specific file API for exact download."
        },
        input,
        config
      )
    ];
  });
}

async function searchCivitai(
  input: SearchInput,
  config: SourceProviderConfig,
  httpJson: HttpJson
): Promise<AssetSourceCandidate[]> {
  const apiUrl = `https://civitai.com/api/v1/models?query=${encodeURIComponent(input.query)}&limit=${config.maxResultsPerProvider}`;
  const response = await httpJson(apiUrl, "civitai");
  const rows = Array.isArray((response as { items?: unknown[] })?.items) ? (response as { items: unknown[] }).items : [];
  return rows.flatMap((item) => {
    const name = stringField(item, "name");
    const id = numberField(item, "id");
    if (!name || id === undefined) return [];
    return [
      withDownloadCommand(
        {
          provider: "civitai",
          title: name,
          url: `https://civitai.com/models/${id}`,
          apiUrl,
          score: scoreText(input.query, name),
          requiresToken: config.hasCivitaiToken,
          notes: "Civitai model API search result; version/file selection is required before exact download."
        },
        input,
        config
      )
    ];
  });
}

async function searchGitHub(
  input: SearchInput,
  config: SourceProviderConfig,
  httpJson: HttpJson
): Promise<AssetSourceCandidate[]> {
  const apiUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(input.query)}&per_page=${config.maxResultsPerProvider}`;
  const response = await httpJson(apiUrl, "github");
  const rows = Array.isArray((response as { items?: unknown[] })?.items) ? (response as { items: unknown[] }).items : [];
  return rows.flatMap((item) => {
    const fullName = stringField(item, "full_name");
    const htmlUrl = stringField(item, "html_url");
    if (!fullName || !htmlUrl) return [];
    return [
      {
        provider: "github",
        title: fullName,
        url: htmlUrl,
        apiUrl,
        score: scoreText(input.query, fullName),
        requiresToken: config.hasGitHubToken,
        notes: "GitHub repository search result for custom-node source acquisition."
      }
    ];
  });
}

async function searchComfyIcu(input: SearchInput, config: SourceProviderConfig, _httpJson: HttpJson): Promise<AssetSourceCandidate[]> {
  const url = `https://comfy.icu/search?q=${encodeURIComponent(input.query)}`;
  const candidates: AssetSourceCandidate[] = [
    {
      provider: "comfyicu",
      title: `Comfy.ICU search: ${input.query}`,
      url,
      score: 1,
      requiresToken: false,
      notes: "Comfy.ICU has no stable public JSON API configured here; use this URL as a custom-node discovery fallback."
    }
  ];
  return candidates.slice(0, config.maxResultsPerProvider);
}

async function curlJson(url: string, provider: SourceProvider, config: SourceProviderConfig): Promise<unknown> {
  const args = [
    "-L",
    "--fail",
    "--silent",
    "--show-error",
    "--connect-timeout",
    String(Math.min(config.requestTimeoutSeconds, 10)),
    "--max-time",
    String(config.requestTimeoutSeconds),
    "-H",
    "Accept: application/json",
    url
  ];
  const tokenHeader = providerApiAuthHeader(provider);
  if (tokenHeader) args.splice(args.length - 1, 0, "-H", tokenHeader);
  if (config.allowInsecureTls) args.unshift("--insecure");
  const { stdout } = await execFileAsync("curl", args, {
    maxBuffer: 1024 * 1024,
    env: {
      ...process.env,
      ...(config.proxyUrl
        ? {
            HTTPS_PROXY: config.proxyUrl,
            HTTP_PROXY: config.proxyUrl,
            https_proxy: config.proxyUrl,
            http_proxy: config.proxyUrl
          }
        : {})
    }
  });
  return JSON.parse(stdout) as unknown;
}

function withDownloadCommand(
  candidate: AssetSourceCandidate,
  input: SearchInput,
  config: SourceProviderConfig
): AssetSourceCandidate {
  if (!candidate.downloadUrl || !input.targetPath) return candidate;
  const headers =
    candidate.provider === "huggingface" && config.hasHuggingFaceToken
      ? ["-H", "Authorization: Bearer ${HF_TOKEN}"]
      : candidate.provider === "civitai" && config.hasCivitaiToken
        ? ["-H", "Authorization: Bearer ${CIVITAI_TOKEN}"]
        : [];
  return {
    ...candidate,
    downloadCommand: [
      "curl",
      "-L",
      "--fail",
      "--retry",
      "10",
      "--retry-delay",
      "10",
      "--connect-timeout",
      "30",
      "--speed-time",
      "180",
      "--speed-limit",
      "1024",
      "--continue-at",
      "-",
      ...(config.allowInsecureTls || (candidate.provider === "huggingface" && config.proxyConfigured) ? ["--insecure"] : []),
      ...(config.proxyUrl ? ["--proxy", config.proxyUrl] : []),
      ...headers,
      "--output",
      input.targetPath,
      candidate.downloadUrl
    ],
    notes: `${candidate.notes} curl honors HTTPS_PROXY/HTTP_PROXY/ALL_PROXY and CURL_CA_BUNDLE/NODE_EXTRA_CA_CERTS at execution time.`
  };
}

function siblingForFile(value: unknown, filename: string): { sizeBytes?: number; sha256?: string } | undefined {
  if (!value || typeof value !== "object") return undefined;
  const siblings = (value as { siblings?: unknown[] }).siblings;
  if (!Array.isArray(siblings)) return undefined;
  const sibling = siblings.find((entry) => stringField(entry, "rfilename") === filename);
  if (!sibling || typeof sibling !== "object") return undefined;
  const lfs = (sibling as { lfs?: { sha256?: unknown; size?: unknown } }).lfs;
  const sizeBytes = typeof lfs?.size === "number" ? lfs.size : numberField(sibling, "size");
  const sha256 = typeof lfs?.sha256 === "string" ? lfs.sha256 : undefined;
  return { sizeBytes, sha256 };
}

function rankCandidates(query: string, candidates: AssetSourceCandidate[]): AssetSourceCandidate[] {
  return [...candidates].sort((left, right) => right.score - left.score || left.provider.localeCompare(right.provider));
}

function scoreText(query: string, value: string): number {
  const normalizedQuery = normalize(query);
  const normalizedValue = normalize(value);
  if (!normalizedQuery || !normalizedValue) return 0;
  if (normalizedValue === normalizedQuery) return 100;
  if (normalizedValue.includes(normalizedQuery)) return 80;
  const queryTokens = new Set(normalizedQuery.split(" ").filter(Boolean));
  const valueTokens = new Set(normalizedValue.split(" ").filter(Boolean));
  let score = 0;
  for (const token of queryTokens) if (valueTokens.has(token)) score += 10;
  return score;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function stringField(value: unknown, field: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  return typeof item[field] === "string" ? item[field] : undefined;
}

function numberField(value: unknown, field: string): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  return typeof item[field] === "number" ? item[field] : undefined;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function encodePathSegments(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/");
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean).map(stripTrailingSlash))];
}

function substituteEnvPlaceholders(value: string, env: NodeJS.ProcessEnv): string {
  return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_match, name: string) => env[name] ?? "");
}

function defaultHuggingFaceFallbacks(primaryEndpoint: string): string {
  const endpoints = primaryEndpoint === "https://hf-mirror.com"
    ? ["https://huggingface.co"]
    : ["https://hf-mirror.com", "https://huggingface.co"];
  return endpoints.filter((endpoint) => endpoint !== primaryEndpoint).join(",");
}

function huggingFaceToken(env: NodeJS.ProcessEnv): string | undefined {
  return env.HF_TOKEN ?? env.HUGGINGFACE_TOKEN ?? env.HF_MIRROR_TOKEN;
}

function civitaiToken(env: NodeJS.ProcessEnv): string | undefined {
  return env.CIVITAI_TOKEN ?? env.CIVITAI_API_TOKEN;
}

function githubToken(env: NodeJS.ProcessEnv): string | undefined {
  return env.GITHUB_TOKEN ?? env.GH_TOKEN;
}

function providerApiAuthHeader(provider: SourceProvider): string | undefined {
  if (provider === "huggingface") {
    const token = huggingFaceToken(process.env);
    return token ? `Authorization: Bearer ${token}` : undefined;
  }
  if (provider === "civitai") {
    const token = civitaiToken(process.env);
    return token ? `Authorization: Bearer ${token}` : undefined;
  }
  if (provider === "github") {
    const token = githubToken(process.env);
    return token ? `Authorization: Bearer ${token}` : undefined;
  }
  return undefined;
}
