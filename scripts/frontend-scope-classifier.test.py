#!/usr/bin/env python3
"""Pin both "Classify frontend impact" copies in .github/workflows/ci.yml.

The two copies are inline github-script steps. This test extracts each script
with a stdlib regex (no PyYAML), asserts their `allowed` predicates are the
same text, and runs one case table against each copy in Node. A widened
predicate in only one copy fails the sameness check. The whole script must
also match once comments, blank lines and indentation are dropped, so a change
anywhere in one copy's script (the fetch, the skip expression, or a later
output) fails too. Only the first copy logs, so its log calls are dropped
before the comparison, but only the calls listed in KNOWN_LOG_CALLS, matched
exactly. Any other `core.info` or `core.warning` fails the test, so changing a
log message means updating that list. Each step's YAML (`id`,
`continue-on-error`, `uses`, no `if:`) is pinned too. Not pinned: the
"Decide whether frontend suite is required" steps and the `build-and-test`
gate that read the output. The allowlist from before the instruction-file
paths does not skip those paths.
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
HEADER_RE = re.compile(
    r"- name: Classify frontend impact\n((?:.*\n)*?)^[ ]+script: \|\n",
    re.MULTILINE,
)
USES_RE = re.compile(r"uses: actions/github-script@(?:v8|[0-9a-f]{40} # v8)")
ALLOWED_RE = re.compile(r"const allowed = \(path\) =>[\s\S]*?;")
LOG_CALL_PREFIXES = ("core.info(", "core.warning(")
# The first copy's log calls, one string per stripped line. Matching is exact:
# a heuristic for "harmless" arguments was bypassed by tagged templates,
# `${}`, `--` and `delete`, none of which need `(` or `=`.
KNOWN_LOG_CALLS = [
    ["core.info('Protected-branch push: run the complete frontend suite.');"],
    [
        "core.warning(",
        "`PR reports ${reportedCount} changed files but the API returned ${files.length}; ` +",
        "'run the full frontend suite.'",
        ");",
    ],
    [
        "core.info(",
        "documentationOnly",
        "? 'Documentation, audit, or instruction-file-only PR: skip the frontend suite.'",
        ": 'Frontend-relevant or unknown path present: run the frontend suite.'",
        ");",
    ],
]
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
        "four files, app path last",
        "pull_request",
        [
            {"filename": "docs/a.md"},
            {"filename": "docs/b.md"},
            {"filename": "docs/c.md"},
            {"filename": "app/frontend/app/x.js"},
        ],
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


def extract_headers():
    headers = HEADER_RE.findall(WORKFLOW.read_text())
    if len(headers) != 2:
        raise AssertionError(
            f"expected 2 Classify frontend impact steps in {WORKFLOW}, found {len(headers)}"
        )
    return headers


def decision_logic(script):
    """The script as code that can change run_frontend: no comments, blank
    lines, indentation or KNOWN_LOG_CALLS."""
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
        known = next(
            (call for call in KNOWN_LOG_CALLS if lines[index:index + len(call)] == call),
            None,
        )
        if known is None:
            raise AssertionError(
                f"unknown log call at {line!r}: if it only changes a message, "
                "add its stripped lines to KNOWN_LOG_CALLS"
            )
        index += len(known)
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

    def test_log_calls_with_side_effects_are_not_dropped(self):
        second = extract_scripts()[1]
        anchor = "const documentationOnly ="
        self.assertIn(anchor, second)
        # Each one changes run_frontend without a `(` or `=` in its arguments.
        injections = {
            "tagged template": "core.info(`${files.splice`0`}`);",
            "comment line in a template": (
                "core.info(`\n"
                "//${files.forEach((f) => { f.filename = 'docs/x.md'; })}\n"
                "`);"
            ),
            "decrement": "core.info(files.length > 3 && files.length--);",
            "delete": "core.info(files.length > 3 && delete files[files.length - 1]);",
            "known message with code after it": (
                "core.info('Protected-branch push: run the complete frontend suite.'); files.pop();"
            ),
        }
        for name, injection in injections.items():
            with self.subTest(name=name):
                mutated = second.replace(anchor, injection + "\n" + anchor, 1)
                with self.assertRaises(AssertionError):
                    decision_logic(mutated)

    def test_step_yaml_is_pinned(self):
        for copy, header in enumerate(extract_headers(), start=1):
            with self.subTest(copy=copy):
                lines = sorted(line.strip() for line in header.splitlines() if line.strip())
                self.assertEqual(len(lines), 4, lines)
                self.assertEqual(lines[0], "continue-on-error: true")
                self.assertEqual(lines[1], "id: frontend-scope")
                self.assertRegex(lines[2], f"^{USES_RE.pattern}$")
                self.assertEqual(lines[3], "with:")

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
