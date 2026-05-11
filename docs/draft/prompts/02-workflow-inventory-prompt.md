# Workflow inventory prompt

## Task

Inventory the workflow graph before runtime migration.

## Required context

- workflow JSON
- node definitions if available
- known ComfyUI/custom-node checkout

## Constraints

1. Do not bypass or remove nodes.
2. Separate structural UI nodes from executable runtime nodes.
3. Do not claim node coverage until branches and outputs are mapped.

## Steps

1. Count nodes, links, output nodes, and node types.
2. Build a branch map from inputs to outputs.
3. Mark critical path nodes for each output branch.
4. Identify widget-only or half-widget nodes likely to break API export.
5. Identify custom-node packages by node type.

## Output

Create a workflow inventory report with:

- node/type counts
- output branch table
- executable-node list
- structural-node list
- custom-node package map
- prompt-export risk list

## Hard stops

Stop if branch ownership, output nodes, or critical paths cannot be determined from the workflow.

## Prior-migration lessons

Dasiwa was a multi-branch workflow; one successful branch did not prove the full graph. Review must later compare workflow JSON, converted prompt, full-run evidence, and branch-smoke evidence.
