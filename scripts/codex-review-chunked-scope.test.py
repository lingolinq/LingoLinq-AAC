#!/usr/bin/env python3
"""Red test for the CODEX_REVIEW_CHUNKED_SCOPE=scot branch-name match.

The matcher lives inline in `.github/workflows/codex-review.yml` because the
Resolve Codex review evidence mode step runs before checkout and cannot call a
repo script. This test extracts that `if` condition from the YAML and evaluates
it in bash, so a revert or a wrong glob fails here rather than only when the
dormant gate is revived.
"""
import json
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
diff_canary = os.environ["FAKE_DIFF_CANARY"]
path = "app/" + diff_canary + "_FILE.rb"
if args[:2] == ["diff", "--name-only"]:
    print(path)
elif args[:1] == ["diff"]:
    print("diff --git a/" + path + " b/" + path)
    print("+" + diff_canary)
elif args[:1] == ["ls-tree"]:
    print("100644 blob " + "c" * 40 + "\t" + path)
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


class WorkflowLogExposureTest(unittest.TestCase):
    def assert_no_canary(self, log):
        self.assertFalse(CANARY_STEM in log, "PR content or model output reached the job log")

    def bounded_step(self, tmp, mode):
        script = extract_step_run("Run reviewer (codex exec, converge across runs)")
        bin_dir = pathlib.Path(tmp) / "bin"
        bin_dir.mkdir()
        install_fake(bin_dir, "codex", FAKE_CODEX)
        (pathlib.Path(tmp) / "calls").write_text("0")
        (pathlib.Path(tmp) / "prompt.md").write_text(
            f"### gh pr view\n{{\"body\": \"{BODY_CANARY}\"}}\n+{DIFF_CANARY}\n"
        )
        (pathlib.Path(tmp) / "pr_diff.txt").write_text(f"+{DIFF_CANARY}\n")
        return run_step(localize(script, tmp), tmp, bin_dir, mode)

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

    def test_bounded_reviewer_failure_is_labelled_not_echoed(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = self.bounded_step(tmp, "fail")

            self.assertNotEqual(result.returncode, 0, "a failed codex call must fail the step")
            self.assertEqual((pathlib.Path(tmp) / "calls").read_text(), "1")
            self.assertIn("model call failed: exit=1 label=", result.stderr)
            self.assert_no_canary(result.stdout + result.stderr)

    def collection_step(self, tmp, step_name):
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

    def test_every_helper_the_workflow_runs_is_restored_from_the_workflow_ref(self):
        restore = extract_step_run("Restore Codex review helpers from workflow ref")
        restored = set(re.findall(r"scripts/(codex-review-[\w.-]+)", restore))
        referenced = set(re.findall(r"(codex-review-[\w-]+\.(?:py|sh))\b", WORKFLOW.read_text()))
        for name in sorted(restored):
            referenced |= set(re.findall(r"(codex-review-[\w-]+\.(?:py|sh))\b", (REPO_ROOT / "scripts" / name).read_text()))
        referenced = {name for name in referenced if (REPO_ROOT / "scripts" / name).exists()}
        self.assertIn("codex-review-run-chunks.py", restored, "restore list not found")
        self.assertEqual(referenced - restored, set(), "a helper the workflow runs is missing from the restore list")

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
        # Each invocation's arguments run from `codex exec` to its output flag.
        calls = [segment.split("--output-last-message")[0] for segment in script.split("codex exec")[1:]]
        self.assertEqual(len(calls), 2, "expected the first call and the retry")
        for n, call in enumerate(calls, 1):
            with self.subTest(call=n):
                self.assertIn("--ephemeral", call)

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

            result = run_step(localize(script, tmp), tmp, bin_dir)

            self.assertNotEqual(result.returncode, 0, "an HTTP 500 from W2 must fail the step")
            self.assertEqual((pathlib.Path(tmp) / "calls").read_text(), "1")
            self.assertIn("500", result.stderr, "the failure must still report the HTTP status")
            self.assert_no_canary(result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
