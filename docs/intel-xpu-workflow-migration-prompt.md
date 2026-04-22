# Prompt template for the next Intel XPU workflow migration

Use the following prompt as a starting point for the next migration task.

---

Migrate this ComfyUI workflow to Intel XPU and keep the graph intact.

Requirements:

1. Do not remove, bypass, collapse, or replace nodes just to make the workflow run.
2. Inspect the workflow JSON, all referenced models, and the installed custom nodes before changing anything.
3. Treat all prior notes and analyses as unverified until confirmed by source code, prompt validation, runtime logs, or a reproducible test.
4. Prefer XPU for the real compute-heavy sampling path, but move stages to CPU when:
   - the node or backend is not XPU-compatible
   - the projected model footprint exceeds the VRAM budget
   - a measured benchmark shows the CPU-biased placement is faster or more stable
5. Keep VAE and low-compute stages on CPU when that preserves XPU headroom for Wan sampling.
6. Add or reuse tooling for:
   - workflow JSON -> API prompt conversion
   - branch extraction and branch-only execution
   - JSONL logging of every migration attempt
   - VRAM/XPU monitoring and threshold warnings
7. For any GGUF path, verify how the custom node actually works on Intel XPU. Do not assume it depends on llama.cpp CUDA kernels.
8. For any custom node that looks CUDA-specific, inspect the source and report the exact incompatible path before patching it.
9. Run the smallest faithful branch test first, then the full workflow.
10. Inspect the generated outputs for correctness, not just job success.

Execution order:

1. Inventory the workflow:
   - node counts
   - link counts
   - output nodes
   - model references
   - custom node packages
2. Identify the high-risk nodes and verify each claim from source.
3. Convert the workflow to an API prompt with explicit per-loader device defaults.
4. Run static memory assessment against the target XPU VRAM budget.
5. Launch ComfyUI with Intel-XPU-safe flags.
6. Run a branch benchmark with fixed seed and reduced steps.
7. Compare placement variants only when the benchmark is controlled.
8. Run the full workflow.
9. Summarize:
   - which nodes are on CPU
   - which stages actually compute on XPU
   - which hypotheses were proven wrong
   - what should be kept for the next migration

Expected outputs:

- working code changes
- deployment instructions
- migration attempt log
- final quality assessment
- a concise list of verified truths vs disproven assumptions

Use the last successful migration as a reference point, but do not copy its assumptions blindly.
