# Intel XPU workflow tuning prompt and plan template

Use this document when you want to ask for a **full Intel XPU workflow tuning engagement** instead of a one-off benchmark.

It captures:

- the task description
- the hard constraints
- the clarification questions that should be answered up front
- the expected deliverables
- a standard execution plan

## Standard task description

Use this when opening the task:

> Tune this ComfyUI workflow for Intel XPU end-to-end. Start from the original workflow JSON, prove the real bottlenecks with measurement, try multiple optimization paths, preserve workflow semantics, and deliver the fastest stable configuration with reproducible docs, artifacts, and a final comparison.

## Hard constraints

These constraints should be stated explicitly in the request:

1. **Do not bypass or remove workflow nodes.**
2. **Do not silently change workflow semantics just to make it faster.**
3. **Run one full baseline before claiming a winner.**
4. **Use branch-only runs only for prescreening, not as the final proof.**
5. **Record every attempt, including failed and pruned paths.**
6. **Capture node timing, XPU usage, memory usage, and output validity.**
7. **Treat the 24 GB XPU memory budget as a hard limit unless explicitly told otherwise.**
8. **Prefer putting compute-dense stages on XPU and offloading low-compute or oversized pieces to CPU when needed.**
9. **Do not trust existing notes blindly; verify them against code and runtime.**

## Questions that should be answered before execution

If the request does not already answer these, ask them up front.

1. **What is the exact workflow JSON path?**
2. **What is the target XPU memory budget?**
3. **Is output quality required to match the existing workflow semantics exactly, or is there an allowed quality/performance trade-off window?**
4. **Should the benchmark optimize for wall-clock only, or also minimize peak memory even when speed is tied?**
5. **Which output branches, if any, are allowed for cheap prescreening before the full run?**
6. **Should nested custom-node repositories also be prepared for separate upstream submission when local patches are required?**
7. **Should every round be documented in the repo, or is a final summary enough?**

## Standard deliverables

The request should ask for all of the following:

1. **A full reproduction guide**
   - from workflow JSON to final output validation
2. **A tuning report**
   - all attempted paths
   - timing and memory deltas
   - winning path and runner-up
3. **A reusable tuning skill**
   - how to repeat the same method on the next workflow
4. **A benchmark harness or equivalent automation**
   - so node timing and XPU usage are reproducible
5. **Visual comparison**
   - charts for path runtime and memory use
6. **GitHub submission**
   - commit and push the repo changes

## Standard operator prompt

Copy and adapt this:

> Tune the ComfyUI workflow at `<WORKFLOW_JSON>` for Intel XPU.\n\
> \n\
> Requirements:\n\
> - start from the original workflow JSON and preserve workflow semantics\n\
> - do not bypass or remove nodes\n\
> - run one full baseline first\n\
> - capture per-node timing, stage-level timing share, XPU utilization, EU activity, and peak memory\n\
> - evaluate multiple optimization paths, not just the obvious one\n\
> - use branch-only prescreens only to prune risky paths cheaply\n\
> - rerun finalists as full workflows\n\
> - record every attempted path, including failures and pruned paths\n\
> - if a model or loader would exceed the `<VRAM_LIMIT_GB>` GB budget, keep it on CPU unless a measured experiment proves otherwise\n\
> - validate outputs with file presence plus basic media metadata\n\
> - update the repo docs with a complete reproduction guide and a final comparison report\n\
> - include visual charts for path runtime and memory use\n\
> - summarize the verified method as a reusable skill and also provide a standard prompt/plan template for future tuning tasks\n\
> - push the final changes to GitHub\n\
> \n\
> Before implementation, confirm any missing scope decisions such as memory budget, accepted quality trade-offs, and whether nested custom-node repos should also be prepared for upstream submission.

## Standard execution plan

Use this plan when running the task.

### Phase 1: establish the ground truth

1. Inspect the workflow JSON, model inventory, and existing notes.
2. Verify current custom-node and loader patch state.
3. Confirm the real runtime environment and XPU budget.
4. Add or confirm node timing instrumentation.

### Phase 2: baseline

1. Generate the API prompt from the workflow JSON.
2. Run the static memory assessment.
3. Start the known-good server configuration.
4. Run one full baseline workflow.
5. Save timing, XPU, output, and history artifacts.

### Phase 3: design the path matrix

1. Use the measured bottleneck distribution to decide what to try next.
2. Include at least:
   - one direct bottleneck fix
   - one loader-placement experiment
   - one hybrid path
3. Reject speculative paths that are already disproven by memory limits or unsupported kernels.

### Phase 4: prescreen

1. Use one or more output branches for cheap branch-only tests.
2. Keep exact commands and metrics for each branch run.
3. Promote only credible candidates to full runs.

### Phase 5: finalist runs

1. Re-run the finalists as full workflows.
2. Compare wall time, stage time share, peak memory, average/peak utilization, and output validity.
3. Pick the winner and runner-up.

### Phase 6: documentation

1. Write the start-to-finish reproduction guide.
2. Publish the tuning report with visual comparisons.
3. Update the tuning skill.
4. Add the reusable prompt/plan template.

### Phase 7: submission

1. Commit the repo changes.
2. Push to GitHub.
3. If nested custom-node repos are involved, explicitly state whether they also need a separate commit or PR.

## Acceptance checklist

The task is not complete unless all of these are true:

- a full baseline run was completed
- multiple paths were evaluated
- at least one full finalist rerun happened after prescreening
- output validity was checked
- the winner was chosen by measured evidence
- the docs explain how to reproduce the result
- the result was committed and pushed
