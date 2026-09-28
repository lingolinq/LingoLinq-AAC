#!/usr/bin/env python3
"""Stop a codex-review.yml step from leaving anything behind for later steps.

The reviewer steps run third-party code (the Codex CLI and the model's own
tool calls) over untrusted PR content. Anything such a step leaves running, or
writes to the runner's per-step file commands, outlives the step:

* A background process keeps running after the step's shell exits (the hosted
  runner only cleans up orphans when the JOB ends). It can then read the
  environment of later steps through /proc, which is how the W2 HMAC secret and
  webhook URL would leak.
* A line appended to the step's environment or path file command is applied to
  EVERY later step (BASH_ENV, LD_PRELOAD, NODE_OPTIONS, a PATH entry shadowing
  `gh` or `curl`, ...).

Usage, from a guarded step (run with `python3 -I`, like every helper):

    GUARD_SINCE="$(python3 -I scripts/codex-review-step-guard.py mark)"
    trap 'python3 -I scripts/codex-review-step-guard.py finish "$GUARD_SINCE"' EXIT

`mark`   prints the start time (clock ticks since boot) of the calling shell.
`reap SINCE`
         SIGKILLs every process owned by this uid that started at or after SINCE,
         except this process's own ancestors and the Actions runner itself.
         Start time, not parentage, is the selector, so a process that escaped
         with setsid or a double fork is still found.
`reset-file-commands`
         Empties every runner file-command file this step was given (the
         environment, path, output, state and summary files), whatever an
         earlier command in the step appended to them. Files are found by their
         location in the runner's file-command directory, not by name, so a new
         kind of file command is covered without a change here.
`finish SINCE`
         `reap SINCE` then `reset-file-commands`.

Nothing is done unless CODEX_REVIEW_STEP_GUARD=1 (set job-wide in
codex-review.yml), so running a workflow step's shell locally or from a unit
test never kills unrelated processes. `mark` works either way.

Limits (also stated in .github/codex/README.md): code that gains root (hosted
runners allow passwordless sudo) can escape any same-uid control. This helper
closes the unprivileged channels; the Codex read-only sandbox and never
executing PR code remain the primary boundary.
"""
import os
import pathlib
import signal
import sys
import time

ENABLE_VAR = "CODEX_REVIEW_STEP_GUARD"
RUNNER_PROCESS_NAMES = ("Runner.Worker", "Runner.Listener")
FILE_COMMANDS_DIR = "_runner_file_commands"
MAX_ROUNDS = 20


def enabled(environ=None):
    return (environ if environ is not None else os.environ).get(ENABLE_VAR) == "1"


def read_stat(pid):
    """Return (state, ppid, starttime) for pid, or None if it is gone."""
    try:
        raw = pathlib.Path(f"/proc/{pid}/stat").read_text()
    except OSError:
        return None
    # comm (field 2) may contain spaces and parentheses; fields after the LAST
    # ')' are fixed. Field 3 is state, 4 is ppid, 22 is starttime.
    fields = raw[raw.rfind(")") + 2:].split()
    return fields[0], int(fields[1]), int(fields[19])


def read_uid(pid):
    try:
        for line in pathlib.Path(f"/proc/{pid}/status").read_text().splitlines():
            if line.startswith("Uid:"):
                return int(line.split()[1])
    except OSError:
        return None
    return None


def read_comm(pid):
    try:
        return pathlib.Path(f"/proc/{pid}/comm").read_text().strip()
    except OSError:
        return ""


def read_exe(pid):
    try:
        return os.readlink(f"/proc/{pid}/exe")
    except OSError:
        return ""


def ancestors(pid):
    """pid and every ancestor up to (not including) pid 0."""
    chain = []
    while pid > 0 and pid not in chain:
        chain.append(pid)
        stat = read_stat(pid)
        if stat is None:
            break
        pid = stat[1]
    return chain


def runner_root(chain):
    """Install directory of the Actions runner, found through our own ancestry."""
    for pid in chain:
        if read_comm(pid) in RUNNER_PROCESS_NAMES:
            exe = read_exe(pid)
            if exe:
                # <root>/bin/Runner.Worker -> <root>
                return str(pathlib.Path(exe).parent.parent)
    return None


def all_pids():
    return [int(name) for name in os.listdir("/proc") if name.isdigit()]


def candidates(since, *, protected, uid, root):
    found = []
    for pid in all_pids():
        if pid in protected:
            continue
        stat = read_stat(pid)
        if stat is None:
            continue
        state, _ppid, start = stat
        if state == "Z" or start < since or read_uid(pid) != uid:
            continue
        if root and read_exe(pid).startswith(root + os.sep):
            continue
        found.append(pid)
    return found


def reap(since, *, environ=None):
    """Kill stray processes; return how many were signalled."""
    if not enabled(environ):
        return 0
    protected = set(ancestors(os.getpid()))
    root = runner_root(ancestors(os.getpid()))
    uid = os.getuid()
    killed = set()
    for _ in range(MAX_ROUNDS):
        victims = candidates(since, protected=protected, uid=uid, root=root)
        if not victims:
            break
        for pid in victims:
            try:
                os.kill(pid, signal.SIGKILL)
                killed.add(pid)
            except OSError:
                pass
        time.sleep(0.1)
    else:
        raise RuntimeError("step guard: processes kept appearing after repeated kills")
    return len(killed)


def file_command_paths(environ=None):
    environ = environ if environ is not None else os.environ
    paths = set()
    for value in environ.values():
        path = pathlib.Path(value)
        if path.parent.name == FILE_COMMANDS_DIR and path.is_file():
            paths.add(path)
    return sorted(paths)


def reset_file_commands(*, environ=None):
    if not enabled(environ):
        return []
    paths = file_command_paths(environ)
    for path in paths:
        path.write_bytes(b"")
    return paths


def main(argv):
    if not argv:
        print(__doc__, file=sys.stderr)
        return 2
    command, rest = argv[0], argv[1:]
    if command == "mark":
        stat = read_stat(os.getppid())
        if stat is None:
            print("step guard: cannot read the calling shell's start time", file=sys.stderr)
            return 1
        print(stat[2])
        return 0
    if command in ("reap", "finish"):
        if len(rest) != 1 or not rest[0].isdigit():
            print(f"step guard: {command} needs the value printed by `mark`", file=sys.stderr)
            return 2
        count = reap(int(rest[0]))
        if count:
            print(f"step guard: killed {count} process(es) left running by this step", file=sys.stderr)
        if command == "reap":
            return 0
    if command in ("reset-file-commands", "finish"):
        cleared = reset_file_commands()
        if cleared:
            print(f"step guard: cleared {len(cleared)} file-command file(s)", file=sys.stderr)
        return 0
    print(f"step guard: unknown command {command!r}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
