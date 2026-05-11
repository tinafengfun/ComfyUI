# Branch smoke validation prompt

## Task

Run the smallest faithful branch-level smoke tests before full workflow validation.

## Required context

- validated API prompt
- branch map
- target output nodes
- reduced-resource settings
- running ComfyUI endpoint

## Constraints

1. Smoke success is not full-size success.
2. Keep branch changes faithful to the original graph.
3. Do not bypass nodes just to make a branch pass.
4. Preserve prompt, history, logs, and generated outputs.

## Steps

1. Select the smallest faithful branch for each important output mode.
2. Use fixed seed and reduced steps/resolution/frame count where allowed.
3. Submit branch prompt and retain history.
4. Confirm intended output files exist and are non-empty.
5. Capture XPU/CPU placement evidence where relevant.
6. Classify pass, fail, CPU fallback, or blocked.

## Output

Create a branch-smoke report with:

- branch name and output node
- prompt/history paths
- generated media paths
- runtime logs and placement notes
- pass/fail/blocker classification

## Hard stops

Stop full-size validation if a critical branch cannot produce a faithful smoke output.

## Prior-migration lessons

Dasiwa branch smoke proved reachability before expensive runs. It also showed that compatibility aliases must remain labeled smoke-only and cannot prove source-identical fidelity.
