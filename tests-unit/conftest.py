import importlib.util
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

# Some environments preload a third-party top-level `utils` module.
# The project under test expects the repository's own `utils` package instead.
for name in list(sys.modules):
    if name == "utils" or name.startswith("utils."):
        del sys.modules[name]

utils_init = REPO_ROOT / "utils" / "__init__.py"
spec = importlib.util.spec_from_file_location(
    "utils",
    utils_init,
    submodule_search_locations=[str(REPO_ROOT / "utils")],
)
module = importlib.util.module_from_spec(spec)
sys.modules["utils"] = module
assert spec.loader is not None
spec.loader.exec_module(module)
