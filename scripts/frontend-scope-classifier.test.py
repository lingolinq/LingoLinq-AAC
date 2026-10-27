#!/usr/bin/env python3
"""Pin the one frontend-scope classifier in .github/workflows/ci.yml.

Guarantee (docs/task-management/2026-10-26_frontend-scope-single-source.md):
1. ci.yml has exactly one step that lists a PR's files to classify it: the
   `frontend-scope` step of the `ember-shard-scope` job.
2. Every consumer reads that job's `run` output: lint-and-build (through its
   `frontend` step), ember-shard, ember-shard-coverage and build-and-test. No
   step outside ember-shard-scope reads `steps.frontend-scope`.
3. Fail toward running: each "Decide" step writes run=false only when its
   source succeeded and said exactly `false`. lint-and-build still runs when
   the scope job fails.
4. The classifier gives the CASES answer for every row.

Threat model: this catches accidental edits. It does not try to catch an edit
built to fool it (for example YAML that GitHub reads differently from Ruby's
Psych, or extra action inputs); every such edit changes .github/workflows/,
which goes through the data-bearing-paths human review and Rule 14.

ci.yml is read with Ruby's YAML parser (system Ruby on the runner), so steps
are found by structure, not by regex. Without Ruby the test errors; it never
passes.
"""
import itertools
import json
import os
import pathlib
import re
import shutil
import subprocess
import tempfile
import unittest


REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
WORKFLOW = REPO_ROOT / ".github/workflows/ci.yml"
SCOPE_JOB = "ember-shard-scope"
ALLOWED_RE = re.compile(r"const allowed = \(path\) =>[\s\S]*?;")
OLD_ALLOWED = (
    "const allowed = (path) =>\n"
    "              path.startsWith('docs/') ||\n"
    "              path.startsWith('audit-reports/');"
)
EXPRESSION_RE = re.compile(r"^\$\{\{\s*(.*?)\s*\}\}$")
STATUSES = ["success", "failure", "cancelled", "skipped", ""]
VALUES = ["true", "false", "", "FALSE", "no"]

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


def load_workflow():
    ruby = shutil.which("ruby")
    if not ruby:
        raise AssertionError("ruby is required to parse ci.yml (system Ruby on the runner)")
    result = subprocess.run(
        [ruby, "-ryaml", "-rjson", "-e",
         "puts JSON.generate(YAML.load_file(ARGV[0], aliases: false))", str(WORKFLOW)],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise AssertionError(f"could not parse {WORKFLOW}: {result.stderr}")
    return json.loads(result.stdout)


def all_steps(workflow):
    for job_name, job in workflow["jobs"].items():
        for step in job.get("steps", []):
            yield job_name, step


def classifier_steps(workflow):
    """Every step that lists a PR's files, whatever it is named."""
    return [
        (job_name, step)
        for job_name, step in all_steps(workflow)
        if "listFiles" in json.dumps(step)
    ]


def the_classifier(workflow):
    steps = classifier_steps(workflow)
    if len(steps) != 1:
        found = [(job, step.get("name")) for job, step in steps]
        raise AssertionError(f"expected exactly one classifier step, found {found}")
    return steps[0]


def step_by_id(workflow, job_name, step_id):
    matches = [s for s in workflow["jobs"][job_name].get("steps", []) if s.get("id") == step_id]
    if len(matches) != 1:
        raise AssertionError(f"expected one step with id {step_id!r} in {job_name}")
    return matches[0]


def run_decide(step, values):
    """Run a Decide step's bash. `values` maps each ${{ }} expression its env
    reads to a value; returns what it wrote to GITHUB_OUTPUT."""
    script = step["run"]
    if "${{" in script:
        raise AssertionError("a Decide step must read its inputs through env, not inline ${{ }}")
    env = {"PATH": os.environ.get("PATH", "")}
    for name, expression in step.get("env", {}).items():
        match = EXPRESSION_RE.match(str(expression))
        if not match or match.group(1) not in values:
            raise AssertionError(f"unexpected env {name}={expression!r} in {step.get('name')!r}")
        env[name] = values[match.group(1)]
    with tempfile.NamedTemporaryFile(mode="r", suffix=".out", delete=False) as handle:
        output_path = handle.name
    try:
        env["GITHUB_OUTPUT"] = output_path
        result = subprocess.run(
            ["bash", "-e", "-c", script], env=env, check=False, capture_output=True, text=True
        )
        if result.returncode != 0:
            raise AssertionError(f"Decide step exited {result.returncode}: {result.stderr}")
        return pathlib.Path(output_path).read_text()
    finally:
        os.unlink(output_path)


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
        "// Any other core method (info, warning, notice, debug) only logs.\n"
        "const core = new Proxy(\n"
        "  { setOutput(key, value) { outputs[key] = value; } },\n"
        "  { get: (target, name) => target[name] || (() => {}) },\n"
        ");\n"
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


# One file in each area that must run the suite. Any of these alone skipping
# means the allowlist was widened.
MUST_RUN_PATHS = [
    "app/frontend/app/styles/app.scss",
    "app/frontend/app/templates/application.hbs",
    "app/frontend/tests/unit/x-test.js",
    "app/frontend/package.json",
    "app/models/user.rb",
    "app/controllers/api/boards_controller.rb",
    "lib/feature_flags.rb",
    "config/routes.rb",
    "db/schema.rb",
    "spec/models/user_spec.rb",
    "public/locales/en.json",
    "scripts/frontend-scope-classifier.test.py",
    ".github/workflows/ci.yml",
    "Gemfile",
    "Gemfile.lock",
    "Dockerfile",
    "README.md",
]


class FrontendScopeClassifierTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workflow = load_workflow()
        cls.job_name, cls.step = the_classifier(cls.workflow)
        cls.script = cls.step["with"]["script"]

    def test_exactly_one_classifier(self):
        self.assertEqual(self.job_name, SCOPE_JOB)
        self.assertEqual(self.step.get("id"), "frontend-scope")
        self.assertIs(self.step.get("continue-on-error"), True)
        self.assertNotIn("if", self.step)

    def test_only_the_scope_job_reads_the_classifier(self):
        for job_name, step in all_steps(self.workflow):
            if "steps.frontend-scope" in json.dumps(step):
                with self.subTest(job=job_name, step=step.get("name")):
                    self.assertEqual(job_name, SCOPE_JOB)
                    self.assertEqual(step.get("id"), "frontend")

    def test_scope_job_publishes_its_decision(self):
        outputs = self.workflow["jobs"][SCOPE_JOB].get("outputs", {})
        self.assertEqual(outputs.get("run"), "${{ steps.frontend.outputs.run }}")

    def test_each_decide_step_fails_toward_running(self):
        sources = {
            SCOPE_JOB: ("steps.frontend-scope.outcome", "steps.frontend-scope.outputs.run_frontend"),
            "lint-and-build": ("needs.ember-shard-scope.result", "needs.ember-shard-scope.outputs.run"),
        }
        for job_name, (status_expr, value_expr) in sources.items():
            step = step_by_id(self.workflow, job_name, "frontend")
            for status, value in itertools.product(STATUSES, VALUES):
                with self.subTest(job=job_name, status=status, value=value):
                    written = run_decide(step, {status_expr: status, value_expr: value})
                    skip = status == "success" and value == "false"
                    self.assertEqual(written.strip(), "run=false" if skip else "run=true")

    def test_lint_and_build_follows_the_scope_job(self):
        job = self.workflow["jobs"]["lint-and-build"]
        needs = job.get("needs")
        self.assertIn(SCOPE_JOB, needs if isinstance(needs, list) else [needs])
        self.assertEqual(job.get("if"), "${{ !cancelled() }}")
        # Every step after the Decide step is gated on its output, one way or the other.
        steps = job["steps"]
        decide = next(i for i, step in enumerate(steps) if step.get("id") == "frontend")
        gates = {"steps.frontend.outputs.run == 'true'", "steps.frontend.outputs.run == 'false'"}
        for step in steps[decide + 1:]:
            with self.subTest(step=step.get("name")):
                self.assertIn(step.get("if"), gates)
        for step in steps[:decide]:
            with self.subTest(step=step.get("name")):
                self.assertEqual(step.get("uses", "").split("@")[0], "actions/checkout")

    def test_shards_and_gate_follow_the_scope_job(self):
        jobs = self.workflow["jobs"]
        skip_unless_told = "${{ !cancelled() && needs.ember-shard-scope.outputs.run != 'false' }}"
        for name in ("ember-shard", "ember-shard-coverage"):
            with self.subTest(job=name):
                self.assertEqual(jobs[name].get("if"), skip_unless_told)
        gate = jobs["build-and-test"]["steps"][0]["env"]
        self.assertEqual(gate.get("SCOPE"), "${{ needs.ember-shard-scope.result }}")
        self.assertEqual(gate.get("SCOPE_RUN"), "${{ needs.ember-shard-scope.outputs.run }}")
        self.assertEqual(gate.get("LINT_AND_BUILD"), "${{ needs.lint-and-build.result }}")

    def test_old_allowlist_does_not_skip_instruction_files(self):
        script = with_allowed(self.script, OLD_ALLOWED)
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

    def test_every_app_area_runs_the_suite(self):
        for path in MUST_RUN_PATHS:
            with self.subTest(path=path):
                files = [{"filename": path}]
                self.assertEqual(run_script(self.script, "pull_request", files, 1), "true")

    def test_the_classifier_agrees_with_the_case_table(self):
        for name, event, files, changed_files, expected in CASES:
            with self.subTest(name=name):
                self.assertEqual(
                    run_script(self.script, event, files, changed_files),
                    expected,
                    name,
                )


if __name__ == "__main__":
    unittest.main()
