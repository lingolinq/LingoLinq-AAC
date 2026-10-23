#!/usr/bin/env python3
"""The model catalog and provider every `codex exec` call in the review runs with.

The feature flags in .github/codex/codex-exec-args.txt do not remove every tool. In the pinned
codex (0.160.0) the bundled catalog entry for the reviewer model sets `tool_mode`,
`multi_agent_version` and `apply_patch_tool_type`, and those add `exec` (a JavaScript tool with
`apply_patch` and the goal tools inside it), `wait` and the collaboration tools (`spawn_agent`,
`send_message` and others) whatever the flags say. `spawn_agent` takes a model name, so a prompt
injected through a diff could send the PR to an unapproved model (verified 2026-10-03 against a
local stand-in for the API).

This script copies the pinned binary's own bundled catalog, keeps only the approved reviewer
models, and sets those three fields to null. Each call then names this catalog and the
`codex-review` provider from codex-exec-args.txt, which is the setup the codex-review-tests CI job
checks by capturing the request codex actually sends. A catalog that holds only the approved
models also means no other model can be selected.

Usage:
  codex-review-model-catalog.py write           write the catalog under $RUNNER_TEMP
  codex-review-model-catalog.py exec-overrides  check that catalog, then print the `codex exec`
                                                arguments that select it, one per line
Both fail, printing nothing to stdout, when anything is missing or unexpected.
"""
import json
import os
import pathlib
import subprocess
import sys
import tempfile

# The approved-reviewer registry row for the CI `codex-review` gate (.github/codex/README.md,
# "Approved reviewer models"). Both legs of scripts/codex-review-run-chunks.py and the bounded
# reviewer in codex-review.yml use this model.
APPROVED_MODELS = ("gpt-5.6-terra",)

# Catalog fields that add tools no feature flag removes. A version where any is absent stops the
# review rather than running with a catalog nobody checked.
TOOL_FIELDS = ("tool_mode", "multi_agent_version", "apply_patch_tool_type")

# Defined in codex-exec-args.txt. Selected here, not there, because codex rejects a
# `model_provider` naming a provider it has not been given, and the CI check accepts each line of
# that file on its own.
PROVIDER_ID = "codex-review"

CATALOG_NAME = "codex-review-model-catalog.json"


def default_path():
    runner_temp = os.environ.get("RUNNER_TEMP", "")
    if not runner_temp:
        raise RuntimeError("RUNNER_TEMP is not set; refusing to guess where the model catalog lives")
    return pathlib.Path(runner_temp) / CATALOG_NAME


def bundled_catalog():
    # A fresh CODEX_HOME: no stored login, config or cached catalog. --bundled skips any refresh.
    with tempfile.TemporaryDirectory() as home:
        result = subprocess.run(
            ["codex", "debug", "models", "--bundled"],
            capture_output=True, text=True, timeout=120, env=dict(os.environ, CODEX_HOME=home),
        )
    if result.returncode != 0:
        raise RuntimeError(f"`codex debug models --bundled` failed with exit {result.returncode}")
    return json.loads(result.stdout)


def locked_catalog(bundled):
    models = {model.get("slug"): model for model in bundled.get("models", [])}
    locked = []
    for slug in APPROVED_MODELS:
        if slug not in models:
            raise RuntimeError(f"{slug} is not in the bundled catalog")
        model = dict(models[slug])
        for field in TOOL_FIELDS:
            if field not in model:
                raise RuntimeError(f"{slug} has no {field}: the catalog format changed, recheck the tools")
            model[field] = None
        locked.append(model)
    return {"models": locked}


def check_catalog(path):
    catalog = json.loads(pathlib.Path(path).read_text())
    slugs = [model.get("slug") for model in catalog.get("models", [])]
    if sorted(slugs) != sorted(APPROVED_MODELS):
        raise RuntimeError(f"the model catalog holds {slugs}, not exactly {list(APPROVED_MODELS)}")
    for model in catalog["models"]:
        for field in TOOL_FIELDS:
            if model.get(field, "missing") is not None:
                raise RuntimeError(f"{model['slug']} still sets {field}")


def write_catalog(path=None):
    path = pathlib.Path(path or default_path())
    path.write_text(json.dumps(locked_catalog(bundled_catalog())))
    check_catalog(path)
    return path


def exec_overrides(path=None):
    path = pathlib.Path(path or default_path())
    check_catalog(path)
    if not path.is_absolute() or '"' in str(path) or "\\" in str(path):
        raise RuntimeError("the model catalog path cannot be written as a TOML string")
    return ["-c", f'model_provider="{PROVIDER_ID}"', "-c", f'model_catalog_json="{path}"']


def main(argv):
    if argv == ["write"]:
        write_catalog()
        return 0
    if argv == ["exec-overrides"]:
        print("\n".join(exec_overrides()))
        return 0
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except (RuntimeError, OSError, ValueError) as error:
        print(f"codex-review-model-catalog: {error}", file=sys.stderr)
        sys.exit(1)
