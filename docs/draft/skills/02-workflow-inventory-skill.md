# Workflow inventory skill

## Use when

Use after feasibility routing and before asset prep or runtime work.

## Inputs

- workflow JSON
- node registry if available
- target output modes

## Algorithm

1. Count nodes and links from actual graph, not `last_link_id`.
2. Identify outputs and trace upstream branches.
3. Split structural/UI nodes from executable nodes.
4. Mark custom-node packages and widget-heavy nodes.
5. Produce a branch map and critical-path inventory.

## Common failure signatures

- `last_link_id` treated as real link count
- display-only nodes counted as runtime blockers
- branch not represented in API prompt
- one output branch mistaken for whole workflow

## Evidence standard

Retain workflow JSON, branch map, node/type table, output-node list.

## Hard stops

Stop if output branches or executable-node ownership cannot be determined.

## Output schema

`node_count`, `link_count`, `outputs`, `branches`, `executable_nodes`, `structural_nodes`, `custom_node_packages`, `export_risks`.
