#!/usr/bin/env python3
"""Pin both "Classify frontend impact" copies in .github/workflows/ci.yml.

The two copies are inline github-script steps. This test extracts each script
with a stdlib regex (no PyYAML), asserts their `allowed` predicates are the
same text, and runs one case table against each copy in Node. A widened
predicate in only one copy fails the sameness check. The allowlist from before
the instruction-file paths does not skip those paths.
"""
import json
import pathlib
import re
import subprocess
import tempfile
import unittest


REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
WORKFLOW = REPO_ROOT / ".github/workflows/ci.yml"
# Each script is the block scalar under `script: |` that follows a
# "Classify frontend impact" step. Lines of the block stay indented at least
# twelve spaces; the next workflow key is indented less.
SCRIPT_RE = re.compile(
    r"- name: Classify frontend impact\n"
    r"(?:.*\n)*?"
    r"^[ ]+script: \|\n"
    r"((?:(?:[ ]{12}.*)?\n)*?)(?=^[ ]{0,10}\S)",
    re.MULTILINE,
)
ALLOWED_RE = re.compile(r"const allowed = \(path\) =>[\s\S]*?;")
OLD_ALLOWED = (
    "const allowed = (path) =>\n"
    "              path.startsWith('docs/') ||\n"
    "              path.startsWith('audit-reports/');"
)

# name, event, files, changed_files, expected run_frontend
# A file is {filename, previous_filename?}. changed_files None uses len(files).
CASES = [
    (
        "the three instruction files only",
        "pull_request",
        [
            {"filename": "CLAUDE.md"},
            {"filename": "AGENTS.md"},
            {"filename": ".github/copilot-instructions.md"},
        ],
        None,
        "false",
    ),
    (
        "GEMINI.md only",
        "pull_request",
        [{"filename": "GEMINI.md"}],
        None,
        "false",
    ),
    (
        "docs and audit only",
        "pull_request",
        [
            {"filename": "docs/PRE_COMMIT_CHECKLIST.md"},
            {"filename": "audit-reports/README.md"},
        ],
        None,
        "false",
    ),
    (
        "instruction files plus an app file",
        "pull_request",
        [
            {"filename": "CLAUDE.md"},
            {"filename": "app/frontend/app/controllers/application.js"},
        ],
        None,
        "true",
    ),
    (
        "rename from an app path onto an instruction file",
        "pull_request",
        [{
            "filename": "CLAUDE.md",
            "previous_filename": "app/frontend/app/controllers/application.js",
        }],
        None,
        "true",
    ),
    (
        "rename from an instruction file onto an app path",
        "pull_request",
        [{
            "filename": "app/frontend/app/controllers/application.js",
            "previous_filename": "CLAUDE.md",
        }],
        None,
        "true",
    ),
    (
        "rename between two allowlisted paths",
        "pull_request",
        [{"filename": "AGENTS.md", "previous_filename": "CLAUDE.md"}],
        None,
        "false",
    ),
    (
        "case variant claude.md",
        "pull_request",
        [{"filename": "claude.md"}],
        None,
        "true",
    ),
    (
        "app/frontend/CLAUDE.md",
        "pull_request",
        [{"filename": "app/frontend/CLAUDE.md"}],
        None,
        "true",
    ),
    (
        "deleted CLAUDE.md",
        "pull_request",
        [{"filename": "CLAUDE.md", "status": "removed"}],
        None,
        "false",
    ),
    (
        "file-count mismatch",
        "pull_request",
        [{"filename": "docs/PRE_COMMIT_CHECKLIST.md"}],
        2,
        "true",
    ),
    (
        "empty file list",
        "pull_request",
        [],
        0,
        "true",
    ),
    (
        "protected-branch push",
        "push",
        [{"filename": "CLAUDE.md"}],
        1,
        "true",
    ),
]


def extract_scripts():
    text = WORKFLOW.read_text()
    scripts = SCRIPT_RE.findall(text)
    if len(scripts) != 2:
        raise AssertionError(
            f"expected 2 Classify frontend impact scripts in {WORKFLOW}, found {len(scripts)}"
        )
    return scripts


def allowed_predicate(script):
    match = ALLOWED_RE.search(script)
    if not match:
        raise AssertionError("could not find an allowed predicate in a classifier script")
    return match.group(0)


def with_allowed(script, predicate):
    if not ALLOWED_RE.search(script):
        raise AssertionError("could not find an allowed predicate to replace")
    return ALLOWED_RE.sub(lambda _match: predicate, script, count=1)


def run_script(script, event, files, changed_files):
    if changed_files is None:
        changed_files = len(files)
    payload = {
        "eventName": event,
        "changedFiles": changed_files,
        "files": files,
    }
    program = (
        "const input = " + json.dumps(payload) + ";\n"
        "const outputs = {};\n"
        "const core = {\n"
        "  setOutput(key, value) { outputs[key] = value; },\n"
        "  info() {},\n"
        "  warning() {},\n"
        "};\n"
        "const context = {\n"
        "  eventName: input.eventName,\n"
        "  repo: { owner: 'owner', repo: 'repo' },\n"
        "  issue: { number: 1 },\n"
        "  payload: { pull_request: { changed_files: input.changedFiles } },\n"
        "};\n"
        "const github = {\n"
        "  rest: { pulls: { listFiles: {} } },\n"
        "  paginate: async () => input.files,\n"
        "};\n"
        "(async () => {\n"
        + script +
        "})().then(() => {\n"
        "  process.stdout.write(outputs.run_frontend || '');\n"
        "}).catch((error) => {\n"
        "  console.error(error);\n"
        "  process.exit(1);\n"
        "});\n"
    )
    with tempfile.NamedTemporaryFile(mode="w", suffix=".js", delete=False) as handle:
        handle.write(program)
        script_path = handle.name
    result = subprocess.run(
        ["node", script_path],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise AssertionError(
            f"node exited {result.returncode}: {result.stderr}"
        )
    return result.stdout.strip()


class FrontendScopeClassifierTest(unittest.TestCase):
    def test_allowed_predicates_are_identical(self):
        first, second = extract_scripts()
        self.assertEqual(allowed_predicate(first), allowed_predicate(second))

    def test_widening_one_copy_is_detected(self):
        first, second = extract_scripts()
        widened = allowed_predicate(second)[:-1] + " || path === 'app/foo.js';"
        mutated = with_allowed(second, widened)
        self.assertNotEqual(allowed_predicate(first), allowed_predicate(mutated))
        files = [{"filename": "app/foo.js"}]
        self.assertEqual(run_script(first, "pull_request", files, 1), "true")
        self.assertEqual(run_script(mutated, "pull_request", files, 1), "false")

    def test_old_allowlist_does_not_skip_instruction_files(self):
        script = with_allowed(extract_scripts()[0], OLD_ALLOWED)
        instruction_files = [
            {"filename": "CLAUDE.md"},
            {"filename": "AGENTS.md"},
            {"filename": ".github/copilot-instructions.md"},
            {"filename": "GEMINI.md"},
        ]
        self.assertEqual(
            run_script(script, "pull_request", instruction_files, None),
            "true",
        )
        self.assertEqual(
            run_script(
                script,
                "pull_request",
                [{"filename": "docs/PRE_COMMIT_CHECKLIST.md"}],
                None,
            ),
            "false",
        )

    def test_each_copy_agrees_on_the_case_table(self):
        for script in extract_scripts():
            for name, event, files, changed_files, expected in CASES:
                with self.subTest(name=name):
                    self.assertEqual(
                        run_script(script, event, files, changed_files),
                        expected,
                        name,
                    )


if __name__ == "__main__":
    unittest.main()
