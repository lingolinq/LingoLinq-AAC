#!/usr/bin/env python3
"""Pin both "Classify frontend impact" copies in .github/workflows/ci.yml.

The two copies are inline github-script steps. This test extracts each script
with a stdlib regex (no PyYAML), asserts their `allowed` predicates are the
same text, and runs one case table against each copy in Node. A widened
predicate in only one copy fails the sameness check. The whole script must
also match once comments, blank lines and the log-only calls are dropped, so a
change anywhere in one copy (the fetch, the skip expression, or a later output)
fails too. A log call is dropped only when it is inert: a `core.info` or
`core.warning` whose arguments hold no further call and no `=`. The allowlist
from before the instruction-file paths does not skip those paths.
"""
import json
import os
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
LOG_CALL_PREFIXES = ("core.info(", "core.warning(")
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
    (
        "near miss docsite/",
        "pull_request",
        [{"filename": "docsite/index.js"}],
        None,
        "true",
    ),
    (
        "near miss bare docs file",
        "pull_request",
        [{"filename": "docs"}],
        None,
        "true",
    ),
    (
        "near miss nested app/docs/",
        "pull_request",
        [{"filename": "app/docs/x.js"}],
        None,
        "true",
    ),
    (
        "near miss audit-reports- prefix",
        "pull_request",
        [{"filename": "audit-reports-tool.rb"}],
        None,
        "true",
    ),
    (
        "near miss CLAUDE.md suffix",
        "pull_request",
        [{"filename": "NOTCLAUDE.md"}],
        None,
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


def decision_logic(script):
    """The script as code that can change run_frontend: no comments, blank
    lines, indentation or inert log calls. Only the first copy logs."""
    lines = [line.strip() for line in script.splitlines()]
    lines = [line for line in lines if line and not line.startswith("//")]
    kept = []
    index = 0
    while index < len(lines):
        line = lines[index]
        if not line.startswith(LOG_CALL_PREFIXES):
            kept.append(line)
            index += 1
            continue
        end = index
        while not lines[end].endswith(");"):
            end += 1
            if end == len(lines):
                raise AssertionError(f"unterminated log call: {line}")
        call = "\n".join(lines[index:end + 1])
        arguments = call[call.index("(") + 1:-2]
        if "(" in arguments or "=" in arguments:
            raise AssertionError(f"log call is not inert: {call}")
        index = end + 1
    # The warning's guard is left empty; drop it only when it closes at once.
    normalized = "\n".join(kept).replace("if (!completeList) {\n}\n", "")
    if "documentationOnly" not in normalized or "setOutput('run_frontend'" not in normalized:
        raise AssertionError("could not find the run_frontend decision in a classifier script")
    return normalized


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
    try:
        result = subprocess.run(
            ["node", script_path],
            check=False,
            capture_output=True,
            text=True,
        )
    finally:
        os.unlink(script_path)
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

    def test_decision_logic_is_identical(self):
        first, second = extract_scripts()
        self.assertIn("documentationOnly", decision_logic(first))
        self.assertEqual(decision_logic(first), decision_logic(second))

    def test_changing_one_copys_decision_is_detected(self):
        first, second = extract_scripts()
        bypass = (
            "(allowed(file.filename) || "
            "file.filename.startsWith('app/frontend/app/styles/')) &&"
        )
        mutated = second.replace("allowed(file.filename) &&", bypass, 1)
        self.assertNotEqual(second, mutated)
        self.assertEqual(allowed_predicate(first), allowed_predicate(mutated))
        self.assertNotEqual(decision_logic(first), decision_logic(mutated))

    def test_changing_one_copy_outside_the_predicate_is_detected(self):
        first, second = extract_scripts()
        styles = "f.filename.startsWith('app/frontend/app/styles/')"
        before_fetch = second.replace(
            "const allowed = (path) =>",
            f"files.forEach((f) => {{ if ({styles}) f.filename = 'docs/x.md'; }});\n"
            "const allowed = (path) =>",
            1,
        )
        later_output = second.replace(
            "core.setOutput('run_frontend', documentationOnly ? 'false' : 'true');",
            "core.setOutput('run_frontend', documentationOnly ? 'false' : 'true');\n"
            f"if (files.every((f) => {styles})) core.setOutput('run_frontend', 'false');",
            1,
        )
        for name, mutated in (("before", before_fetch), ("after", later_output)):
            with self.subTest(name=name):
                self.assertNotEqual(second, mutated)
                self.assertNotEqual(decision_logic(first), decision_logic(mutated))

    def test_log_block_with_other_code_is_not_dropped(self):
        first = extract_scripts()[0]
        guard_end = ");\n            }\n"
        end = first.find(guard_end, first.index("core.warning("))
        self.assertNotEqual(end, -1)
        mutated = (
            first[:end]
            + ");\n            };\n"
            "            for (const f of files) { f.filename = 'docs/x.md';\n"
            "            }\n"
            + first[end + len(guard_end):]
        )
        self.assertNotEqual(decision_logic(first), decision_logic(mutated))
        smuggled = first.replace(
            "core.info(\n",
            "core.info(core.setOutput('run_frontend', 'false'),\n",
            1,
        )
        self.assertNotEqual(first, smuggled)
        with self.assertRaises(AssertionError):
            decision_logic(smuggled)

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
        for copy, script in enumerate(extract_scripts(), start=1):
            for name, event, files, changed_files, expected in CASES:
                with self.subTest(copy=copy, name=name):
                    self.assertEqual(
                        run_script(script, event, files, changed_files),
                        expected,
                        name,
                    )


if __name__ == "__main__":
    unittest.main()
