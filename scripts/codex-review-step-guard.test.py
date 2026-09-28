#!/usr/bin/env python3
"""Tests for scripts/codex-review-step-guard.py and the workflow wiring that
depends on it (the codex-review.yml hardening of 2026-09-28).

Stdlib-only (unittest). The process tests need Linux /proc.
"""
import importlib.util
import os
import pathlib
import re
import subprocess
import sys
import tempfile
import time
import unittest

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
GUARD_PATH = REPO_ROOT / "scripts/codex-review-step-guard.py"
WORKFLOW = REPO_ROOT / ".github/workflows/codex-review.yml"

spec = importlib.util.spec_from_file_location("codex_review_step_guard", GUARD_PATH)
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)

ENABLED = {guard.ENABLE_VAR: "1"}

# Steps that run third-party code (npm, the Codex CLI, a model's tool calls)
# over PR content. Each must be wrapped by the guard.
GUARDED_STEPS = (
    "Install Codex CLI",
    "Authenticate Codex CLI",
    "Run reviewer (codex exec, converge across runs)",
    "Run reviewer (codex exec, chunked evidence)",
    "Run reviewer (Claude Sonnet 4.6 API, Tier 2 claude-deep route)",
)


def alive(pid):
    stat = guard.read_stat(pid)
    return stat is not None and stat[0] != "Z"


def wait_for_pidfile(path, timeout=5.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        text = path.read_text().strip() if path.exists() else ""
        if text:
            return int(text)
        time.sleep(0.02)
    raise AssertionError(f"{path} was never written")


def now_ticks():
    """A mark taken now: the start time of a process spawned for the purpose.
    Using the test process's own start time would also select unrelated
    processes started while the suite runs (a `| tail` in the same pipeline)."""
    marker = subprocess.Popen(["sleep", "5"])
    try:
        return guard.read_stat(marker.pid)[2]
    finally:
        marker.kill()
        marker.wait()


def step_block(step_name):
    """Every line of the step whose `- name:` starts with step_name."""
    lines = WORKFLOW.read_text().splitlines()
    start = next(i for i, line in enumerate(lines) if line.strip().startswith(f"- name: {step_name}"))
    end = next((i for i in range(start + 1, len(lines)) if lines[i].strip().startswith("- name:")), len(lines))
    return "\n".join(lines[start:end])


class ProcessReapTest(unittest.TestCase):
    def spawn_escaped_sleeper(self, tmp):
        """Start a `sleep` that detaches the way a hostile tool call would:
        a new session plus a double fork, so it is no longer our child."""
        pidfile = pathlib.Path(tmp) / "pid"
        subprocess.run(
            ["bash", "-c", f'setsid bash -c \'sleep 300 & echo $! > "{pidfile}"\' &'],
            check=True,
        )
        return wait_for_pidfile(pidfile)

    def test_reap_kills_a_process_that_escaped_with_setsid_and_double_fork(self):
        with tempfile.TemporaryDirectory() as tmp:
            since = now_ticks()
            time.sleep(0.05)
            pid = self.spawn_escaped_sleeper(tmp)
            self.assertTrue(alive(pid))
            self.assertNotEqual(guard.read_stat(pid)[1], os.getpid(), "sleeper is still our child")

            killed = guard.reap(since, environ=ENABLED)

            self.assertGreaterEqual(killed, 1)
            deadline = time.time() + 2
            while alive(pid) and time.time() < deadline:
                time.sleep(0.02)
            self.assertFalse(alive(pid), "escaped background process survived the reap")
            self.assertTrue(alive(os.getpid()), "the reaper killed its own ancestor")

    def test_reap_leaves_processes_that_started_before_the_mark(self):
        with tempfile.TemporaryDirectory() as tmp:
            older = subprocess.Popen(["sleep", "300"])
            try:
                time.sleep(0.05)
                since = guard.read_stat(older.pid)[2] + 1
                time.sleep(0.05)
                newer = self.spawn_escaped_sleeper(tmp)

                guard.reap(since, environ=ENABLED)

                self.assertTrue(alive(older.pid), "a process from before the step was killed")
                deadline = time.time() + 2
                while alive(newer) and time.time() < deadline:
                    time.sleep(0.02)
                self.assertFalse(alive(newer))
            finally:
                older.kill()
                older.wait()

    def test_reap_is_a_no_op_unless_armed(self):
        with tempfile.TemporaryDirectory() as tmp:
            since = now_ticks()
            pid = self.spawn_escaped_sleeper(tmp)
            try:
                self.assertEqual(guard.reap(since, environ={}), 0)
                self.assertTrue(alive(pid), "an unarmed guard killed a process")
            finally:
                os.kill(pid, 9)

    def test_mark_prints_the_calling_shells_start_time(self):
        # Called directly (not inside $(...)), the guard's parent is the shell.
        result = subprocess.run(
            ["bash", "-c", f"{sys.executable} -I {GUARD_PATH} mark; cat /proc/$$/stat"],
            capture_output=True, text=True, check=True,
        )
        printed, stat = result.stdout.split("\n", 1)
        shell_start = stat[stat.rfind(")") + 2:].split()[19]
        self.assertEqual(printed.strip(), shell_start)


class FileCommandResetTest(unittest.TestCase):
    def test_reset_empties_runner_file_commands_and_nothing_else(self):
        with tempfile.TemporaryDirectory() as tmp:
            commands = pathlib.Path(tmp) / guard.FILE_COMMANDS_DIR
            commands.mkdir()
            env_file = commands / "set_env_1234"
            path_file = commands / "add_path_1234"
            env_file.write_text("BASH_ENV=/tmp/evil\nLD_PRELOAD=/tmp/evil.so\n")
            path_file.write_text("/tmp/evil-bin\n")
            unrelated = pathlib.Path(tmp) / "envelope.json"
            unrelated.write_text("{}")
            environ = dict(ENABLED, A=str(env_file), B=str(path_file), C=str(unrelated), D="not a path")

            cleared = guard.reset_file_commands(environ=environ)

            self.assertEqual(sorted(cleared), sorted([env_file, path_file]))
            self.assertEqual(env_file.read_text(), "")
            self.assertEqual(path_file.read_text(), "")
            self.assertEqual(unrelated.read_text(), "{}")

    def test_reset_is_a_no_op_unless_armed(self):
        with tempfile.TemporaryDirectory() as tmp:
            commands = pathlib.Path(tmp) / guard.FILE_COMMANDS_DIR
            commands.mkdir()
            env_file = commands / "set_env_1234"
            env_file.write_text("X=1\n")
            self.assertEqual(guard.reset_file_commands(environ={"A": str(env_file)}), [])
            self.assertEqual(env_file.read_text(), "X=1\n")


class WorkflowHardeningTest(unittest.TestCase):
    def test_pr_head_is_checked_out_into_a_subdirectory_without_credentials(self):
        block = step_block("Checkout PR head")
        self.assertRegex(block, r"\n\s+path: pr\n")
        self.assertRegex(block, r"\n\s+persist-credentials: false\n")
        self.assertRegex(block, r"uses: actions/checkout@[0-9a-f]{40}\b", "checkout must be pinned to a commit")

    def test_workflow_is_armed_and_every_risky_step_is_guarded(self):
        self.assertRegex(WORKFLOW.read_text(), r'\n\s+CODEX_REVIEW_STEP_GUARD: "1"\n')
        for name in GUARDED_STEPS:
            with self.subTest(step=name):
                block = step_block(name)
                self.assertRegex(block, r'GUARD_SINCE="\$\(python3 -I (?:scripts/codex-review-step-guard\.py|"\$STEP_GUARD") mark\)"')
                self.assertRegex(block, r"trap '[^']*finish \"\$GUARD_SINCE\"[^']*' EXIT")

    def test_chunked_step_cleans_up_before_its_own_env_writes(self):
        block = step_block("Run reviewer (codex exec, chunked evidence)")
        cleanup = block.index('codex-review-step-guard.py finish "$GUARD_SINCE"\n')
        write = block.index('>> "$GITHUB_ENV"')
        self.assertLess(block.index("trap - EXIT"), cleanup)
        self.assertLess(cleanup, write, "the reviewer's leftovers must be cleared BEFORE the step writes its own values")

    def test_no_codex_key_file_outlives_its_step(self):
        text = WORKFLOW.read_text()
        self.assertNotRegex(text, r"CODEX_HOME:\s*\$\{\{\s*runner\.temp", "a shared CODEX_HOME persists across steps")
        auth = step_block("Authenticate Codex CLI")
        self.assertIn('CODEX_HOME="$(mktemp -d)"', auth)
        self.assertRegex(auth, r"trap '[^']*rm -rf \"\$CODEX_HOME\"[^']*' EXIT")
        for name in GUARDED_STEPS[2:4]:
            with self.subTest(step=name):
                block = step_block(name)
                self.assertIn("CODEX_API_KEY: ${{ secrets.CODEX_OPENAI_API_KEY }}", block)
                self.assertNotIn("codex login", block)
                self.assertRegex(block, r"rm -rf \"\$CODEX_HOME\"")

    def test_every_python_helper_runs_isolated(self):
        sources = {WORKFLOW.name: WORKFLOW.read_text()}
        for helper in sorted((REPO_ROOT / "scripts").glob("codex-review-*.sh")):
            sources[helper.name] = helper.read_text()
        for name, text in sources.items():
            for lineno, line in enumerate(text.splitlines(), 1):
                code = line.split("#", 1)[0] if line.lstrip().startswith("#") else line
                for match in re.finditer(r"\bpython3\b(?!\s+-I\b)", code):
                    with self.subTest(file=name, line=lineno):
                        self.fail(f"python3 without -I: {line.strip()}")

    def test_secrets_are_never_expanded_into_a_run_script(self):
        lines = WORKFLOW.read_text().splitlines()
        in_run, indent = False, 0
        for lineno, line in enumerate(lines, 1):
            stripped = line.strip()
            if re.match(r"\s*run:", line):
                in_run, indent = True, len(line) - len(line.lstrip())
                if "secrets." in line:
                    self.fail(f"line {lineno}: secret in a run line")
                continue
            if in_run and stripped and len(line) - len(line.lstrip()) <= indent:
                in_run = False
            if in_run and "${{ secrets." in line:
                self.fail(f"line {lineno}: secret expanded inside a run script: {stripped}")


if __name__ == "__main__":
    unittest.main()
