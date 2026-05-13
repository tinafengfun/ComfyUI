# Performance tuning skill

## Use when

Use only after a baseline path works or a controlled failing path is defined.

## Inputs

- baseline prompt
- fixed seed/settings
- telemetry tools
- candidate knobs

## Algorithm

1. Freeze baseline and success criteria.
2. Define one-variable or named-bundle candidates.
3. Validate the harness before the expensive trials: queue submission, history capture, output discovery, telemetry parser, and cache detection must all produce usable evidence.
4. Run repeatable trials with cold restarts or an explicit cache policy.
5. Compare speed, memory, stability, output integrity, cached-node counts, and telemetry validity.
6. Keep winner and rejected candidates with reasons.
7. If the winner uses more memory, keep a safer fallback configuration and state when to use each one.

## Common failure signatures

- assuming more XPU placement is faster
- changing multiple knobs without a controlled bundle
- optimizing a path that is actually capacity blocked
- losing artifact evidence for failed candidates
- choosing a winner after telemetry silently failed
- comparing cached runs against cold runs
- treating a small speedup with much tighter memory as a universal improvement
- enabling model/cache residency knobs for a single-run workflow without batch/repeated-run validation

## Evidence standard

Retain prompt/history/log/telemetry for baseline and each candidate.

Each candidate should record:

- launch flags and prompt changes
- wall time and node timing
- peak and average memory
- cached-node count
- output files or output history for every target
- telemetry parser/schema notes if custom tooling is used
- whether the run was cold, warm, or intentionally cache-assisted

If telemetry is empty or malformed, fix the collector and rerun the affected candidates. Do not fill the gap with stale telemetry from another run.

## Hard stops

Stop if tuning does not improve baseline or exposes capacity/compatibility root cause.

## Output schema

`baseline`, `candidate`, `metric`, `telemetry_validity`, `cache_policy`, `result`, `winner`, `safe_fallback`, `rejected`, `remaining_bottleneck`.
