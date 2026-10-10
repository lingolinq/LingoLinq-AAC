#!/usr/bin/env python3
"""Red test for the CODEX_REVIEW_CHUNKED_SCOPE=scot branch-name match.

The matcher lives inline in `.github/workflows/codex-review.yml` because the
Resolve Codex review evidence mode step runs before checkout and cannot call a
repo script. This test extracts that `if` condition from the YAML and evaluates
it in bash, so a revert or a wrong glob fails here rather than only when the
dormant gate is revived.
"""
import importlib.util
import json
import shutil
import os
import pathlib
import re
import shlex
import subprocess
import sys
import tempfile
import textwrap
import unittest


REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
WORKFLOW = REPO_ROOT / ".github/workflows/codex-review.yml"
CONDITION_RE = re.compile(
    r"^\s+scot\)\s*\n"
    r"\s+if (.+); then\s*$",
    re.MULTILINE,
)
OLD_CONDITION = (
    '[ "$PR_AUTHOR" = "swahlquist" ] || [[ "$PR_HEAD_REF" == scot/* ]]'
)

# author, head_ref, expected_match, why
CASES = [
    ("swahlquist", "melissa/fix/x", True, "author bypass"),
    ("other", "scot/chore/x", True, "legacy scot/<type>/<slug>"),
    (
        "other",
        "docs/scot-branch-naming-convention-f3117a76",
        True,
        "new <type>/scot-<slug>-<token>",
    ),
    (
        "other",
        "chore/scot-staging-slow-queue-capacity",
        True,
        "new form without token",
    ),
    ("other", "hotfix/scot-slug", True, "hotfix/<dev>-<slug>"),
    ("other", "fix/melissa-scot-thing", False, "other handle containing scot-"),
    ("other", "melissa/fix/x", False, "legacy other-handle form"),
    (
        "other",
        "feat/melissa-sms-consent-page",
        False,
        "new other-handle form",
    ),
    ("other", "feat/scot", False, "scot handle with no hyphenated slug"),
    ("other", "scot", False, "bare scot with no slash"),
]


def extract_condition():
    text = WORKFLOW.read_text()
    match = CONDITION_RE.search(text)
    if not match:
        raise AssertionError(
            f"could not find scot-arm if-condition in {WORKFLOW}"
        )
    return match.group(1)


def evaluate(author, ref, condition):
    script = (
        f"PR_AUTHOR={shlex.quote(author)}\n"
        f"PR_HEAD_REF={shlex.quote(ref)}\n"
        f"if {condition}; then echo MATCH; else echo MISS; fi\n"
    )
    result = subprocess.run(
        ["bash", "-c", script],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip() == "MATCH"


class ChunkedScopeMatchTest(unittest.TestCase):
    def test_old_glob_misses_new_scot_form(self):
        self.assertFalse(
            evaluate(
                "other",
                "docs/scot-branch-naming-convention-f3117a76",
                OLD_CONDITION,
            )
        )

    def test_workflow_scot_arm_matches_expected_cases(self):
        condition = extract_condition()
        self.assertNotEqual(condition, OLD_CONDITION)
        for author, ref, expected, why in CASES:
            with self.subTest(why=why, author=author, ref=ref):
                self.assertEqual(
                    evaluate(author, ref, condition),
                    expected,
                    f"{why}: {author!r} {ref!r} under {condition}",
                )


# ---------------------------------------------------------------------------
# Log exposure. AAC is a public repo, so every byte a codex-review.yml step
# writes to stdout or stderr is publicly readable in the Actions log. These tests
# run the workflow's own inline shell (extracted the same way as the scope test
# above) and the reviewer-step helpers against canary strings standing in for PR
# content, and fail if a canary reaches captured output.
# ---------------------------------------------------------------------------

# Assertions match the shared stem, so a truncated echo is caught too.
CANARY_STEM = "ZZLOGCANARY"
DIFF_CANARY = f"{CANARY_STEM}_DIFF_3f9c"
BODY_CANARY = f"{CANARY_STEM}_BODY_3f9c"
MODEL_CANARY = f"{CANARY_STEM}_MODEL_3f9c"

# Step outputs whose values are known not to carry PR content. Any other
# `steps.<id>.outputs.<name>` reference is refused: Actions prints a step's
# `env:` block, and the script text of `run:`, with expressions already
# substituted, so routing PR content through a step output publishes it.
ALLOWED_STEP_OUTPUT_REFS = {("classify", "reviewer_route")}

# Keys the workflow and its helpers may write to $GITHUB_ENV / $GITHUB_OUTPUT.
# A $GITHUB_ENV value is printed in the env block of every later step, so each
# key must be CI-owned data or PR metadata that is already public on the PR page.
ALLOWED_FILE_COMMAND_KEYS = {
    "CODEX_REVIEW_EVIDENCE_MODE",
    "CODEX_REVIEW_SCOPE_PR_AUTHOR",
    "CODEX_REVIEW_SCOPE_PR_HEAD_REF",
    "CODEX_CHUNK_MODEL_EFFECTIVE",
    "CODEX_SYNTHESIS_MODEL_EFFECTIVE",
    "data_bearing",
    "compliance_path",
    "reviewer_route",
}
FILE_COMMAND_KEY_RE = re.compile(r"""(?:echo|printf)\s+(?:-\w+\s+)?["']?([A-Za-z_][A-Za-z0-9_]*)(=|<<)""")

EXPRESSION_RE = re.compile(r"\$\{\{[^}]*\}\}")

# Echoes its stdin the way `codex exec` does (after a `user` line) and prints a
# final message; the first call writes invalid JSON so the retry path runs too.
FAKE_CODEX = r'''#!/usr/bin/env python3
import json, os, pathlib, sys
args = sys.argv[1:]
out = args[args.index("--output-last-message") + 1]
prompt = sys.stdin.read()
counter = pathlib.Path(os.environ["FAKE_COUNTER"])
calls = int(counter.read_text() or "0") + 1
counter.write_text(str(calls))
pathlib.Path(os.environ["FAKE_RECEIVED_DIR"], f"received-{calls}").write_text(prompt)
finding = {"id": "CR-1", "severity": "HIGH", "category": "code", "file": "app/a.rb",
           "line": 1, "description": os.environ["FAKE_MODEL_CANARY"], "evidence": "e",
           "suggested_fix": "f", "verifiable_check": "v"}
body = json.dumps({"verdict": "REQUEST_CHANGES", "head_sha": "a" * 40, "findings": [finding],
                   "checks_run": {}, "resolved_from_prior_loop": []})
sys.stderr.write("user\n" + prompt + "\n")
if os.environ.get("FAKE_MODE") == "fail":
    sys.exit(1)
pathlib.Path(out).write_text("not json" if calls == 1 else body)
sys.stdout.write("codex\n" + body + "\n")
'''

# Stands in for curl in the W2 POST step: answers HTTP 500 with a body that
# echoes the posted review, the worst case for what W2 could return.
FAKE_CURL = r'''#!/usr/bin/env python3
import json, os, pathlib, sys
args = sys.argv[1:]
counter = pathlib.Path(os.environ["FAKE_COUNTER"])
counter.write_text(str(int(counter.read_text() or "0") + 1))
out = args[args.index("-o") + 1]
pathlib.Path(out).write_text(json.dumps({"error": "rejected", "echo": os.environ["FAKE_MODEL_CANARY"]}))
sys.stdout.write("500")
'''


FAKE_GH = r'''#!/usr/bin/env python3
import json, os, sys
args = sys.argv[1:]
canary = os.environ["FAKE_BODY_CANARY"]
if args[:2] == ["pr", "view"]:
    print(json.dumps({"title": canary + "_TITLE", "body": canary, "mergeable": "MERGEABLE",
                      "mergeStateStatus": "CLEAN", "headRefOid": "a" * 40}))
elif args[:2] == ["pr", "checks"]:
    print(canary + "_CHECK\tpass\t1s")
else:
    sys.exit(2)
'''

FAKE_GIT = r'''#!/usr/bin/env python3
import os, sys
args = sys.argv[1:]
while args[:1] == ["-c"]:
    args = args[2:]
diff_canary = os.environ["FAKE_DIFF_CANARY"]
path = os.environ.get("FAKE_GIT_PATH") or "app/" + diff_canary + "_FILE.rb"


def quoted(name):
    # Like real git: a name holding a tab, newline, `"` or `\` is printed quoted unless -z is given.
    if any(c in name for c in '\t\n"\\'):
        escaped = name.replace("\\", "\\\\").replace('"', '\\"').replace("\t", "\\t").replace("\n", "\\n")
        return '"' + escaped + '"'
    return name


if args[:1] == ["diff"] and "--name-only" in args:
    sys.stdout.write(path + "\0" if "-z" in args else quoted(path) + "\n")
elif args[:1] == ["diff"]:
    print("diff --git a/" + path + " b/" + path)
    print("+" + diff_canary)
elif args[:1] == ["ls-tree"]:
    # Answers only for the exact name asked about, as a literal pathspec or a plain one.
    requested = args[-1]
    if requested.startswith(":(literal)"):
        requested = requested[len(":(literal)"):]
    elif requested.startswith(":("):
        # Real git reads this as pathspec magic, not as the file's name.
        requested = None
    if requested == path:
        print("100644 blob " + "c" * 40 + "\t" + quoted(path))
else:
    sys.exit(2)
'''


def extract_step_run(step_name):
    """Return the dedented `run: |` body of the step whose name starts with step_name."""
    lines = WORKFLOW.read_text().splitlines()
    start = next(
        (i for i, line in enumerate(lines) if line.strip().startswith(f"- name: {step_name}")),
        None,
    )
    if start is None:
        raise AssertionError(f"could not find step {step_name!r} in {WORKFLOW}")
    for i in range(start + 1, len(lines)):
        stripped = lines[i].strip()
        if stripped.startswith("- name:"):
            break
        if stripped == "run: |":
            indent = len(lines[i]) - len(lines[i].lstrip())
            body = []
            for line in lines[i + 1:]:
                if line.strip() and len(line) - len(line.lstrip()) <= indent:
                    break
                body.append(line)
            return textwrap.dedent("\n".join(body))
    raise AssertionError(f"step {step_name!r} has no `run: |` block")


def run_blocks(text):
    """Every `run:` body in a workflow (block and single-line forms), dedented."""
    lines = text.splitlines()
    blocks = []
    for i, line in enumerate(lines):
        single = re.match(r"\s*run:\s*(?![|>])(\S.*)$", line)
        if single:
            blocks.append(single.group(1))
            continue
        if re.match(r"\s*run:\s*[|>][-+]?\s*$", line):
            indent = len(line) - len(line.lstrip())
            body = []
            for nxt in lines[i + 1:]:
                if nxt.strip() and len(nxt) - len(nxt.lstrip()) <= indent:
                    break
                body.append(nxt)
            blocks.append(textwrap.dedent("\n".join(body)))
    return blocks


FILE_COMMAND_TARGET_RE = re.compile(r"GITHUB_(?:ENV|OUTPUT)")


def file_command_writes(script):
    """Return (writes, unparsed) for $GITHUB_ENV / $GITHUB_OUTPUT use.

    writes: (key, op) for every echo/printf whose output lands in either file,
    whether redirected directly or from inside a `{ ... }` group whose closing
    line redirects there. unparsed: every other line that touches either file,
    or that sits inside such a group without being a recognised `KEY=` write.
    Anything this parser cannot account for is reported, never ignored."""
    writes, unparsed = [], []
    stack = [[]]
    for line in script.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped == "{":
            stack.append([])
            continue
        if stripped.startswith("}") and len(stack) > 1:
            group = stack.pop()
            if FILE_COMMAND_TARGET_RE.search(stripped):
                for inner in group:
                    found = FILE_COMMAND_KEY_RE.findall(inner)
                    writes.extend(found)
                    if not found:
                        unparsed.append(inner.strip())
            elif not re.search(r"[>|]", stripped):
                stack[-1].extend(group)
            continue
        if FILE_COMMAND_TARGET_RE.search(line):
            found = FILE_COMMAND_KEY_RE.findall(line) if ">" in line else []
            writes.extend(found)
            if not found:
                unparsed.append(stripped)
        stack[-1].append(line)
    return writes, unparsed


def localize(script, tmp):
    """Point the step at a scratch dir and neutralise ${{ }} expressions."""
    return EXPRESSION_RE.sub("DUMMY", script).replace("/tmp/", f"{tmp}/")


def install_fake(bin_dir, name, source):
    path = pathlib.Path(bin_dir) / name
    path.write_text(source)
    path.chmod(0o755)


def run_step(script, tmp, bin_dir, mode="ok", extra_env=None):
    env = dict(os.environ)
    env["FAKE_MODE"] = mode
    env["PATH"] = f"{bin_dir}{os.pathsep}{env.get('PATH', '')}"
    env["FAKE_COUNTER"] = str(pathlib.Path(tmp) / "calls")
    env["FAKE_RECEIVED_DIR"] = str(tmp)
    env["FAKE_MODEL_CANARY"] = MODEL_CANARY
    env["FAKE_BODY_CANARY"] = BODY_CANARY
    env["FAKE_DIFF_CANARY"] = DIFF_CANARY
    # Actions sets this on every step; the workflow runs every helper from it.
    env["GITHUB_WORKSPACE"] = str(REPO_ROOT)
    env.update(extra_env or {})
    # codex-review.yml sets no `shell:`, so Actions runs each step as
    # `bash -e {0}` (no pipefail).
    return subprocess.run(
        ["bash", "-e", "-c", script],
        cwd=REPO_ROOT,
        env=env,
        capture_output=True,
        text=True,
    )


def write_locked_catalog(runner_temp):
    """The locked model catalog the install step writes under $RUNNER_TEMP, locked from a stub
    because codex in these tests is a fake."""
    catalog = load_module("codex_review_model_catalog", REPO_ROOT / "scripts/codex-review-model-catalog.py")
    stub = {"models": [dict({"slug": slug}, **{field: "set" for field in catalog.TOOL_FIELDS})
                       for slug in catalog.APPROVED_MODELS]}
    (pathlib.Path(runner_temp) / catalog.CATALOG_NAME).write_text(json.dumps(catalog.locked_catalog(stub)))


class WorkflowLogExposureTest(unittest.TestCase):
    def assert_no_canary(self, log):
        self.assertFalse(CANARY_STEM in log, "PR content or model output reached the job log")

    def bounded_step(self, tmp, mode, with_catalog=True):
        script = extract_step_run("Run reviewer (codex exec, converge across runs)")
        bin_dir = pathlib.Path(tmp) / "bin"
        bin_dir.mkdir()
        install_fake(bin_dir, "codex", FAKE_CODEX)
        (pathlib.Path(tmp) / "calls").write_text("0")
        (pathlib.Path(tmp) / "prompt.md").write_text(
            f"### gh pr view\n{{\"body\": \"{BODY_CANARY}\"}}\n+{DIFF_CANARY}\n"
        )
        (pathlib.Path(tmp) / "pr_diff.txt").write_text(f"+{DIFF_CANARY}\n")
        (pathlib.Path(tmp) / "pr_diff_full.txt").write_text(f"+{DIFF_CANARY}\n")
        if with_catalog:
            write_locked_catalog(tmp)
        return run_step(localize(script, tmp), tmp, bin_dir, mode, extra_env={"RUNNER_TEMP": str(tmp)})

    def test_bounded_reviewer_step_keeps_codex_transcript_out_of_the_log(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = self.bounded_step(tmp, "ok")

            self.assertEqual(result.returncode, 0, "bounded reviewer step did not complete")
            # Run 1 (invalid JSON), its retry, and run 2: all three channels exercised.
            self.assertEqual((pathlib.Path(tmp) / "calls").read_text(), "3")
            self.assertIn(MODEL_CANARY, (pathlib.Path(tmp) / "review-2.json").read_text())
            for n in (1, 2, 3):
                received = (pathlib.Path(tmp) / f"received-{n}").read_text()
                with self.subTest(call=n):
                    self.assertIn(DIFF_CANARY, received, "the model did not receive the diff")
                    self.assertIn(BODY_CANARY, received, "the model did not receive the PR body")
            self.assert_no_canary(result.stdout + result.stderr)

    def test_bounded_reviewer_refuses_to_run_without_the_locked_model_catalog(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = self.bounded_step(tmp, "ok", with_catalog=False)

            self.assertNotEqual(result.returncode, 0)
            self.assertEqual((pathlib.Path(tmp) / "calls").read_text(), "0", "codex ran without the locked catalog")
            self.assert_no_canary(result.stdout + result.stderr)

    def test_bounded_reviewer_failure_is_labelled_not_echoed(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = self.bounded_step(tmp, "fail")

            self.assertNotEqual(result.returncode, 0, "a failed codex call must fail the step")
            self.assertEqual((pathlib.Path(tmp) / "calls").read_text(), "1")
            self.assertIn("model call failed: exit=1 label=", result.stderr)
            self.assert_no_canary(result.stdout + result.stderr)

    def collection_step(self, tmp, step_name, git_path=None):
        bin_dir = pathlib.Path(tmp) / "bin"
        bin_dir.mkdir()
        install_fake(bin_dir, "gh", FAKE_GH)
        install_fake(bin_dir, "git", FAKE_GIT)
        output = pathlib.Path(tmp) / "github_output"
        output.write_text("")
        env = {
            "PR_NUMBER": "1",
            "HEAD_SHA": "a" * 40,
            "BASE_SHA": "b" * 40,
            "LOOP_N": "0",
            "GITHUB_OUTPUT": str(output),
            "CODEX_REVIEW_REQUESTED_EVIDENCE_MODE": "bounded",
            "CODEX_REVIEW_CHUNKED_SCOPE": "none",
            "CODEX_REVIEW_EVIDENCE_MODE": "bounded",
            "CODEX_REVIEW_SCOPE_PR_AUTHOR": "someone",
            "CODEX_REVIEW_SCOPE_PR_HEAD_REF": "fix/x",
        }
        if git_path:
            env["FAKE_GIT_PATH"] = git_path
        script = localize(extract_step_run(step_name), tmp)
        return run_step(script, tmp, bin_dir, extra_env=env), output

    def test_gather_live_state_writes_pr_content_to_files_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            result, output = self.collection_step(tmp, "Gather live state")
            self.assertEqual(result.returncode, 0, "live-state step did not complete")
            prompt_state = (pathlib.Path(tmp) / "live_state_prompt.txt").read_text()
            for canary in (BODY_CANARY, f"{BODY_CANARY}_TITLE", f"{DIFF_CANARY}_FILE.rb"):
                with self.subTest(canary=canary):
                    self.assertIn(canary, prompt_state, "live state is missing PR content")
            self.assertIn(BODY_CANARY, (pathlib.Path(tmp) / "live_state.txt").read_text())
            self.assertFalse(CANARY_STEM in output.read_text(), "PR content written to GITHUB_OUTPUT")
            self.assert_no_canary(result.stdout + result.stderr)

    def test_gather_live_state_finds_a_file_whose_name_git_quotes(self):
        # A name git quotes (tab, newline, `"`, `\`) was looked up in quoted form, found nothing at
        # head, and was listed as deleted. `:(` names must not be read as pathspec magic either.
        for name in ("app/a\tb.rb", "app/x\ny.rb", ":(top)evil.rb"):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as tmp:
                result, _output = self.collection_step(tmp, "Gather live state", git_path=name)
                self.assertEqual(result.returncode, 0, "live-state step did not complete")
                prompt_state = (pathlib.Path(tmp) / "live_state_prompt.txt").read_text()
                self.assertIn("100644 blob", prompt_state)
                self.assertNotIn("(deleted at head)", prompt_state)

    def test_gather_pr_diff_writes_the_diff_to_a_file_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            result, output = self.collection_step(tmp, "Gather PR diff")
            self.assertEqual(result.returncode, 0, "diff step did not complete")
            self.assertIn(DIFF_CANARY, (pathlib.Path(tmp) / "pr_diff.txt").read_text())
            self.assertFalse(CANARY_STEM in output.read_text(), "PR content written to GITHUB_OUTPUT")
            self.assert_no_canary(result.stdout + result.stderr)

    def test_run_blocks_parses_every_scalar_form(self):
        for header in ("run: |", "run: |-", "run: |+", "run: >", "run: >-", "run: >+"):
            with self.subTest(header=header):
                text = f"      - name: x\n        {header}\n          echo BODY_LINE\n      - name: y\n"
                self.assertEqual(run_blocks(text), ["echo BODY_LINE"])
        self.assertEqual(run_blocks("        run: echo ONE_LINE\n"), ["echo ONE_LINE"])

    def test_pr_content_is_never_routed_through_a_step_output(self):
        text = WORKFLOW.read_text()
        refs = set(re.findall(r"steps\.([\w-]+)\.outputs\.([\w-]+)", text))
        self.assertEqual(
            refs - ALLOWED_STEP_OUTPUT_REFS,
            set(),
            "a step output that can carry PR content is expanded into an env or run block",
        )
        for form in ("steps[", "outputs[", "toJSON(steps", "toJSON(env"):
            with self.subTest(form=form):
                self.assertNotIn(form, text, f"{form} expands step outputs or env wholesale")
        env_refs = set(re.findall(r"\benv\.([A-Za-z_][A-Za-z0-9_]*)", text))
        self.assertEqual(env_refs - ALLOWED_FILE_COMMAND_KEYS, set(), "an unlisted env value is expanded")

    def test_only_allowlisted_keys_are_written_to_github_env_or_output(self):
        workflow_text = WORKFLOW.read_text()
        blocks = run_blocks(workflow_text)
        # Every non-comment workflow line that names either file must sit in a
        # block this test parses; otherwise the scan below never sees it.
        parsed = "\n".join(blocks)
        for line in workflow_text.splitlines():
            stripped = line.strip()
            if FILE_COMMAND_TARGET_RE.search(stripped) and not stripped.startswith("#"):
                with self.subTest(line=stripped):
                    self.assertIn(stripped, parsed, "file-command reference outside any parsed run block")
        units = {f"{WORKFLOW.name} run block {i}": block for i, block in enumerate(blocks)}
        for helper in sorted((REPO_ROOT / "scripts").glob("codex-review-*.sh")):
            units[helper.name] = helper.read_text()
        # Python helpers must not touch either file at all.
        for helper in sorted((REPO_ROOT / "scripts").glob("codex-review-*.py")):
            if not helper.name.endswith(".test.py"):
                with self.subTest(helper=helper.name):
                    self.assertIsNone(FILE_COMMAND_TARGET_RE.search(helper.read_text()), "python helper writes a file command")
        seen = set()
        for name, text in units.items():
            writes, unparsed = file_command_writes(text)
            with self.subTest(unit=name, check="unparsed"):
                self.assertEqual(unparsed, [], "file-command access this test cannot account for")
            for key, op in writes:
                with self.subTest(unit=name, key=key):
                    self.assertNotEqual(op, "<<", f"{key}: multi-line file-command values are not allowed")
                    self.assertIn(key, ALLOWED_FILE_COMMAND_KEYS, f"{key} is written to a file command")
                seen.add(key)
        # The scan must be finding the writes that exist, or it proves nothing.
        self.assertTrue({"CODEX_REVIEW_EVIDENCE_MODE", "reviewer_route"} <= seen)

    # The PR is fetched as git objects and never checked out (2026-10-02): replaced the test that
    # every helper was restored from the workflow ref into the PR checkout, which no longer exists.
    def test_the_pr_is_never_checked_out_and_checkouts_keep_no_credentials(self):
        text = WORKFLOW.read_text()
        self.assertNotIn("PR_CHECKOUT", re.sub(r"\s+", " ", text).replace("ref: ${{ inputs.head_sha }}", "PR_CHECKOUT"), "the PR head is checked out")
        self.assertIn("ref: ${{ github.workflow_sha }}", text, "the trusted checkout is missing")
        self.assertNotIn("working-directory", text)
        self.assertNotIn("Restore Codex review helpers", text, "the in-place helper restore is back")
        for ref in re.findall(r"^\s*ref:\s*(.+)$", text, re.MULTILINE):
            with self.subTest(ref=ref):
                self.assertNotRegex(ref, r"(?i)head_sha", "a checkout of the PR head")
        for i, block in enumerate(run_blocks(text)):
            with self.subTest(block=i):
                self.assertNotRegex(block, r"\bgit\s+(?:-\S+\s+\S+\s+)*(?:checkout|switch|worktree|restore|reset|stash)\b",
                                    "a git command that writes PR files to disk")
        uses = re.findall(r"^\s*(?:-\s*)?uses:\s*(\S+)", text, re.MULTILINE)
        self.assertTrue(uses, "no actions found")
        for ref in uses:
            with self.subTest(uses=ref):
                self.assertRegex(ref, r"@[0-9a-f]{40}$", "action not pinned to a commit SHA")
        checkouts = [m.start() for m in re.finditer(r"^\s*(?:-\s*)?uses:\s*actions/checkout@", text, re.MULTILINE)]
        self.assertTrue(checkouts, "no checkout found")
        for start in checkouts:
            block = text[start:start + 400].split("\n      - name:")[0]
            with self.subTest(checkout=start):
                self.assertIn("persist-credentials: false", block)

    def test_every_helper_runs_from_the_trusted_checkout_in_isolated_mode(self):
        blocks = run_blocks(WORKFLOW.read_text())
        units = {f"run block {i}": b for i, b in enumerate(blocks)}
        units["codex-review-claude-deep.sh"] = (REPO_ROOT / "scripts/codex-review-claude-deep.sh").read_text()
        seen_helpers = 0
        for name, text in units.items():
            # Comments and here-doc bodies (the blocked route's JSON names a helper as text) are
            # not invocations.
            text = re.sub(r"<<(\w+)\n.*?\n\s*\1\b", "", text, flags=re.S)
            code = "\n".join(line for line in text.splitlines() if not line.strip().startswith("#"))
            for call in re.findall(r"python3\b[^\n]*", code):
                with self.subTest(unit=name, call=call[:60]):
                    self.assertTrue(call.startswith("python3 -I "), "python3 without -I")
            for ref in re.finditer(r"(\S*)scripts/codex-review-[\w.-]+", code):
                seen_helpers += 1
                with self.subTest(unit=name, ref=ref.group(0)[:80]):
                    self.assertIn("$GITHUB_WORKSPACE/", ref.group(1), "helper run by a relative path")
            for ref in re.finditer(r"python3 -I (\S+)", code):
                with self.subTest(unit=name, script=ref.group(1)):
                    self.assertTrue(ref.group(1) in ("-c",) or ref.group(1).startswith(('"$GITHUB_WORKSPACE/', '"$QUIET"', '"$HERE/')),
                                    "helper not addressed by an absolute trusted path")
            with self.subTest(unit=name, check="secrets in script"):
                self.assertNotIn("${{ secrets.", text, "a secret is expanded into a step script")
            with self.subTest(unit=name, check="no login"):
                self.assertNotIn("codex login", code, "codex login stores a credential on disk")
        self.assertGreater(seen_helpers, 5, "the helper scan found nothing")

    def test_git_diffs_never_run_configured_drivers(self):
        checked = 0
        for i, block in enumerate(run_blocks(WORKFLOW.read_text())):
            commands = "\n".join(line for line in block.splitlines() if not line.strip().startswith(("#", "echo")))
            for call in re.findall(r"git (?:-c \S+ )*diff(?! --name-only)[^\n]*", commands):
                checked += 1
                with self.subTest(block=i, call=call[:60]):
                    self.assertIn("--no-ext-diff", call)
                    self.assertIn("--no-textconv", call)
        self.assertGreater(checked, 0, "no content diff found to check")

    def test_github_token_is_not_job_wide_and_never_reaches_the_bounded_reviewer(self):
        text = WORKFLOW.read_text()
        workflow_env = text.split("\nenv:\n", 1)[1].split("\njobs:\n", 1)[0]
        self.assertNotIn("GH_TOKEN", workflow_env, "GH_TOKEN is workflow-wide")
        self.assertIsNone(re.search(r"^    env:", text, re.MULTILINE), "a job-level env block (job-wide values)")
        for step in ("Run reviewer (codex exec, converge across runs)", "Run reviewer (codex exec, chunked evidence)"):
            body = text.split(f"- name: {step}", 1)[1].split("\n      - name:", 1)[0]
            code = "\n".join(line for line in body.splitlines() if not line.strip().startswith("#"))
            with self.subTest(step=step):
                self.assertNotIn("GH_TOKEN", code, "a GitHub token sits above the codex process")
                self.assertNotIn("--heartbeat", code)
        self.assertIn("environment: codex-review", text, "secrets are not scoped to the codex-review environment")

    def test_status_lifecycle_runs_outside_the_secrets_environment(self):
        # An environment's protection rules run before any step of the job that names it, so a
        # refused run must still get its pending anchor and its terminal status (2026-10-02).
        jobs = {}
        text = WORKFLOW.read_text().split("\njobs:\n", 1)[1]
        for match in re.finditer(r"^  ([\w-]+):\n(.*?)(?=^  [\w-]+:\n|\Z)", text, re.MULTILINE | re.DOTALL):
            jobs[match.group(1)] = match.group(2)
        self.assertEqual(set(jobs), {"status-pending", "codex-review", "status-final"})
        self.assertIn("environment: codex-review", jobs["codex-review"])
        self.assertIn("needs: status-pending", jobs["codex-review"])
        for name in ("status-pending", "status-final"):
            with self.subTest(job=name):
                self.assertNotIn("environment:", jobs[name])
                self.assertNotIn("secrets.", jobs[name])
        self.assertIn("state=pending", jobs["status-pending"])
        self.assertIn("if: always()", jobs["status-final"].split("steps:", 1)[0])
        self.assertIn("codex-review", jobs["status-final"].split("steps:", 1)[0])
        self.assertIn("JOB_STATUS: ${{ needs.codex-review.result }}", jobs["status-final"])
        self.assertIn("skipped)", jobs["status-final"])

    def test_base_sha_must_be_on_the_prs_base_branch_and_leave_a_non_empty_diff(self):
        # base_sha decides what the reviewer sees (every check diffs BASE_SHA...HEAD_SHA). A
        # dispatch with base_sha = head_sha (empty diff) or a commit on the PR branch (only the
        # tail of the PR) must fail instead of producing an APPROVE for the real head.
        script = extract_step_run("Bind base_sha to the PR's base branch (refuse a diff that hides part of the PR)")
        cases = {
            # name: (status of base_sha...baseRefOid, ahead_by of base_sha...head_sha, should pass)
            "base commit of the PR": ("identical", "3", True),
            "older commit on the base branch": ("ahead", "3", True),
            "base_sha is the head itself": ("ahead", "0", False),
            "commit only on the PR branch": ("diverged", "1", False),
            "base_sha past the base tip": ("behind", "3", False),
        }
        for name, (to_base, ahead_by, ok) in cases.items():
            with self.subTest(name), tempfile.TemporaryDirectory() as tmp:
                bin_dir = pathlib.Path(tmp) / "bin"
                bin_dir.mkdir()
                install_fake(bin_dir, "gh", COMPARE_GH)
                run = run_step(localize(script, tmp), tmp, bin_dir, extra_env={
                    "FAKE_TO_BASE": to_base, "FAKE_AHEAD_BY": ahead_by,
                    "PR_NUMBER": "7", "BASE_SHA": "b" * 40, "HEAD_SHA": "a" * 40,
                    "RUN_URL": "https://run/1", "GITHUB_REPOSITORY": "o/r", "GH_TOKEN": "t",
                })
                calls = (pathlib.Path(tmp) / "gh-calls").read_text() if (pathlib.Path(tmp) / "gh-calls").exists() else ""
                self.assertEqual(run.returncode == 0, ok, run.stderr)
                self.assertEqual("state=failure" in calls, not ok, calls)

    def test_status_final_resolves_every_review_job_result_to_a_terminal_failure(self):
        # The step uses jq, as on GitHub's runners. Fail clearly rather than through its retry sleeps.
        self.assertIsNotNone(shutil.which("jq"), "jq is required to run this step (preinstalled on GitHub runners)")
        script = extract_step_run("Resolve codex-review/deep-pass to a terminal state")
        cases = {
            "skipped": "did not start",
            "failure": "failed before producing a verdict",
            "cancelled": "cancelled",
            "success": "wrote no verdict",
        }
        for result, expected in cases.items():
            with self.subTest(result=result), tempfile.TemporaryDirectory() as tmp:
                bin_dir = pathlib.Path(tmp) / "bin"
                bin_dir.mkdir()
                install_fake(bin_dir, "gh", STATUS_GH)
                run = run_step(localize(script, tmp), tmp, bin_dir, extra_env={
                    "JOB_STATUS": result, "HEAD_SHA": "a" * 40, "RUN_URL": "https://run/1",
                    "GITHUB_REPOSITORY": "o/r", "GH_TOKEN": "t",
                })
                posted = (pathlib.Path(tmp) / "gh-calls").read_text()
                self.assertIn("state=failure", posted)
                self.assertIn(expected, posted)
                # A green review job that wrote no verdict must not leave the run green either.
                self.assertEqual(run.returncode != 0, result == "success")

    def test_model_calls_get_no_credentials_but_their_own(self):
        quiet = load_module("codex_review_quiet_exec", REPO_ROOT / "scripts/codex-review-quiet-exec.py")
        env = quiet.model_env({
            "PATH": "/bin", "HOME": "/h", "CODEX_HOME": "/c", "CODEX_API_KEY": "k",
            "GH_TOKEN": "t", "GITHUB_TOKEN": "t", "ACTIONS_RUNTIME_TOKEN": "t",
            "N8N_HMAC_SECRET": "s", "N8N_WEBHOOK_URL": "u", "ANTHROPIC_API_KEY": "a",
            "GITHUB_ENV": "/e", "GITHUB_OUTPUT": "/o", "GITHUB_PATH": "/p", "GITHUB_STATE": "/s",
            "GITHUB_STEP_SUMMARY": "/m",
        })
        self.assertEqual(set(env), {"PATH", "HOME", "CODEX_HOME", "CODEX_API_KEY"})

    def test_the_quiet_runner_starts_model_calls_without_the_job_credentials(self):
        quiet = load_module("codex_review_quiet_exec", REPO_ROOT / "scripts/codex-review-quiet-exec.py")
        saved = {name: os.environ.get(name) for name in ("GH_TOKEN", "CODEX_API_KEY")}
        os.environ["GH_TOKEN"] = "gh-token-should-not-reach-the-model"
        os.environ["CODEX_API_KEY"] = "codex-key"
        try:
            with tempfile.TemporaryDirectory() as tmp:
                out = pathlib.Path(tmp) / "env.json"
                child = f"import json, os; open({str(out)!r}, 'w').write(json.dumps(sorted(os.environ)))"
                returncode, _ = quiet.run_quiet([sys.executable, "-c", child], None)
                self.assertEqual(returncode, 0)
                names = json.loads(out.read_text())
        finally:
            for name, value in saved.items():
                if value is None:
                    os.environ.pop(name, None)
                else:
                    os.environ[name] = value
        self.assertNotIn("GH_TOKEN", names)
        self.assertIn("CODEX_API_KEY", names)

    def run_assembler(self, tmp, live_state, pr_diff):
        env = dict(os.environ)
        env["LOOP_N"] = "0"
        env.pop("LIVE_STATE_FILE", None)
        env.pop("PR_DIFF_FILE", None)
        if live_state is not None:
            path = pathlib.Path(tmp) / "live_state_prompt.txt"
            path.write_text(live_state)
            env["LIVE_STATE_FILE"] = str(path)
        if pr_diff is not None:
            path = pathlib.Path(tmp) / "pr_diff.txt"
            path.write_text(pr_diff)
            env["PR_DIFF_FILE"] = str(path)
        out = pathlib.Path(tmp) / "prompt.md"
        result = subprocess.run(
            [sys.executable, "scripts/codex-review-assemble-prompt.py", str(out)],
            cwd=REPO_ROOT,
            env=env,
            capture_output=True,
            text=True,
        )
        return result, out

    def test_assembler_puts_pr_content_in_the_prompt_not_the_log(self):
        with tempfile.TemporaryDirectory() as tmp:
            live = f"### gh pr view\n{{\"body\": \"{BODY_CANARY}\"}}\n100644 blob abc\tapp/{CANARY_STEM}_FILE.rb\n"
            result, out = self.run_assembler(tmp, live, f"+{DIFF_CANARY}\n")
            self.assertEqual(result.returncode, 0, "assembler failed on valid input")
            prompt = out.read_text()
            for canary in (BODY_CANARY, DIFF_CANARY, f"{CANARY_STEM}_FILE.rb"):
                with self.subTest(canary=canary):
                    self.assertIn(canary, prompt, "PR evidence is missing from the prompt")
            self.assert_no_canary(result.stdout + result.stderr)

    def test_assembler_fails_closed_without_its_evidence(self):
        cases = {
            "diff file unset": ("live", None),
            "diff file empty": ("live", "  \n"),
            "live state unset": (None, "+x\n"),
        }
        for why, (live, diff) in cases.items():
            with self.subTest(why=why), tempfile.TemporaryDirectory() as tmp:
                result, out = self.run_assembler(tmp, live, diff)
                self.assertNotEqual(result.returncode, 0, f"{why}: assembled a prompt without evidence")
                self.assertFalse(out.exists(), f"{why}: a prompt file was written")

    def test_claude_deep_extractor_does_not_echo_the_model_response(self):
        extractor = REPO_ROOT / "scripts/codex-review-claude-deep-extract-response.py"
        with tempfile.TemporaryDirectory() as tmp:
            response = pathlib.Path(tmp) / "response.json"
            response.write_text(json.dumps({
                "type": f"{MODEL_CANARY}type",
                "stop_reason": f"{MODEL_CANARY}stop",
                "error": {"type": f"{MODEL_CANARY}err", "message": MODEL_CANARY},
                "content": [{"type": f"{MODEL_CANARY}block", "text": MODEL_CANARY}],
            }))
            result = subprocess.run(
                [sys.executable, str(extractor), str(response), str(pathlib.Path(tmp) / "out.json")],
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 1, "a response without submit_review must fail")
            self.assertTrue(result.stderr.strip(), "the failure must still say what went wrong")
            self.assert_no_canary(result.stdout + result.stderr)

    def test_claude_deep_extractor_names_known_failures(self):
        extractor = REPO_ROOT / "scripts/codex-review-claude-deep-extract-response.py"
        with tempfile.TemporaryDirectory() as tmp:
            response = pathlib.Path(tmp) / "response.json"
            response.write_text(json.dumps({
                "type": "error",
                "error": {"type": "billing_error", "message": MODEL_CANARY},
            }))
            result = subprocess.run(
                [sys.executable, str(extractor), str(response), str(pathlib.Path(tmp) / "out.json")],
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 1)
            self.assertIn("type=error", result.stderr)
            self.assertIn("error_type=billing_error", result.stderr)
            self.assert_no_canary(result.stdout + result.stderr)

    def test_bounded_codex_calls_do_not_save_sessions(self):
        script = extract_step_run("Run reviewer (codex exec, converge across runs)")
        # Each invocation's arguments run from `codex exec` to its output flag. --ephemeral and
        # the other hardening arguments come from the shared file both reviewers read (2026-10-02).
        calls = [segment.split("--output-last-message")[0] for segment in script.split("codex exec")[1:]]
        self.assertEqual(len(calls), 2, "expected the first call and the retry")
        for n, call in enumerate(calls, 1):
            with self.subTest(call=n):
                self.assertIn('"${CODEX_HARDENING[@]}"', call)
                self.assertIn('-C "$CODEX_WORKDIR"', call)
        hardening = (REPO_ROOT / ".github/codex/codex-exec-args.txt").read_text().splitlines()
        for required in ("--ephemeral", "--skip-git-repo-check", "--ignore-user-config", "read-only",
                         "features.shell_tool=false", 'web_search="disabled"'):
            with self.subTest(required=required):
                self.assertIn(required, hardening)

    def test_w2_post_failure_does_not_echo_the_response_body(self):
        script = extract_step_run("POST result to n8n W2 and resolve status")
        with tempfile.TemporaryDirectory() as tmp:
            bin_dir = pathlib.Path(tmp) / "bin"
            bin_dir.mkdir()
            install_fake(bin_dir, "curl", FAKE_CURL)
            (pathlib.Path(tmp) / "calls").write_text("0")
            (pathlib.Path(tmp) / "envelope.json").write_text(json.dumps({
                "status": {"state": "failure", "description": "d"},
                "review": {"findings": [{"description": MODEL_CANARY}]},
            }))

            result = run_step(localize(script, tmp), tmp, bin_dir, extra_env=W2_ENV)

            self.assertNotEqual(result.returncode, 0, "an HTTP 500 from W2 must fail the step")
            self.assertEqual((pathlib.Path(tmp) / "calls").read_text(), "1")
            self.assertIn("500", result.stderr, "the failure must still report the HTTP status")
            self.assert_no_canary(result.stdout + result.stderr)

    def test_w2_post_refuses_an_envelope_carrying_a_credential(self):
        script = extract_step_run("POST result to n8n W2 and resolve status")
        leaked = "sk-proj-" + "A1b2C3d4" * 4
        for why, text in {"key format": leaked, "its own secret": W2_ENV["N8N_HMAC_SECRET"]}.items():
            with self.subTest(why=why), tempfile.TemporaryDirectory() as tmp:
                bin_dir = pathlib.Path(tmp) / "bin"
                bin_dir.mkdir()
                install_fake(bin_dir, "curl", FAKE_CURL)
                install_fake(bin_dir, "gh", RECORDING_GH)
                (pathlib.Path(tmp) / "calls").write_text("0")
                (pathlib.Path(tmp) / "envelope.json").write_text(json.dumps({
                    "status": {"state": "success", "description": "d"},
                    "review": {"findings": [{"description": "x " + text}]},
                }))
                result = run_step(localize(script, tmp), tmp, bin_dir, extra_env=W2_ENV)
                self.assertNotEqual(result.returncode, 0, "the envelope was not refused")
                self.assertEqual((pathlib.Path(tmp) / "calls").read_text(), "0", "curl ran")
                self.assertNotIn(text, result.stdout + result.stderr, "the matched value was printed")
                posted = (pathlib.Path(tmp) / "gh-calls").read_text()
                self.assertIn("state=failure", posted, "no specific failure status was posted")
                self.assertIn("credential pattern", posted)

    def test_bounded_reviewer_refuses_to_run_without_hardening_arguments(self):
        script = extract_step_run("Run reviewer (codex exec, converge across runs)")
        with tempfile.TemporaryDirectory() as tmp:
            workspace = pathlib.Path(tmp) / "ws"
            (workspace / ".github" / "codex").mkdir(parents=True)
            (workspace / "scripts").symlink_to(REPO_ROOT / "scripts")
            (workspace / ".github/codex/codex-exec-args.txt").write_text("# nothing left\n")
            bin_dir = pathlib.Path(tmp) / "bin"
            bin_dir.mkdir()
            install_fake(bin_dir, "codex", FAKE_CODEX)
            (pathlib.Path(tmp) / "calls").write_text("0")
            (pathlib.Path(tmp) / "prompt.md").write_text("p")
            # The locked catalog is present, so only the hardening-argument guard can stop the step
            # (without it, the catalog check passes and codex runs).
            write_locked_catalog(tmp)
            result = run_step(localize(script, tmp), tmp, bin_dir,
                              extra_env={"GITHUB_WORKSPACE": str(workspace), "RUNNER_TEMP": str(tmp)})
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("hardening arguments are missing", result.stdout + result.stderr)
            self.assertEqual((pathlib.Path(tmp) / "calls").read_text(), "0", "codex ran without its hardening")

    # A hung model call (the reviewer is still offered request_user_input) must not hold the job
    # to its 90-minute cap: each bounded call has the same per-call ceiling as the chunked path.
    def test_every_bounded_codex_call_has_a_timeout(self):
        script = extract_step_run("Run reviewer (codex exec, converge across runs)")
        calls = re.findall(r'"\$QUIET"[^\n]*', script)
        self.assertEqual(len(calls), 2, "expected the first call and its retry")
        for call in calls:
            with self.subTest(call=call):
                self.assertRegex(call, r'"\$QUIET" --timeout \d+ -- codex exec')


class PathClassifierTest(unittest.TestCase):
    """scripts/codex-review-path-classifier.sh against a real repository (2026-10-02): a name git
    quotes (tab, newline, `"`, `\\`) must never reach a reviewer. Since the merge with develop
    (2026-10-09, approved by Traci) the classifier fails closed on such a name: exit 3, no route
    written, as scripts/tests/codex-review-path-classifier-test.sh also pins."""

    def classify(self, names, moves=(), expect_exit=0):
        """`names` are added at head. Each (old, new) in `moves` is committed at base, then renamed
        at head with one line appended, so git still pairs the two as a rename. With expect_exit=3
        the classifier must fail closed: that exit status and no route written (returns None)."""
        with tempfile.TemporaryDirectory() as tmp:
            repo = pathlib.Path(tmp) / "repo"
            repo.mkdir()
            git = ["git", "-C", str(repo), "-c", "user.email=t@t", "-c", "user.name=t"]
            subprocess.run(git + ["init", "-q"], check=True)
            (repo / "README").write_text("base\n")
            for old, _new in moves:
                path = repo / old
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("".join("row %d\n" % i for i in range(20)))
            subprocess.run(git + ["add", "-A"], check=True)
            subprocess.run(git + ["commit", "-qm", "base"], check=True)
            base = subprocess.run(git + ["rev-parse", "HEAD"], check=True, capture_output=True, text=True).stdout.strip()
            for old, new in moves:
                (repo / new).parent.mkdir(parents=True, exist_ok=True)
                subprocess.run(git + ["mv", old, new], check=True)
                with (repo / new).open("a") as handle:
                    handle.write("edited\n")
            for name in names:
                path = repo / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("x\n")
            subprocess.run(git + ["add", "-A"], check=True)
            subprocess.run(git + ["commit", "-qm", "head"], check=True)
            head = subprocess.run(git + ["rev-parse", "HEAD"], check=True, capture_output=True, text=True).stdout.strip()
            output = pathlib.Path(tmp) / "out"
            output.write_text("")
            env = dict(os.environ, GITHUB_OUTPUT=str(output), CODEX_COMPLIANCE_PATHS="block")
            result = subprocess.run(
                [str(REPO_ROOT / "scripts/codex-review-path-classifier.sh"), base, head],
                cwd=repo, env=env, capture_output=True, text=True,
            )
            self.assertEqual(result.returncode, expect_exit, result.stderr)
            if expect_exit != 0:
                self.assertEqual(output.read_text(), "", "a route was written although the classifier failed")
                return None
            return dict(line.split("=", 1) for line in output.read_text().split())

    def test_ordinary_paths_go_to_codex(self):
        self.assertEqual(self.classify(["app/models/a.rb"])["reviewer_route"], "codex")

    def test_data_bearing_names_that_git_quotes_fail_closed(self):
        for name in ("db/data/a\tb.json", "dump\"x.sql", "back\\slash.csv", "db/data/a\nb.json", "notes\nx.sql"):
            with self.subTest(name=name):
                self.classify([name], expect_exit=3)

    def test_compliance_names_that_git_quotes_fail_closed(self):
        self.classify(["docs/legal/a\tb.md"], expect_exit=3)

    def test_renaming_a_data_bearing_file_out_is_still_blocked(self):
        # A rename's diff carries the old path and its rows, so the old name must be classified too.
        moved = self.classify([], moves=[("spec/fixtures/users.json", "lib/users.json")])
        self.assertEqual(moved["reviewer_route"], "blocked")

    def test_renaming_a_compliance_file_out_still_routes_to_claude_deep(self):
        moved = self.classify([], moves=[("docs/legal/policy.md", "docs/policy.md")])
        self.assertEqual(moved["reviewer_route"], "claude-deep")

    def test_an_uppercase_data_file_extension_is_still_blocked(self):
        # Excel and Windows exports are often named STUDENTS.CSV / Roster.XLSX; case must not
        # route a data file to the no-BAA model.
        for name in ("tmp/students.CSV", "Exports.XLSX", "dump/Patients.Sql"):
            self.assertEqual(self.classify([name])["reviewer_route"], "blocked", name)

    def test_an_uppercase_data_directory_is_still_blocked(self):
        self.assertEqual(self.classify(["spec/Fixtures/users.json"])["reviewer_route"], "blocked")


# Records every gh call (one line of arguments each) instead of reaching GitHub.
RECORDING_GH = r'''#!/usr/bin/env python3
import os, pathlib, sys
log = pathlib.Path(os.environ["FAKE_RECEIVED_DIR"]) / "gh-calls"
with log.open("a") as handle:
    handle.write(" ".join(sys.argv[1:]) + "\\n")
'''

# The status API as status-final sees it: no deep-pass status posted yet; writes are recorded.
STATUS_GH = r'''#!/usr/bin/env python3
import os, pathlib, sys
args = sys.argv[1:]
if any("/commits/" in a for a in args):
    print("[]")
else:
    with (pathlib.Path(os.environ["FAKE_RECEIVED_DIR"]) / "gh-calls").open("a") as handle:
        handle.write(" ".join(args) + "\\n")
'''

# The PR and compare APIs as the base_sha binding sees them; status writes are recorded.
COMPARE_GH = r'''#!/usr/bin/env python3
import os, pathlib, sys
args = sys.argv[1:]
joined = " ".join(args)
if "baseRefOid" in joined:
    print("c" * 40)
elif "/compare/" in joined and joined.count("c" * 40):
    print(os.environ["FAKE_TO_BASE"])
elif "/compare/" in joined:
    print(os.environ["FAKE_AHEAD_BY"])
else:
    with (pathlib.Path(os.environ["FAKE_RECEIVED_DIR"]) / "gh-calls").open("a") as handle:
        handle.write(joined + "\\n")
'''

# The W2 step's secrets, as the workflow passes them (env, never the script text).
W2_ENV = {"N8N_WEBHOOK_URL": "https://n8n.example.invalid/webhook/w2", "N8N_HMAC_SECRET": "hmac-test-secret-value"}


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


if __name__ == "__main__":
    unittest.main()
