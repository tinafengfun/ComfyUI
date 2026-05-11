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

## Steps

1. Freeze baseline prompt, seed, resolution, frame count, and output target.
2. Define candidate tuning knobs: device placement, VAE/encoder offload, reserve VRAM, attention mode, dtype, lowvram, CPU fallback.
3. Run controlled trials.
4. Compare runtime, memory, output integrity, and failure signatures.
5. Pick winner or declare no safe improvement.

## Output

Create a tuning report with:

- baseline
- candidate matrix
- measurements
- selected configuration
- rejected configurations and reasons
- remaining bottleneck or hard stop

## Hard stops

Stop if tuning candidates are slower, less stable, corrupt output, or continue to exceed structural capacity.

## Prior-migration lessons

Dasiwa showed that moving loaders back to default or GPU can be slower or unsupported. Tuning must be evidence-driven, not based on device-placement assumptions.
