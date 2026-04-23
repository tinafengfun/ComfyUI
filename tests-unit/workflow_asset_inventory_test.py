from script_examples.workflow_asset_inventory import (
    collect_custom_nodes,
    collect_workflow_models,
    detect_format,
    workflow_widget_values,
)


def test_detect_format_distinguishes_workflow_and_prompt():
    assert detect_format({"nodes": []}) == "workflow"
    assert detect_format({"1": {"class_type": "CLIPLoader", "inputs": {}}}) == "prompt"


def test_workflow_widget_values_maps_widget_inputs_in_order():
    node = {
        "inputs": [
            {"name": "clip_name", "widget": {"name": "clip_name"}},
            {"name": "type", "widget": {"name": "type"}},
            {"name": "device", "widget": {"name": "device"}},
        ],
        "widgets_values": ["umt5.safetensors", "wan", "cpu"],
    }

    assert workflow_widget_values(node) == {
        "clip_name": "umt5.safetensors",
        "type": "wan",
        "device": "cpu",
    }


def test_collect_custom_nodes_uses_cnr_id_and_fallback_class_mapping():
    workflow = {
        "nodes": [
            {
                "id": 1,
                "type": "ImageResizeKJv2",
                "properties": {"cnr_id": "comfyui-kjnodes"},
            },
            {
                "id": 2,
                "type": "Fast Groups Bypasser (rgthree)",
                "properties": {},
            },
        ]
    }

    items = collect_custom_nodes(workflow, "workflow")

    assert [item["package_id"] for item in items] == ["comfyui-kjnodes", "rgthree-comfy"]


def test_collect_workflow_models_extracts_loaders_and_power_loras():
    workflow = {
        "nodes": [
            {
                "id": 10,
                "type": "UNETLoader",
                "inputs": [
                    {"name": "unet_name", "widget": {"name": "unet_name"}},
                    {"name": "weight_dtype", "widget": {"name": "weight_dtype"}},
                ],
                "widgets_values": ["WAN2.2\\model.safetensors", "default"],
                "properties": {"cnr_id": "comfy-core"},
            },
            {
                "id": 11,
                "type": "Power Lora Loader (rgthree)",
                "inputs": [],
                "widgets_values": [
                    {},
                    {"type": "PowerLoraLoaderHeaderWidget"},
                    {"on": True, "lora": "WAN\\2.2\\demo.safetensors", "strength": 1, "strengthTwo": None},
                    {"on": False, "lora": "None", "strength": 1, "strengthTwo": None},
                ],
                "properties": {},
            },
        ]
    }

    items = collect_workflow_models(workflow, [])

    assert len(items) == 2
    by_name = {item["model_name"]: item for item in items}
    assert by_name["WAN/2.2/demo.safetensors"]["enabled"] is True
    assert by_name["WAN2.2/model.safetensors"]["category"] == "diffusion_models"
