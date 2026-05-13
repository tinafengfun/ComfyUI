# Workflow inventory skill

## Use when

Use after feasibility routing and before asset prep or runtime work.

## Inputs

- workflow JSON
- node registry if available
- target output modes
- latest dependency state artifacts, if already produced: preflight, feasibility, asset ledger, custom-node ledger, acquisition log

## Algorithm

1. Count nodes and links from the actual graph, not `last_link_id`.
2. Identify all output nodes by type and by graph role.
3. Trace each output node upstream to determine branch ownership and critical paths.
4. Trace output/display nodes downstream before classifying them. If they feed another executable node, keep them in the executable path.
5. Split structural/UI nodes from executable nodes.
6. List disconnected notes, examples, bypass utilities, and dead-end nodes separately from runtime blockers.
7. Mark custom-node packages and widget-heavy nodes.
8. If asset/custom-node/acquisition artifacts already exist, refresh dependency states from them so the inventory does not repeat stale hard stops.
9. Produce a branch map, critical-path inventory, node inventory table, and recommended validation order.

## Common failure signatures

- `last_link_id` treated as real link count
- display-only nodes counted as runtime blockers
- display-looking output nodes marked display-only even though their outputs feed later runtime nodes
- disconnected notes, example preprocessors, or bypass utilities treated as output blockers
- stale Step 0 dependency gaps repeated after Step 3 already staged a replacement asset or dependency cache
- artifact name mismatch between `02-inventory.md` and project-specific split outputs
- branch not represented in API prompt
- one output branch mistaken for whole workflow

## Evidence standard

Retain workflow JSON, branch map, node/type table, output-node list, disconnected/dead-end node list, and the latest dependency-state artifacts used as inputs.

## Hard stops

Stop if output branches or executable-node ownership cannot be determined. Stop or explicitly defer if the artifact naming requested by the project conflicts with the standard contract and cannot be mapped to the required fields.

## Output schema

`node_count`, `link_count`, `outputs`, `branches`, `executable_nodes`, `structural_nodes`, `disconnected_nodes`, `custom_node_packages`, `export_risks`, `node_inventory`.

Default artifact:

```text
02-inventory.md
```

Allowed split artifact form for complex workflows:

```text
02-workflow-topology.md
02-node-inventory.csv
```
