# GUI acceptance and demo prompt

## Task

Prepare a clean ComfyUI GUI environment for manual end-to-end acceptance and demo.

## Required context

- Step 11 delivery bundle
- deployment guide and patch inventory
- runtime-policy API prompt and change notes
- source workflow JSON
- custom-node and asset ledgers
- known gaps and support matrix
- customer/manual test plan

## Constraints

1. Do not modify the source workflow in place.
2. Do not bypass, disable, remove, collapse, or replace nodes to make the GUI run pass.
3. The GUI workflow must make runtime-policy changes explicit; do not present it as source-identical.
4. The clean environment must have patches applied before GUI validation.
5. Model locations must be configured explicitly, either through `extra_model_paths.yaml`, symlinks/copies, or both.
6. Manual acceptance must record operator, environment, prompt/workflow version, output files, and pass/fail notes.
7. GUI acceptance is not complete until a human runs the workflow end to end and signs off on generated outputs.
8. If the tester needs remote browser access, bind ComfyUI to the requested interface/IP and verify that exact URL, not only localhost.

## Steps

1. Create or update a clean-environment GUI acceptance guide.
2. Prepare a script/checklist that stages custom nodes, applies patches, writes model-path configuration, and launches ComfyUI for GUI use.
3. Generate a full GUI workflow JSON for manual validation/demo:
   - preserve the original graph and intended outputs
   - apply approved runtime-policy/schema changes
   - use full/high-fidelity settings unless a reduced demo mode is explicitly requested
   - set output prefixes so demo artifacts are easy to identify
4. Include a model-path configuration file such as `extra_model_paths.yaml`.
5. Include an operator acceptance checklist and run record template.
6. Update delivery artifact index and support boundaries.
7. Verify the generated workflow is valid JSON and that required deployment inputs exist.
8. Start or restart the GUI service on the agreed bind address and port, avoiding conflicts with existing ComfyUI instances.
9. Verify `/system_stats`, workflow import readiness, required node registration, and key model selector options from the same address that the tester will use.
10. Record PID, URL, server log, launch flags, and any non-blocking startup warnings.

## Output

Create GUI acceptance artifacts with:

- `gui_workflow_json`
- `model_path_config`
- `environment_prepare_script`
- `launch_command`
- `manual_acceptance_checklist`
- `run_record_template`
- `known_boundaries`
- `demo_output_expectations`
- `service_url`
- `pid_and_log`
- `manual_result`

## Hard stops

Stop GUI acceptance preparation if:

1. the generated GUI workflow cannot preserve the full intended graph
2. a required patch cannot be applied reproducibly
3. model paths cannot be resolved in a clean environment
4. the workflow would require bypassing or disabling nodes
5. the package would claim customer acceptance before a human run exists
6. the requested bind address is not present on a local interface or the service cannot be reached through the tester URL

## Prior-migration lessons

Dasiwa and Zimage showed that API delivery is not the same as GUI/customer acceptance. A final demo package needs a runnable GUI workflow, patched clean environment, explicit model-path wiring, generated outputs, and a human acceptance record. Zimage Step 12 also showed that demo readiness must include practical service details: avoiding port conflicts, rebinding to the tester-visible IP, checking `/system_stats` through that IP, and recording PID/log/URL for handoff.
