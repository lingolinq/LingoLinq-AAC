#!/usr/bin/env bash
# audit-run-logger.sh
#
# PostToolUse evidence logger for the LingoLinq read-only audit finder agents
# (privacy-auditor, infra-auditor, api-auditor, dependency-auditor,
#  accessibility-auditor, code-hygiene-auditor). Wired into
# each finder via its `hooks:` frontmatter (alongside the read-only guard), with
# the agent name passed as $1. Phase 4 "Cadence" deliverable.
#
# Why it exists: a recurring audit needs a tamper-evident record of WHAT each
# finder actually examined, so a run is reconstructable and recurrence is a diff
# over time. This writes ONE JSONL line per examined path/command to a LOCAL,
# deny-by-default log: audit-reports/run-log/examined-<runSha8>.jsonl.
#
# Privacy posture (hard rules, mirroring the guard's fail-closed stance):
#   * CODE / PATH evidence ONLY. It logs the tool name and the path/glob the
#     finder examined, plus a REDACTED+truncated Bash command. It NEVER reads the
#     tool RESULT, file contents, finding bodies, PII, or secret VALUES.
#   * Deny-by-default / omit-on-uncertainty: only an explicit allowlist of fields
#     is ever emitted; anything not understood is dropped, not logged raw.
#   * Fail-open for the RUN, fail-closed for DATA: any error logs a minimal
#     non-sensitive marker and the script ALWAYS exits 0, so it can never block,
#     deny, or corrupt a (already-executed) tool call.
#
# Pure stdlib Ruby (the repo requires Ruby 3.4); no gems, no network. The
# examined-*.jsonl detail files are gitignored (local telemetry); the per-run
# summary (audit-reports/run-log/runs.jsonl) is written by the /audit-run
# orchestrator, not here, and is safe to commit.

AGENT="${1:-unknown}"
export AUDIT_LOG_AGENT="$AGENT"

exec ruby -rjson -rtime -rfileutils -e '
  agent = ENV["AUDIT_LOG_AGENT"].to_s
  agent = "unknown" if agent.empty?

  # The script must never break a tool call: wrap everything and always exit 0.
  begin
    raw = $stdin.read
    event = (JSON.parse(raw) rescue {})
    tool  = event["tool_name"].to_s
    input = event["tool_input"] || {}

    # Only the read tools a finder uses are logged. Everything else is ignored
    # (no record), which also means we never touch Edit/Write events here.
    LOGGED = %w[Read Grep Glob Bash].freeze
    exit 0 unless LOGGED.include?(tool)

    # Audited SHA = current HEAD (the /audit-run runbook requires a clean tree, so
    # HEAD IS what was examined). Computed here so the hook is self-contained.
    sha  = (`git rev-parse HEAD 2>/dev/null`.strip rescue "")
    sha  = "unknown" if sha.empty?
    root = (`git rev-parse --show-toplevel 2>/dev/null`.strip rescue "")

    # Strip the repo root prefix so logged paths are repo-relative, never absolute
    # machine paths. Deny-by-default: anything still absolute after the strip, or
    # containing a parent-escape, is out-of-repo; record the FACT, not the name (a
    # path like /home/x/.aws/credentials is itself low-grade disclosure). Returns
    # nil only for a non-string/empty input.
    rel = lambda do |p|
      s = p.to_s
      return nil if s.empty?
      s = s.sub(/\A#{Regexp.escape(root)}\/?/, "") unless root.empty?
      return "<non-repo-path>" if s.start_with?("/") || s.include?("..")
      s.length > 300 ? s[0, 300] : s
    end

    # Bash is the one field that could carry a secret VALUE or PII: a finder may
    # `grep "<student name>" app/`, `psql --password=... `, or `curl ...?key=...`.
    # A shape-based redactor cannot reliably catch an arbitrary student/patient
    # NAME, so we do not try: we log ONLY the leading command-word run (the "verb",
    # e.g. "git log", "bundle list", "npm audit", "grep", "cat") and DROP every
    # operand - paths, search patterns, flags, values. Bare command words cannot be
    # a secret or PII. The Read/Grep/Glob TOOLS still record their path operands
    # above, so path evidence is not lost for the normal examination path.
    # (Hardens findings LL-b5c30235d3 and the Phase-4 review High.)
    cmd_verb = lambda do |cmd|
      verb = []
      cmd.to_s.strip.split(/\s+/).each do |t|
        break unless t.match?(/\A[A-Za-z][A-Za-z0-9_-]*\z/)
        verb << t
        break if verb.length >= 3
      end
      verb.empty? ? "<redacted-cmd>" : verb.join(" ")
    end

    rec = { "ts" => Time.now.utc.iso8601, "sha" => sha, "agent" => agent, "tool" => tool }

    case tool
    when "Read"
      p = rel.call(input["file_path"]); rec["path"] = p if p
    when "Grep"
      p = rel.call(input["path"]); rec["path"] = p if p
      # pattern deliberately NOT logged (deny-by-default: a search regex is not
      # path evidence and could echo a value).
    when "Glob"
      g = rel.call(input["pattern"]); rec["glob"] = g if g
      p = rel.call(input["path"]); rec["path"] = p if p
    when "Bash"
      rec["cmd"] = cmd_verb.call(input["command"])
    end

    dir  = File.join(root.empty? ? "." : root, "audit-reports", "run-log")
    FileUtils.mkdir_p(dir)
    file = File.join(dir, "examined-#{sha[0, 8]}.jsonl")
    File.open(file, "a") { |f| f.puts(JSON.generate(rec)) }
  rescue => e
    # Fail-closed for data: never echo the raw event on error; log only a marker.
    begin
      dir = File.join((`git rev-parse --show-toplevel 2>/dev/null`.strip rescue "."), "audit-reports", "run-log")
      FileUtils.mkdir_p(dir)
      File.open(File.join(dir, "logger-errors.jsonl"), "a") do |f|
        f.puts(JSON.generate({ "ts" => (Time.now.utc.iso8601 rescue ""), "agent" => agent, "error" => e.class.to_s }))
      end
    rescue
      # give up silently; never break the run
    end
  end
  exit 0
'
