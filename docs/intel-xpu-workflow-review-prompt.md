# Intel XPU workflow review prompt and coverage-audit template

Use this document when the workflow has already been migrated or partially validated and you want a **post-migration review** that answers:

- were all executable nodes really migrated
- were all executable nodes really tested
- which nodes were only structural UI helpers and should be excluded from runtime coverage
- whether any branch-local nodes were missed by the full baseline and only covered in branch smoke runs

## Standard task description

Use this when opening the task:

> Review this ComfyUI workflow migration end to end. Audit every node in the workflow JSON, compare it against the converted API prompt and the available execution evidence, and conclude whether any executable node was missed in migration or testing. Distinguish structural nodes from real runtime nodes, and do not claim full coverage unless every executable node has direct evidence.

## Hard constraints

State these explicitly in the request:

1. **Do not treat display-only nodes as runtime gaps.**
2. **Do not assume a node was covered just because the workflow loaded.**
3. **Do not assume `execution_success` means the intended output branch actually ran.**
4. **Use source artifacts, prompt contents, and runtime evidence instead of prior summaries.**
5. **If full-workflow execution does not cover every executable node, use successful branch-smoke runs to close the gap.**
6. **If a node is still uncovered after all known artifacts are checked, report it plainly as unvalidated.**
7. **Keep structural-node exclusions explicit and counted.**

## Questions that should be answered before execution

If the request does not already answer these, confirm them first:

1. **What is the exact workflow JSON path?**
2. **Which converted prompt is the authoritative full-workflow prompt?**
3. **Which full-run artifacts are authoritative for execution evidence?**
4. **Which branch-smoke prompts or reports count as valid coverage evidence?**
5. **Should the review update repo docs with the final audit summary, or is a terminal summary enough?**

## Standard operator prompt

Copy and adapt this:

> Review the ComfyUI workflow at `<WORKFLOW_JSON>` and audit whether every node was migrated and tested.\n\
> \n\
> Requirements:\n\
> - inspect the raw workflow JSON first\n\
> - count all nodes, links, outputs, and node types\n\
> - classify structural nodes separately from executable runtime nodes\n\
> - compare the workflow JSON against the authoritative converted full prompt at `<FULL_PROMPT_JSON>`\n\
> - compare the prompt nodes against full-run execution evidence from `<FULL_RUN_ARTIFACTS>`\n\
> - if some prompt nodes do not appear in the full-run execution log, compare them against successful branch-smoke prompts and reports from `<SMOKE_ARTIFACTS>`\n\
> - do not mark a node as covered unless it is either present in the converted prompt and executed in the full run, or present in a successful branch-smoke subgraph with matching output evidence\n\
> - explicitly call out structural node families such as `Reroute`, `Note`, and bypass/group helper nodes when they are intentionally excluded from runtime prompts\n\
> - identify any node that is executable but missing from both prompt conversion and successful test coverage\n\
> - summarize coverage by counts and by node IDs\n\
> - update docs if the audit changes the reusable review method\n\
> \n\
> Deliver a final table with: total workflow nodes, structural skipped nodes, executable prompt nodes, full-run-covered nodes, smoke-only-covered nodes, and any truly unvalidated nodes.

## Standard execution plan

### Phase 1: inventory the workflow

1. Count total nodes, links, output nodes, and node types.
2. Separate structural/UI-only node families from executable ones.
3. Record the workflow output branches that matter for test evidence.

### Phase 2: audit prompt conversion coverage

1. Load the authoritative full prompt.
2. Compare workflow node IDs against prompt node IDs.
3. Explain every node that is absent from the prompt:
   - structural skip
   - intentionally pruned invalid branch
   - or suspected exporter gap

### Phase 3: audit full-run execution coverage

1. Read the full-run history or node execution log.
2. Build the set of prompt nodes that actually emitted `node_execution_end` or equivalent runtime evidence.
3. Compute the delta:
   - prompt nodes covered by the full run
   - prompt nodes not covered by the full run

### Phase 4: close the gap with successful branch-smoke evidence

1. For every prompt node not seen in the full run, inspect successful branch-smoke prompts and reports.
2. Map each uncovered node to the branch that proves it executed or was included in a successful validated subgraph.
3. Keep a separate class for:
   - full-run-covered nodes
   - smoke-only-covered nodes
   - still-unvalidated nodes

### Phase 5: conclude the migration/test status

1. Declare **complete executable-node coverage** only if no executable node remains unvalidated.
2. If gaps remain, list node IDs, node types, affected branches, and the likely missing artifact or missing test.
3. Write the final result in a way that does not overclaim:
   - acceptable: every executable node is covered across full-run plus branch-smoke evidence
   - not acceptable: every node executed in one full run, if that did not actually happen

## Deliverables

The review should produce:

1. **A coverage summary table**
   - total workflow nodes
   - structural skipped nodes
   - executable prompt nodes
   - full-run-covered nodes
   - smoke-only-covered nodes
   - truly unvalidated nodes
2. **A node-ID mapping for every uncovered-by-full-run executable node**
3. **A clear conclusion**
   - no missing executable nodes
   - or the exact remaining gaps
4. **Reusable doc updates**
   - update `docs/README.md` if the review method should become part of the standard workflow
5. **A migration summary for the patch bundle**
   - place it under the workflow patch package when that package exists
   - include:
     - total nodes and executable-node counts
     - workflow functional branches
     - which node families migrated successfully
     - which families are CPU fallbacks or disabled features on Intel
     - which NVIDIA/CUDA-oriented features required workarounds
     - the concrete code patches, operator changes, and runtime-policy changes applied

## Acceptance checklist

The review is not complete unless all of these are true:

- the workflow JSON node set was counted directly
- structural node families were separated from executable node families
- the authoritative full prompt was compared against the workflow node set
- the full-run execution evidence was compared against the prompt node set
- full-run gaps were checked against successful branch-smoke evidence
- any remaining uncovered executable node IDs were explicitly listed
- the final conclusion states exactly what was covered and what was not
- when a patch bundle exists, a migration summary captures node totals, workarounds, and Intel-vs-NVIDIA feature gaps
