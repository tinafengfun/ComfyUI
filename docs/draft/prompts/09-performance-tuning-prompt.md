# Performance tuning prompt

## Task

Tune an already validated workflow path on Intel XPU using controlled measurements.

## Required context

- working baseline prompt
- branch/full validation evidence
- target metric: latency, throughput, memory, stability, or quality
- benchmark harness and telemetry tools

## Constraints

1. Do not tune before baseline validation.
2. Change one variable at a time unless testing a named bundle.
3. More XPU placement is not automatically faster.
4. Preserve baseline and losing candidates.
5. Do not choose a winner from runtime alone when telemetry is missing or malformed.
6. Do not turn on cache/model residency optimizations for single-run delivery unless the target use case is repeated/batch execution and a separate memory-residency test passes.
7. If a candidate is faster but materially tighter on memory, keep the safer baseline as an explicit fallback.

## Steps

1. Freeze baseline prompt, seed, resolution, frame count, and output target.
2. Define candidate tuning knobs: device placement, VAE/encoder offload, reserve VRAM, attention mode, dtype, lowvram, CPU fallback.
3. Validate the benchmark harness before long runs: verify queue handling, history capture, output collection, and at least one telemetry sample with non-empty memory fields.
4. Run controlled trials. Use a cold restart or explicit cache policy when comparing launch-level settings.
5. Compare runtime, memory, output integrity, cached-node counts, telemetry quality, and failure signatures.
6. Pick winner or declare no safe improvement.
7. If telemetry is missing, fix the harness and rerun the affected candidates rather than reusing incomplete data.

## Output

Create a tuning report with:

- baseline
- candidate matrix
- measurements
- selected configuration
- safer fallback configuration, if the selected configuration has less headroom
- rejected configurations and reasons
- telemetry validity notes
- remaining bottleneck or hard stop

## Hard stops

Stop if tuning candidates are slower, less stable, corrupt output, or continue to exceed structural capacity.

Also stop and repair the benchmark harness if:

- XPU/CPU telemetry is empty or obviously malformed
- ComfyUI cache makes candidates incomparable
- output files or output history are missing for the target nodes
- server restarts remove temp outputs before they are copied or recorded

## Prior-migration lessons

Dasiwa showed that moving loaders back to default or GPU can be slower or unsupported. Tuning must be evidence-driven, not based on device-placement assumptions.

Zimage Step 9 showed that a speed winner can be a tighter memory configuration: `normalvram` plus less CPU offload improved full-run wall time only modestly while increasing peak VRAM. The report must preserve both the fastest config and the safer fallback. It also showed that telemetry tooling is part of the benchmark: a schema mismatch in `xpu-smi` parsing required rerunning candidates before choosing a winner.
