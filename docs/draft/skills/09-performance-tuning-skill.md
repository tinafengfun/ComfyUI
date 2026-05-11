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
3. Run repeatable trials.
4. Compare speed, memory, stability, and output integrity.
5. Keep winner and rejected candidates with reasons.

## Common failure signatures

- assuming more XPU placement is faster
- changing multiple knobs without a controlled bundle
- optimizing a path that is actually capacity blocked
- losing artifact evidence for failed candidates

## Evidence standard

Retain prompt/history/log/telemetry for baseline and each candidate.

## Hard stops

Stop if tuning does not improve baseline or exposes capacity/compatibility root cause.

## Output schema

`baseline`, `candidate`, `metric`, `result`, `winner`, `rejected`, `remaining_bottleneck`.
