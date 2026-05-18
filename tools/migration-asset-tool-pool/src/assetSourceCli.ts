import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import {
  downloadSshMatch,
  readModelSourceRegistry,
  searchLocalExact,
  searchSshExact,
  sha256Local,
  sha256Ssh,
  targetPathForAsset,
  type ExactSourceMatch
} from "./assetSourceRegistry";
import {
  buildSourceProviderConfig,
  executeCandidateDownload,
  extractHuggingFaceFileSources,
  searchAssetSourceProviders,
  type AssetSourceCandidate,
  type ProviderSearchIssue,
  type SourceProviderConfig
} from "./assetSourceProviders";

interface CliOptions {
  command: "search" | "download";
  assets: string[];
  kind: "model" | "custom_node";
  modelRepoPath: string;
  sourceContextPaths: string[];
  targetRoot: string;
  verifySha: boolean;
  providerSearch: boolean;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const registry = await readModelSourceRegistry(options.modelRepoPath);
  const report: Array<{
    assetName: string;
    targetPath: string;
    localMatches: ExactSourceMatch[];
    sshMatches: ExactSourceMatch[];
    providerCandidates: AssetSourceCandidate[];
    providerIssues: ProviderSearchIssue[];
    downloaded?: boolean;
    downloadedFrom?: string;
    verifiedSha256?: string;
    status: string;
  }> = [];
  const sourceContext = await readSourceContext(options.modelRepoPath, options.sourceContextPaths);
  const providerConfig = providerConfigFromRegistryAndContext(registry, sourceContext);

  for (const assetName of options.assets) {
    const targetPath = targetPathForAsset(assetName, options.targetRoot);
    const localMatches = await searchLocalExact(assetName, unique([options.targetRoot, ...registry.localDirs]));
    const sshMatches = await searchSshExact(assetName, registry.sshRemotes).catch((error) => {
      console.error(`SSH search failed for ${assetName}: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    });
    const localTarget = localMatches.find((match) => path.resolve(match.path) === path.resolve(targetPath));
    const providerResult = options.providerSearch
      ? await searchAssetSourceProviders({
          query: searchQueryForAsset(assetName),
          assetName: path.basename(assetName.replaceAll("\\", "/")),
          kind: options.kind,
          targetPath,
          config: providerConfig
        })
      : { candidates: [], issues: [], config: providerConfig };

    let downloaded = false;
    let downloadedFrom: string | undefined;
    let verifiedSha256: string | undefined;
    let status = localTarget
      ? "already_present"
      : sshMatches.length
        ? "ssh_exact_found"
        : providerResult.candidates.some((candidate) => candidate.downloadCommand?.length)
          ? "provider_exact_candidate_found"
          : "not_found";

    if (options.command === "download" && !localTarget) {
      const exact = chooseSshMatch(assetName, sshMatches);
      if (exact) {
        await downloadSshMatch(exact, targetPath);
        downloaded = true;
        downloadedFrom = "ssh_remote";
        status = "downloaded";
      } else {
        const providerCandidate = providerResult.candidates.find((candidate) => candidate.downloadCommand?.length);
        if (!providerCandidate) {
          status = "blocked_no_exact_download_source";
        } else if (!providerConfig.enableDownload) {
          status = "blocked_download_disabled";
        } else {
          await executeCandidateDownload(providerCandidate);
          downloaded = true;
          downloadedFrom = providerCandidate.provider;
          status = "downloaded";
        }
      }
    }

    if (options.verifySha) {
      const localPath = downloaded ? targetPath : localTarget?.path;
      const remoteMatch = chooseSshMatch(assetName, sshMatches);
      if (localPath && remoteMatch) {
        const [localSha, remoteSha] = await Promise.all([sha256Local(localPath), sha256Ssh(remoteMatch)]);
        if (localSha !== remoteSha) throw new Error(`sha256 mismatch for ${assetName}`);
        verifiedSha256 = localSha;
        status = downloaded ? "downloaded_sha256_verified" : "present_sha256_verified";
      }
    }

    report.push({
      assetName,
      targetPath,
      localMatches,
      sshMatches,
      providerCandidates: providerResult.candidates,
      providerIssues: providerResult.issues,
      downloaded,
      downloadedFrom,
      verifiedSha256,
      status
    });
  }

  console.log(JSON.stringify({
    modelRepoPath: options.modelRepoPath,
    targetRoot: options.targetRoot,
    localDirCount: registry.localDirs.length,
    sshRemoteCount: registry.sshRemotes.length,
    webSources: registry.webSources,
    providerConfig: {
      huggingFaceEndpoint: providerConfig.huggingFaceEndpoint,
      huggingFaceFallbackEndpoints: providerConfig.huggingFaceFallbackEndpoints,
      modelScopeEndpoint: providerConfig.modelScopeEndpoint,
      proxyConfigured: providerConfig.proxyConfigured,
      hasHuggingFaceToken: providerConfig.hasHuggingFaceToken,
      hasCivitaiToken: providerConfig.hasCivitaiToken,
      hasGitHubToken: providerConfig.hasGitHubToken,
      enableDownload: providerConfig.enableDownload
    },
    assets: report
  }, null, 2));
}

function parseArgs(args: string[]): CliOptions {
  const command = args[0];
  if (command !== "search" && command !== "download") usage();
  const assets: string[] = [];
  let kind: "model" | "custom_node" = "model";
  let modelRepoPath = path.resolve(process.cwd(), "../model_repo");
  const sourceContextPaths: string[] = [];
  let targetRoot = "/home/intel/hf_models";
  let verifySha = false;
  let providerSearch = true;

  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--asset") {
      const value = args[++index];
      if (!value) usage();
      assets.push(value);
    } else if (arg === "--asset-file") {
      const value = args[++index];
      if (!value) usage();
      assets.push(...readAssetFileSync(value));
    } else if (arg === "--model-repo") {
      modelRepoPath = path.resolve(args[++index] ?? usage());
    } else if (arg === "--kind") {
      const value = args[++index];
      if (value !== "model" && value !== "custom_node") usage();
      kind = value;
    } else if (arg === "--target-root") {
      targetRoot = path.resolve(args[++index] ?? usage());
    } else if (arg === "--source-context") {
      sourceContextPaths.push(path.resolve(args[++index] ?? usage()));
    } else if (arg === "--no-provider-search") {
      providerSearch = false;
    } else if (arg === "--verify-sha") {
      verifySha = true;
    } else {
      usage();
    }
  }
  if (!assets.length) usage();
  return { command, assets: unique(assets), kind, modelRepoPath, sourceContextPaths, targetRoot, verifySha, providerSearch };
}

function readAssetFileSync(filePath: string): string[] {
  return readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line: string) => line.trim())
    .filter(Boolean);
}

function chooseSshMatch(assetName: string, matches: ExactSourceMatch[]): ExactSourceMatch | undefined {
  const basename = path.basename(assetName.replaceAll("\\", "/"));
  return matches.find((match) => path.basename(match.path) === basename) ?? matches[0];
}

async function readSourceContext(modelRepoPath: string, sourceContextPaths: string[]): Promise<string> {
  const paths = unique([
    modelRepoPath,
    path.join(path.dirname(modelRepoPath), "huggingface_mode.md"),
    ...sourceContextPaths
  ]);
  const contents = await Promise.all(paths.map(readOptionalText));
  return contents.filter(Boolean).join("\n");
}

async function readOptionalText(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf8").catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  });
}

function providerConfigFromRegistryAndContext(
  registry: Awaited<ReturnType<typeof readModelSourceRegistry>>,
  context: string
): SourceProviderConfig {
  const base = buildSourceProviderConfig();
  const contextHfEndpoint =
    context.match(/\b(?:HF_ENDPOINT|HUGGINGFACE_ENDPOINT)\s*=\s*(https?:\/\/[^\s`'")]+)/)?.[1] ??
    registry.huggingFaceEndpoint;
  const proxyUrl = context.match(/\b(?:https?_proxy|HTTPS?_PROXY)\s*=\s*(https?:\/\/[^\s`'")]+)/)?.[1] ?? base.proxyUrl;
  const huggingFaceFallbackEndpoints =
    context.match(/\bHF_FALLBACK_ENDPOINTS\s*=\s*([^\s`'")]+)/)?.[1]
      ?.split(",")
      .map((endpoint) => endpoint.replace(/\/+$/, ""))
      .filter(Boolean) ?? base.huggingFaceFallbackEndpoints;
  return {
    ...base,
    proxyUrl,
    proxyConfigured: Boolean(proxyUrl),
    huggingFaceEndpoint: (contextHfEndpoint ?? base.huggingFaceEndpoint).replace(/\/+$/, ""),
    huggingFaceFallbackEndpoints,
    hasHuggingFaceToken:
      base.hasHuggingFaceToken ||
      registry.hasHuggingFaceToken ||
      /\b(?:HF_TOKEN|HUGGINGFACE_TOKEN|HF_MIRROR_TOKEN)\b/.test(context),
    hasCivitaiToken:
      base.hasCivitaiToken ||
      registry.hasCivitaiToken ||
      /\b(?:CIVITAI_TOKEN|CIVITAI_API_TOKEN)\b|\bcivitai\b[^。\n]*(?:token|api[_-]?key)/i.test(context),
    hasGitHubToken: base.hasGitHubToken || /\b(?:GITHUB_TOKEN|GH_TOKEN)\b/.test(context),
    explicitHuggingFaceFiles: extractHuggingFaceFileSources(context)
  };
}

function searchQueryForAsset(assetName: string): string {
  return path.basename(assetName.replaceAll("\\", "/")).replace(/\.(safetensors|ckpt|pt|pth|onnx|gguf|bin)$/i, "");
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function usage(): never {
  throw new Error(
    [
      "Usage:",
      "  npm run asset:sources -- search --asset <filename> [--asset <filename>...]",
      "  npm run asset:sources -- download --asset <filename> [--verify-sha]",
      "Options:",
      "  --model-repo <path>   default: ../model_repo",
      "  --kind <model|custom_node> default: model",
      "  --target-root <path>  default: /home/intel/hf_models",
      "  --source-context <path> extra source notes, one option per file",
      "  --asset-file <path>   newline-separated filenames",
      "  --no-provider-search  only search local roots and SSH remotes",
      "  --verify-sha          compare local and SSH source sha256",
      "",
      "Provider search is enabled by default and uses configured hf-mirror/HuggingFace, Civitai, GitHub, Comfy.ICU, and SSH/local sources.",
      "Downloads require ASSET_ACQUISITION_ENABLE_DOWNLOAD=1 and use token/proxy environment variables at runtime."
    ].join("\n")
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
