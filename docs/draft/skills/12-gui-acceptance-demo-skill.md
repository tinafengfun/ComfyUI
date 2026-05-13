# GUI acceptance and demo skill

## Use when

Use after Step 11 delivery packaging when the next goal is a clean-environment GUI/manual end-to-end validation or customer demo.

## Inputs

- Step 11 delivery bundle
- source GUI workflow JSON
- runtime-policy API prompt and notes
- patch bundle
- asset/custom-node ledgers
- validation evidence and known gaps

## Algorithm

1. Establish the GUI acceptance boundary:
   - runtime-policy GUI workflow, source-identical workflow, or both
   - full fidelity or explicitly reduced demo mode
   - manual operator and target environment requirements
2. Prepare a clean ComfyUI environment recipe:
   - install or point to all required custom nodes
   - apply local compatibility patches
   - install curated portable dependencies
   - write model-path configuration
   - verify `torch.xpu.is_available()`
   - choose a GUI bind address/port that the tester can reach
   - avoid port conflicts with already-running ComfyUI instances
3. Convert the validated runtime-policy API settings back into a GUI workflow copy:
   - keep source workflow unchanged
   - preserve nodes and links
   - update only approved device/schema/tuning/output-prefix widget values
   - record every changed widget in notes
4. Create manual acceptance artifacts:
   - GUI workflow JSON
   - model-path config
   - prepare/launch script or checklist
   - operator run record template
   - output expectations and pass/fail criteria
5. Verify static correctness:
   - generated workflow is valid JSON
   - source workflow copy still matches original
   - no node count/link count loss unless explicitly explained
   - required model/custom-node roots exist or are documented as handoff requirements
   - required runtime node classes appear in `/object_info`
   - model selector options contain the expected staged assets
   - frontend-only or disconnected structural nodes are classified before treating missing `/object_info` keys as blockers
6. Keep claims scoped:
   - before a human run, status is `prepared for GUI acceptance`
   - after a human run, status can become `GUI/manual accepted` only with run evidence
7. Start the service and record runtime handoff details:
   - service URL
   - PID
   - launch flags
   - server log path
   - `/system_stats` evidence from the tester-visible URL
   - non-blocking startup warnings and why they do not affect the delivered workflow

## Common failure signatures

- GUI workflow silently edits or deletes nodes from the source graph
- API-only prompt is provided but no GUI workflow is importable
- patches are documented but not applied in the clean environment
- model files are copied but `extra_model_paths.yaml` or custom-node-specific paths are missing
- demo output prefixes overwrite prior validation artifacts
- final report says customer accepted when only a package was prepared
- service works on localhost but is not bound to the tester-visible IP
- another ComfyUI instance already occupies the intended port
- `/object_info` schema changes cause a false missing-selector failure because options are nested differently
- GUI/frontend structural nodes such as reroutes, notes, or disconnected bypass utilities are mistaken for runtime blockers

## Evidence standard

Retain:

- generated GUI workflow JSON
- runtime-policy GUI workflow notes
- model-path configuration
- prepare/launch script
- patch application log or reproducible patch command
- manual acceptance checklist
- completed run record after the human test
- generated GUI output files and screenshots when available
- service URL, PID, launch flags, and server log
- `/system_stats` from the tester-visible bind address
- object-info readiness summary for runtime nodes and model selectors

## Hard stops

Stop if the clean environment cannot resolve custom nodes, cannot find required models, cannot apply required patches, cannot bind to the requested tester-visible address, or requires bypassing nodes.

## Output schema

`gui_workflow_json`, `model_path_config`, `prepare_script`, `launch_command`, `service_url`, `pid_and_log`, `manual_checklist`, `run_record_template`, `expected_outputs`, `known_boundaries`, `human_signoff_state`, `manual_result`.
