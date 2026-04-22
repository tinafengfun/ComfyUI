from __future__ import annotations

from copy import deepcopy
from typing import Any, Iterable, Mapping


Prompt = dict[str, dict[str, Any]]


def _sort_key(node_id: str) -> tuple[int, Any]:
    try:
        return (0, int(node_id))
    except ValueError:
        return (1, node_id)


def _is_link(value: Any) -> bool:
    return (
        isinstance(value, list)
        and len(value) == 2
        and isinstance(value[0], (str, int))
        and isinstance(value[1], int)
    )


def _iter_linked_node_ids(value: Any) -> Iterable[str]:
    if _is_link(value):
        yield str(value[0])
        return
    if isinstance(value, list):
        for item in value:
            yield from _iter_linked_node_ids(item)
    elif isinstance(value, dict):
        for item in value.values():
            yield from _iter_linked_node_ids(item)


def extract_prompt_subgraph(prompt: Mapping[str, Mapping[str, Any]], output_nodes: Iterable[str | int]) -> Prompt:
    keep: set[str] = set()
    stack = [str(node_id) for node_id in output_nodes]

    while stack:
        node_id = stack.pop()
        if node_id in keep:
            continue
        if node_id not in prompt:
            raise KeyError(f"Node '{node_id}' not found in prompt")
        keep.add(node_id)
        inputs = prompt[node_id].get("inputs", {})
        for value in inputs.values():
            stack.extend(_iter_linked_node_ids(value))

    return {node_id: deepcopy(prompt[node_id]) for node_id in sorted(keep, key=_sort_key)}


def apply_sampler_overrides(prompt: Prompt, *, steps: int | None = None, seed: int | None = None) -> Prompt:
    for node in prompt.values():
        class_type = node.get("class_type")
        inputs = node.setdefault("inputs", {})
        if class_type not in {"KSampler", "KSamplerAdvanced"}:
            continue

        if steps is not None:
            inputs["steps"] = steps
            if class_type == "KSamplerAdvanced":
                end_at_step = inputs.get("end_at_step")
                start_at_step = inputs.get("start_at_step")
                if isinstance(end_at_step, int):
                    inputs["end_at_step"] = min(end_at_step, steps)
                if isinstance(start_at_step, int):
                    if start_at_step >= steps:
                        inputs["start_at_step"] = 0
                    else:
                        inputs["start_at_step"] = min(start_at_step, max(steps - 1, 0))
                if (
                    isinstance(inputs.get("start_at_step"), int)
                    and isinstance(inputs.get("end_at_step"), int)
                    and inputs["start_at_step"] >= inputs["end_at_step"]
                ):
                    inputs["start_at_step"] = 0
                    inputs["end_at_step"] = steps

        if seed is not None:
            if "seed" in inputs:
                inputs["seed"] = seed
            if "noise_seed" in inputs:
                inputs["noise_seed"] = seed

    return prompt


def apply_filename_prefix(prompt: Prompt, prefix: str) -> Prompt:
    for node in prompt.values():
        inputs = node.get("inputs", {})
        if "filename_prefix" in inputs:
            inputs["filename_prefix"] = prefix
    return prompt
