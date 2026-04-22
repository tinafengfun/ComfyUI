#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import subprocess
import time
from dataclasses import dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib import error, request


HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>XPU Memory Dashboard</title>
  <style>
    body { font-family: sans-serif; margin: 24px; background: #111827; color: #e5e7eb; }
    h1 { margin: 0 0 8px; }
    .muted { color: #9ca3af; }
    .row { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 16px; }
    .card { background: #1f2937; border-radius: 12px; padding: 16px; min-width: 260px; flex: 1; box-shadow: 0 2px 8px rgba(0,0,0,.25); }
    .bar { height: 12px; background: #374151; border-radius: 999px; overflow: hidden; margin-top: 8px; }
    .bar > div { height: 100%; background: #10b981; }
    .warn > div { background: #f59e0b; }
    .crit > div { background: #ef4444; }
    .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; margin-left: 8px; }
    .ok { background: #065f46; color: #d1fae5; }
    .warning { background: #92400e; color: #fef3c7; }
    .critical { background: #991b1b; color: #fee2e2; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; }
    button { background: #2563eb; border: 0; color: white; padding: 8px 12px; border-radius: 8px; cursor: pointer; }
  </style>
</head>
<body>
  <h1>XPU Memory Dashboard</h1>
  <div class="muted" id="status">Loading...</div>
  <div class="row">
    <div class="card">
      <h3>ComfyUI VRAM</h3>
      <div id="comfy-vram-text">-</div>
      <div class="bar" id="comfy-vram-bar"><div style="width:0%"></div></div>
      <div id="comfy-torch-text" style="margin-top:12px">-</div>
      <div class="bar" id="comfy-torch-bar"><div style="width:0%"></div></div>
    </div>
    <div class="card">
      <h3>XPU device</h3>
      <div id="xpu-main">-</div>
      <div id="xpu-extra" class="muted" style="margin-top:8px">-</div>
    </div>
    <div class="card">
      <h3>Warnings</h3>
      <div id="warnings">No warnings.</div>
      <div style="margin-top:12px">
        <button onclick="runPrecheck()">Run precheck</button>
      </div>
      <pre id="precheck" class="muted"></pre>
    </div>
  </div>
  <script>
    function fmt(n) { return Number.isFinite(n) ? n.toFixed(1) : "-"; }
    function setBar(id, pct) {
      const root = document.getElementById(id);
      root.className = "bar" + (pct >= 95 ? " crit" : (pct >= 85 ? " warn" : ""));
      root.firstElementChild.style.width = Math.max(0, Math.min(100, pct)) + "%";
    }
    function pill(level) {
      return `<span class="pill ${level}">${level.toUpperCase()}</span>`;
    }
    async function refresh() {
      try {
        const response = await fetch("/api/metrics");
        const data = await response.json();
        document.getElementById("status").textContent = `Last update: ${new Date(data.timestamp * 1000).toLocaleString()}`;
        if (data.errors.length) {
          document.getElementById("status").textContent += " | " + data.errors.join(" | ");
        }

        if (data.comfy) {
          document.getElementById("comfy-vram-text").textContent =
            `free ${fmt(data.comfy.vram_free_mib)} MiB / total ${fmt(data.comfy.vram_total_mib)} MiB`;
          document.getElementById("comfy-torch-text").textContent =
            `torch free ${fmt(data.comfy.torch_vram_free_mib)} MiB / total ${fmt(data.comfy.torch_vram_total_mib)} MiB`;
          setBar("comfy-vram-bar", data.comfy.vram_used_pct);
          setBar("comfy-torch-bar", data.comfy.torch_vram_used_pct);
        }

        if (data.xpu) {
          document.getElementById("xpu-main").innerHTML =
            `used ${fmt(data.xpu.memory_used_mib)} MiB (${fmt(data.xpu.memory_util_pct)}%)` +
            `, gpu ${fmt(data.xpu.gpu_util_pct)}%, power ${fmt(data.xpu.power_w)} W`;
          document.getElementById("xpu-extra").textContent =
            `core ${fmt(data.xpu.core_temp_c)} C, mem ${fmt(data.xpu.memory_temp_c)} C, freq ${fmt(data.xpu.freq_mhz)} MHz`;
        }

        const warnings = data.warnings.length
          ? data.warnings.map(item => `<div>${pill(item.level)} ${item.message}</div>`).join("")
          : "No warnings.";
        document.getElementById("warnings").innerHTML = warnings;
      } catch (err) {
        document.getElementById("status").textContent = `Dashboard fetch failed: ${err}`;
      }
    }
    async function runPrecheck() {
      document.getElementById("precheck").textContent = "Running precheck...";
      const response = await fetch("/api/precheck");
      const data = await response.json();
      document.getElementById("precheck").textContent = data.output;
    }
    refresh();
    setInterval(refresh, 2000);
  </script>
</body>
</html>
"""


@dataclass(frozen=True)
class Config:
    comfy_url: str
    device: str
    warn_free_mib: float
    critical_free_mib: float
    warn_used_pct: float
    listen: str
    port: int


def fetch_json(url: str) -> dict:
    with request.urlopen(url, timeout=5) as response:
        return json.loads(response.read())


def run_json_command(command: list[str]) -> dict:
    result = subprocess.run(command, capture_output=True, text=True, check=True)
    return json.loads(result.stdout)


def run_text_command(command: list[str]) -> str:
    result = subprocess.run(command, capture_output=True, text=True, check=True)
    return result.stdout.strip()


def normalize_comfy(system_stats: dict) -> dict:
    device = system_stats["devices"][0]
    vram_total_mib = device["vram_total"] / (1024 * 1024)
    vram_free_mib = device["vram_free"] / (1024 * 1024)
    torch_total_mib = device["torch_vram_total"] / (1024 * 1024)
    torch_free_mib = device["torch_vram_free"] / (1024 * 1024)
    return {
        "device_name": device["name"],
        "device_type": device["type"],
        "vram_total_mib": vram_total_mib,
        "vram_free_mib": vram_free_mib,
        "vram_used_pct": ((vram_total_mib - vram_free_mib) / vram_total_mib * 100.0) if vram_total_mib else 0.0,
        "torch_vram_total_mib": torch_total_mib,
        "torch_vram_free_mib": torch_free_mib,
        "torch_vram_used_pct": ((torch_total_mib - torch_free_mib) / torch_total_mib * 100.0) if torch_total_mib else 0.0,
    }


def normalize_xpu(stats: dict, health: dict) -> dict:
    metrics = {item["metrics_type"]: item["value"] for item in stats.get("device_level", [])}
    return {
        "power_w": metrics.get("XPUM_STATS_POWER"),
        "freq_mhz": metrics.get("XPUM_STATS_GPU_FREQUENCY"),
        "core_temp_c": metrics.get("XPUM_STATS_GPU_CORE_TEMPERATURE"),
        "memory_temp_c": metrics.get("XPUM_STATS_MEMORY_TEMPERATURE"),
        "memory_used_mib": metrics.get("XPUM_STATS_MEMORY_USED"),
        "memory_util_pct": metrics.get("XPUM_STATS_MEMORY_UTILIZATION"),
        "gpu_util_pct": metrics.get("XPUM_STATS_GPU_UTILIZATION"),
        "health": health,
    }


def collect_metrics(config: Config) -> dict:
    warnings: list[dict[str, str]] = []
    errors: list[str] = []
    comfy = None
    xpu = None

    try:
        comfy = normalize_comfy(fetch_json(f"{config.comfy_url}/system_stats"))
        if comfy["vram_free_mib"] <= config.critical_free_mib:
            warnings.append({"level": "critical", "message": f"ComfyUI free VRAM only {comfy['vram_free_mib']:.1f} MiB"})
        elif comfy["vram_free_mib"] <= config.warn_free_mib:
            warnings.append({"level": "warning", "message": f"ComfyUI free VRAM below warning threshold: {comfy['vram_free_mib']:.1f} MiB"})
        if comfy["torch_vram_free_mib"] <= config.critical_free_mib:
            warnings.append({"level": "critical", "message": f"Torch free VRAM only {comfy['torch_vram_free_mib']:.1f} MiB"})
    except (KeyError, ValueError, error.URLError, error.HTTPError) as exc:
        errors.append(f"ComfyUI stats unavailable: {exc}")

    try:
        xpu = normalize_xpu(
            run_json_command(["xpu-smi", "stats", "-d", config.device, "-j"]),
            run_json_command(["xpu-smi", "health", "-d", config.device, "-j"]),
        )
        if xpu["memory_util_pct"] is not None and xpu["memory_util_pct"] >= config.warn_used_pct:
            level = "critical" if xpu["memory_util_pct"] >= 95 else "warning"
            warnings.append({"level": level, "message": f"XPU memory utilization at {xpu['memory_util_pct']:.1f}%"})
        for key, value in xpu["health"].items():
            status = value.get("status")
            if status not in {"OK", "Unknown"}:
                warnings.append({"level": "critical", "message": f"xpu-smi health {key}: {status} - {value.get('description', '')}"})
    except (KeyError, ValueError, subprocess.CalledProcessError, json.JSONDecodeError) as exc:
        errors.append(f"xpu-smi unavailable: {exc}")

    return {
        "timestamp": time.time(),
        "comfy": comfy,
        "xpu": xpu,
        "warnings": warnings,
        "errors": errors,
    }


def run_precheck() -> str:
    try:
        return run_text_command(["xpu-smi", "diag", "--precheck"])
    except subprocess.CalledProcessError as exc:
        return exc.stdout + ("\n" + exc.stderr if exc.stderr else "")


def build_handler(config: Config):
    class Handler(BaseHTTPRequestHandler):
        def _send_json(self, payload: dict, status: int = HTTPStatus.OK) -> None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _send_html(self, payload: str) -> None:
            body = payload.encode("utf-8")
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self) -> None:  # noqa: N802
            if self.path == "/":
                self._send_html(HTML)
                return
            if self.path == "/api/metrics":
                self._send_json(collect_metrics(config))
                return
            if self.path == "/api/precheck":
                self._send_json({"output": run_precheck()})
                return
            self._send_json({"error": "not found"}, status=HTTPStatus.NOT_FOUND)

        def log_message(self, fmt: str, *args) -> None:
            return

    return Handler


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Serve a lightweight XPU/ComfyUI memory dashboard.")
    parser.add_argument("--listen", default="127.0.0.1", help="Dashboard listen address.")
    parser.add_argument("--port", type=int, default=8288, help="Dashboard port.")
    parser.add_argument("--comfy-url", default="http://127.0.0.1:8188", help="ComfyUI base URL.")
    parser.add_argument("--device", default="0", help="xpu-smi device id or PCI BDF.")
    parser.add_argument("--warn-free-mib", type=float, default=2048.0, help="Warn when ComfyUI free VRAM drops below this.")
    parser.add_argument("--critical-free-mib", type=float, default=1024.0, help="Critical warning when free VRAM drops below this.")
    parser.add_argument("--warn-used-pct", type=float, default=90.0, help="Warn when xpu-smi memory utilization reaches this percent.")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    config = Config(
        comfy_url=args.comfy_url.rstrip("/"),
        device=str(args.device),
        warn_free_mib=args.warn_free_mib,
        critical_free_mib=args.critical_free_mib,
        warn_used_pct=args.warn_used_pct,
        listen=args.listen,
        port=args.port,
    )
    server = ThreadingHTTPServer((config.listen, config.port), build_handler(config))
    print(f"dashboard=http://{config.listen}:{config.port}")
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

