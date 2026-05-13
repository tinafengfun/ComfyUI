# Workflow inventory prompt

## Task

Inventory the workflow graph before runtime migration.

## Required context

- workflow JSON
- node definitions if available
- known ComfyUI/custom-node checkout
- latest dependency artifacts if they already exist, such as `00-intake-preflight.md`, `01-feasibility.md`, `03-assets.csv`, `03-custom-nodes.md`, and `03-acquisition-log.md`

## Constraints

1. Do not bypass or remove nodes.
2. Separate structural UI nodes from executable runtime nodes.
3. Do not claim node coverage until branches and outputs are mapped.
4. Do not run ComfyUI, install dependencies, or modify the workflow.
5. Do not reuse stale dependency states if newer ledgers or acquisition logs exist.
6. Do not assume a Save/Preview/ShowText/Comparer node is display-only until its downstream links are checked.

## Steps

1. Count nodes, links, output nodes, and node types. Count links from the actual `links` array, not `last_link_id`.
2. Build a branch map from inputs to outputs.
3. For every output node, trace upstream critical-path nodes and record upstream node count.
4. Trace downstream links from output/display nodes; if an output node feeds another node, mark it as executable-path relevant.
5. Mark critical path nodes for each output branch.
6. Identify widget-only or half-widget nodes likely to break API export.
7. Identify custom-node packages by node type.
8. List disconnected notes, bypass utilities, example nodes, and dead-end nodes separately from runtime blockers.
9. Refresh dependency-state notes from newer asset/custom-node/acquisition artifacts if they exist.

## Output

Create a workflow inventory report. The default file is `02-inventory.md`; for complex workflows, it may be split into `02-workflow-topology.md` plus `02-node-inventory.csv`.

The report must include:

- node/type counts
- output branch table
- executable-node list
- structural-node list
- disconnected/dead-end node list
- custom-node package map
- prompt-export risk list
- recommended branch validation order

The optional node inventory CSV should include at least:

```text
node_id,type,order,mode,branch,role,inputs_from,outputs_to,package_or_origin,migration_risk
```

## Hard stops

Stop if branch ownership, output nodes, or critical paths cannot be determined from the workflow.

## Prior-migration lessons

Dasiwa was a multi-branch workflow; one successful branch did not prove the full graph. Review must later compare workflow JSON, converted prompt, full-run evidence, and branch-smoke evidence.

Zimage added three Step 2 lessons:

1. Artifact naming must be explicit. `02-inventory.md` is the canonical single-file output, but `02-workflow-topology.md` plus `02-node-inventory.csv` is acceptable when the workflow is easier to review as topology plus table.
2. Display-looking nodes may still be runtime dependencies. A text output that feeds `CLIPTextEncode`, for example, is not display-only.
3. If dependency acquisition or replacement-input staging already happened, inventory must refresh hard-stop wording from the latest ledgers instead of repeating stale preflight state.
