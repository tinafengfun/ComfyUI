#!/usr/bin/env python3

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from script_examples.workflow_asset_inventory import (  # noqa: E402
    CATEGORY_PATHS,
    detect_format,
    load_json,
    normalize_model_name,
    summarize,
)


KNOWN_MODEL_SOURCES = {
    "smoothMix_Wan22-T2V_V20_highQ6K.gguf": {
        "repo_id": "BigDannyPt/WAN-2.2-SmoothMix-GGUF",
        "repo_path": "T2V/v2.0/High/smoothMixWan22I2VT2V_t2vHighV20_Q6_K.gguf",
        "target_name": "WAN2.2/smoothMix_Wan22-T2V_V20_highQ6K.gguf",
        "gated": True,
    },
    "smoothMix_Wan22-T2V_V20_lowQ6K.gguf": {
        "repo_id": "BigDannyPt/WAN-2.2-SmoothMix-GGUF",
        "repo_path": "T2V/v2.0/Low/smoothMixWan22I2VT2V_t2vLowV20_Q6_K.gguf",
        "target_name": "WAN2.2/smoothMix_Wan22-T2V_V20_lowQ6K.gguf",
        "gated": True,
    },
    "smoothMix_Wan2214B-I2V_i2v_V20_High.safetensors": {
        "repo_id": "JustAnotherCibrarian/ckpt",
        "repo_path": "1995784/2260110/smoothMixWan22I2V14B_i2vHigh.safetensors",
        "target_name": "WAN2.2/smoothMix_Wan2214B-I2V_i2v_V20_High.safetensors",
        "gated": True,
    },
    "smoothMix_Wan2214B-I2V_i2v_V20_Low.safetensors": {
        "repo_id": "JustAnotherCibrarian/ckpt",
        "repo_path": "1995784/2259006/smoothMixWan22I2V14B_i2vLow.safetensors",
        "target_name": "WAN2.2/smoothMix_Wan2214B-I2V_i2v_V20_Low.safetensors",
        "gated": True,
    },
    "smoothMix_Wan22-I2V_V20_highQ4KM.gguf": {
        "repo_id": "BigDannyPt/WAN-2.2-SmoothMix-GGUF",
        "target_name": "WAN2.2/smoothMix_Wan22-I2V_V20_highQ4KM.gguf",
        "candidate_repos": ["BigDannyPt/WAN-2.2-SmoothMix-GGUF"],
        "gated": True,
    },
    "smoothMix_Wan22-I2V_V20_lowQ4KM.gguf": {
        "repo_id": "BigDannyPt/WAN-2.2-SmoothMix-GGUF",
        "target_name": "WAN2.2/smoothMix_Wan22-I2V_V20_lowQ4KM.gguf",
        "candidate_repos": ["BigDannyPt/WAN-2.2-SmoothMix-GGUF"],
        "gated": True,
    },
    "wan_2.1_vae.safetensors": {
        "target_name": "wan_2.1_vae.safetensors",
        "candidate_repos": ["Comfy-Org/Wan_2.1_ComfyUI_repackaged"],
    },
    "umt5_xxl_fp8_e4m3fn_scaled.safetensors": {
        "target_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
        "candidate_repos": ["Comfy-Org/Wan_2.1_ComfyUI_repackaged"],
    },
    "umt5_xxl_fp16.safetensors": {
        "repo_id": "Comfy-Org/Wan_2.1_ComfyUI_repackaged",
        "repo_path": "split_files/text_encoders/umt5_xxl_fp16.safetensors",
        "target_name": "umt5_xxl_fp16.safetensors",
    },
    "clip_vision_h.safetensors": {
        "target_name": "clip_vision_h.safetensors",
        "candidate_repos": ["Comfy-Org/Wan_2.1_ComfyUI_repackaged"],
    },
    "Wan2.2-Fun-A14B-InP-high-noise-MPS.safetensors": {
        "repo_id": "alibaba-pai/Wan2.2-Fun-Reward-LoRAs",
        "repo_path": "Wan2.2-Fun-A14B-InP-high-noise-MPS.safetensors",
        "target_name": "Wan2.2-Fun-A14B-InP-high-noise-MPS.safetensors",
    },
    "Wan2.2-Fun-A14B-InP-low-noise-HPS2.1.safetensors": {
        "repo_id": "alibaba-pai/Wan2.2-Fun-Reward-LoRAs",
        "repo_path": "Wan2.2-Fun-A14B-InP-low-noise-HPS2.1.safetensors",
        "target_name": "Wan2.2-Fun-A14B-InP-low-noise-HPS2.1.safetensors",
    },
    "lightx2v_I2V_14B_480p_cfg_step_distill_rank256_bf16.safetensors": {
        "repo_id": "Kijai/WanVideo_comfy",
        "repo_path": "Lightx2v/lightx2v_I2V_14B_480p_cfg_step_distill_rank256_bf16.safetensors",
        "target_name": "lightx2v_I2V_14B_480p_cfg_step_distill_rank256_bf16.safetensors",
    },
    "wan2.2_i2v_A14b_high_noise_scaled_fp8_e4m3_lightx2v_4step_comfyui.safetensors": {
        "repo_id": "lightx2v/Wan2.2-Distill-Models",
        "repo_path": "wan2.2_i2v_A14b_high_noise_scaled_fp8_e4m3_lightx2v_4step_comfyui.safetensors",
        "target_name": "WAN2.2/wan2.2_i2v_A14b_high_noise_scaled_fp8_e4m3_lightx2v_4step_comfyui.safetensors",
    },
}

REPO_FILE_CACHE: dict[str, list[str]] = {}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Clone required custom nodes and stage or download workflow models for a ComfyUI workflow."
    )
    parser.add_argument("json_path", type=Path, help="Workflow JSON or API prompt JSON.")
    parser.add_argument("--search-root", action="append", type=Path, default=[], help="Model search roots.")
    parser.add_argument("--comfy-root", type=Path, default=REPO_ROOT, help="ComfyUI repository root.")
    parser.add_argument(
        "--custom-nodes-dir",
        type=Path,
        default=REPO_ROOT / "custom_nodes",
        help="Directory where custom-node repos should live.",
    )
    parser.add_argument(
        "--model-root",
        type=Path,
        default=REPO_ROOT / "models",
        help="Destination model root for staging and downloads.",
    )
    parser.add_argument(
        "--link-mode",
        choices=["symlink", "copy"],
        default="symlink",
        help="How to stage found models into the ComfyUI model tree.",
    )
    parser.add_argument("--clone-custom-nodes", action="store_true", help="Clone missing custom-node repositories.")
    parser.add_argument("--update-custom-nodes", action="store_true", help="Run git pull --ff-only in existing custom-node repositories.")
    parser.add_argument("--install-requirements", action="store_true", help="Install requirements.txt for required custom nodes.")
    parser.add_argument("--stage-models", action="store_true", help="Stage found models into the ComfyUI model tree.")
    parser.add_argument("--download-known-models", action="store_true", help="Download known WAN-family models with huggingface_hub when missing.")
    parser.add_argument("--hf-token", default=None, help="Optional Hugging Face token. Defaults to HF_TOKEN/HUGGING_FACE_HUB_TOKEN.")
    parser.add_argument("--dry-run", action="store_true", help="Print actions without changing the filesystem.")
    return parser


def run_command(command: list[str], dry_run: bool) -> None:
    print("+", " ".join(command))
    if dry_run:
        return
    subprocess.run(command, check=True)


def install_requirements(custom_node_dir: Path, dry_run: bool) -> None:
    req = custom_node_dir / "requirements.txt"
    if not req.exists():
        return
    run_command([sys.executable, "-m", "pip", "install", "-r", str(req)], dry_run)


def clone_or_update_custom_nodes(custom_nodes: list[dict[str, Any]], custom_nodes_dir: Path, dry_run: bool, update_existing: bool, install_reqs: bool) -> None:
    custom_nodes_dir.mkdir(parents=True, exist_ok=True)
    for item in custom_nodes:
        if not item.get("known_package"):
            print(f"! skip unknown package mapping: {item['package_id']}")
            continue
        target_dir = custom_nodes_dir / item["dir_name"]
        repo_url = item["repo_url"]
        if not target_dir.exists():
            run_command(["git", "clone", repo_url, str(target_dir)], dry_run)
        elif update_existing and (target_dir / ".git").exists():
            run_command(["git", "-C", str(target_dir), "pull", "--ff-only"], dry_run)
        if install_reqs and target_dir.exists():
            install_requirements(target_dir, dry_run)


def target_model_path(model_root: Path, category: str, model_name: str) -> Path:
    normalized = Path(normalize_model_name(model_name))
    subdir = CATEGORY_PATHS.get(category, [category])[0]
    return model_root / subdir / normalized


def ensure_parent(path: Path, dry_run: bool) -> None:
    if dry_run:
        print("+ mkdir -p", path.parent)
        return
    path.parent.mkdir(parents=True, exist_ok=True)


def stage_models(models: list[dict[str, Any]], model_root: Path, link_mode: str, dry_run: bool) -> None:
    for item in models:
        if item["special_case"] or not item["path"]:
            continue
        source = Path(item["path"])
        target = target_model_path(model_root, item["category"], item["model_name"])
        ensure_parent(target, dry_run)
        if target.exists():
            continue
        if link_mode == "symlink":
            print("+ ln -s", source, target)
            if not dry_run:
                target.symlink_to(source)
        else:
            print("+ cp", source, target)
            if not dry_run:
                shutil.copy2(source, target)


def get_hf_token(explicit_token: str | None) -> str | None:
    if explicit_token:
        return explicit_token
    return os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")


def resolve_candidate_repo_file(repo_id: str, filename: str, token: str | None) -> str | None:
    from huggingface_hub import list_repo_files

    files = REPO_FILE_CACHE.setdefault(repo_id, list_repo_files(repo_id=repo_id, token=token))
    exact_matches = [item for item in files if Path(item).name == filename]
    if len(exact_matches) == 1:
        return exact_matches[0]
    if not exact_matches:
        return None
    hints = []
    lowered = filename.lower()
    if "high" in lowered:
        hints.append("high")
    if "low" in lowered:
        hints.append("low")
    if "i2v" in lowered:
        hints.append("i2v")
    if "t2v" in lowered:
        hints.append("t2v")
    if "q4" in lowered:
        hints.append("q4")
    if "q6" in lowered:
        hints.append("q6")
    for item in exact_matches:
        item_lower = item.lower()
        if all(hint in item_lower for hint in hints):
            return item
    for item in exact_matches:
        if Path(item).name == filename:
            return item
    return None


def download_known_models(models: list[dict[str, Any]], model_root: Path, token: str | None, dry_run: bool) -> None:
    try:
        from huggingface_hub import hf_hub_download
    except ImportError as exc:
        raise SystemExit("huggingface_hub is required for --download-known-models") from exc

    for item in models:
        if item["special_case"] or item["path"]:
            continue
        manifest = KNOWN_MODEL_SOURCES.get(Path(item["model_name"]).name)
        if not manifest:
            print(f"! no known download source for {item['model_name']}")
            continue

        repo_path = manifest.get("repo_path")
        if not repo_path:
            candidate_repos = manifest.get("candidate_repos", [])
            for repo_id in candidate_repos:
                repo_path = resolve_candidate_repo_file(repo_id, Path(item["model_name"]).name, token)
                if repo_path:
                    manifest = {**manifest, "repo_id": repo_id, "repo_path": repo_path}
                    break
        if not repo_path:
            print(f"! unable to resolve repo path for {item['model_name']}")
            continue

        repo_id = manifest["repo_id"]
        target = target_model_path(model_root, item["category"], manifest.get("target_name", item["model_name"]))
        ensure_parent(target, dry_run)
        print(f"+ hf_hub_download {repo_id} {repo_path} -> {target}")
        if dry_run:
            continue
        downloaded = Path(
            hf_hub_download(
                repo_id=repo_id,
                filename=repo_path,
                token=token,
                resume_download=True,
            )
        )
        if target.exists():
            continue
        shutil.copy2(downloaded, target)


def main() -> int:
    args = build_parser().parse_args()
    data = load_json(args.json_path)
    summary = summarize(data, detect_format(data), args.search_root)

    if args.clone_custom_nodes or args.update_custom_nodes or args.install_requirements:
        clone_or_update_custom_nodes(
            summary["custom_nodes"],
            args.custom_nodes_dir,
            args.dry_run,
            args.update_custom_nodes,
            args.install_requirements,
        )

    if args.download_known_models:
        download_known_models(summary["models"], args.model_root, get_hf_token(args.hf_token), args.dry_run)
        summary = summarize(data, detect_format(data), args.search_root + [args.model_root])

    if args.stage_models:
        stage_models(summary["models"], args.model_root, args.link_mode, args.dry_run)

    remaining_missing = [
        item for item in summary["models"]
        if not item["special_case"] and not item["path"]
    ]
    if remaining_missing:
        print("remaining missing models:")
        for item in remaining_missing:
            print(" -", item["model_name"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
