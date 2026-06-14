#!/usr/bin/env bash
# audit-run-logger.sh
#
# PostToolUse evidence logger for the LingoLinq read-only audit finder agents
# (privacy-auditor, infra-auditor, api-auditor, dependency-auditor). Wired into
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
    # machine paths. Returns nil for anything that is not a string path.
    rel = lambda do |p|
      s = p.to_s
      return nil if s.empty?
      s = s.sub(/\A#{Regexp.escape(root)}\/?/, "") unless root.empty?
      # Allowlist shape: a plausible repo path/glob. Drop anything weird.
      s.length > 300 ? s[0, 300] : s
    end

    # Redact secret/PII-shaped substrings from a Bash command, then truncate. This
    # is the "shape not values" discipline (finding LL-b5c30235d3) applied to the
    # one logged field that could carry a value. Conservative: over-redacts.
    redact = lambda do |cmd|
      c = cmd.to_s.gsub(/\s+/, " ").strip
      return "" if c.empty?
      # token prefixes (api keys), JWT-ish, long hex/base64 blobs, emails, and the
      # value side of KEY=VALUE / --password X / -p X.
      c = c.gsub(/\b(ghp|gho|ghs|ghu|ghr|rnd|pplx|sk|xoxb|xoxp|AKIA|eyJ)[-_A-Za-z0-9]{6,}/, "<redacted>")
      c = c.gsub(/\b[0-9a-fA-F]{32,}\b/, "<redacted>")
      c = c.gsub(%r{\b[A-Za-z0-9+/]{40,}={0,2}\b}, "<redacted>")
      c = c.gsub(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/, "<redacted-email>")
      c = c.gsub(/([A-Z][A-Z0-9_]{3,}=)\S+/, "\\1<redacted>")
      c = c.gsub(/(--?(?:password|pass|pwd|token|secret|key|api[-_]?key)\s+)\S+/i, "\\1<redacted>")
      c.length > 200 ? c[0, 200] + "..." : c
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
      rec["cmd"] = redact.call(input["command"])
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
