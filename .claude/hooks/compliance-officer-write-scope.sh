#!/usr/bin/env bash
# compliance-officer-write-scope.sh
#
# PreToolUse write-scope guard for the LingoLinq `compliance-officer` agent.
# Wired into that agent via its `hooks:` frontmatter so it is scoped to that
# agent only and never affects normal editing in the main session.
#
# Why it exists: the compliance-officer is "read-mostly" (plan section 6). Unlike
# the read-only finders (privacy/infra/api/dependency-auditor, which get the
# stricter audit-readonly-guard.sh and NO write tools at all), the officer DOES
# draft artifacts: the compliance calendar, the Posture Report, the Accessibility
# ACR, the AI Governance Memo, register hygiene notes. It must be able to Write/Edit
# those, but ONLY in the compliance surfaces - never application code, never git
# state, never infrastructure. This hook is that backstop.
#
# Contract (Claude Code PreToolUse): reads a JSON event on stdin carrying
# `tool_name` and `tool_input`; emits an allow (exit 0, no output) or a structured
# deny. Pure stdlib Ruby (the repo already requires Ruby 3.4); no gems, no network.
#
# Read-only by construction: this script itself never writes anything.

exec ruby -rjson -e '
  raw = $stdin.read
  event = (JSON.parse(raw) rescue {})
  tool = event["tool_name"].to_s
  input = event["tool_input"] || {}

  def deny(reason)
    out = {
      "hookSpecificOutput" => {
        "hookEventName" => "PreToolUse",
        "permissionDecision" => "deny",
        "permissionDecisionReason" => reason
      }
    }
    puts JSON.generate(out)
    exit 0
  end

  proj = ENV["CLAUDE_PROJECT_DIR"].to_s
  proj = Dir.pwd if proj.empty?
  proj = File.expand_path(proj)

  # Directories the compliance-officer MAY write into (drafts + register-adjacent
  # ops artifacts). Everything else - app code, config/, lib/, db/, .claude/agents,
  # .claude/skills, .claude/hooks - is read-only to this agent.
  ALLOWED_WRITE_PREFIXES = [
    File.join(proj, "audit-reports"),
    File.join(proj, "docs", "legal"),
    "/tmp"
  ].freeze

  WRITE_TOOLS = %w[Edit Write NotebookEdit MultiEdit Update].freeze
  if WRITE_TOOLS.include?(tool)
    # Resolve the target path from whichever key the tool uses.
    path = (input["file_path"] || input["notebook_path"] || input["path"]).to_s
    if path.empty?
      deny("compliance-officer write blocked: no file_path on #{tool}.")
    end
    abs = File.expand_path(path, proj)
    ok = ALLOWED_WRITE_PREFIXES.any? { |p| abs == p || abs.start_with?(p + "/") }
    unless ok
      deny("compliance-officer is read-mostly: writes are allowed only under " \
           "audit-reports/ or docs/legal/ (drafts), not #{path}. The officer " \
           "drafts compliance artifacts and flags findings; it never edits " \
           "application code or closes findings. Record the issue as a register " \
           "note or a DRAFT artifact instead.")
    end
    exit 0
  end

  # Everything except Bash is read-only (Read/Grep/Glob and read MCP tools).
  exit 0 unless tool == "Bash"

  cmd = input["command"].to_s
  exit 0 if cmd.strip.empty?

  # The officer should not mutate via Bash at all (it drafts via the Write tool).
  # Block the well-known write/exec/network-push vectors. Defense-in-depth, not a
  # sandbox: errs toward blocking. Read-only analysis should use Read/Grep/Glob.
  c = cmd.gsub(/\s+/, " ").strip
  c = c.sub(/\A(env\s+)?((?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+)/, "")

  patterns = [
    [ %r{(^|[^0-9&>])>>?\s*(?!\s*(&\d|/dev/(null|stderr|stdout)))}, "output redirection writes a file" ],
    [ /\btee\b/,                               "tee writes files" ],
    [ /\bsed\b[^|]*\s-[a-z]*i/,                 "sed -i edits in place" ],
    [ /(?<![\w\/-])(python3?|node|nodejs|ruby|perl|php|deno|bun|Rscript|osascript|gawk|awk)\b[^|]*\s(-(?:[A-Za-z]*[ecrniEW])\b|--(?:eval|exec|require|inplace|in-place|command)\b)/, "interpreter eval flag can write files" ],
    [ /(?<![\w\/-])(npx|bunx|pnpx|make|just|task|gulp|grunt|mvn|gradle|rake)\b/, "task runner / npx can run arbitrary writes" ],
    [ /\b(rm|mv|cp|mkdir|rmdir|touch|truncate|chmod|chown|ln)\b/, "filesystem mutation command" ],
    [ /\bgit\s+(?:-[^\s]+\s+)*(commit|push|merge|rebase|reset|checkout|switch|tag|am|apply|cherry-pick|stash|clean|rm|mv|add|restore|revert|worktree)\b/, "git state mutation" ],
    [ /\bgh\s+(?:pr|issue|release|repo|api|workflow|run)\b/, "gh can mutate GitHub state" ],
    [ /\b(npm|pnpm|yarn|bundle|gem|pip|pip3|brew|apt|apt-get|cargo)\s+(i|install|add|update|upgrade|remove|uninstall|publish)\b/, "package mutation" ],
    [ /\b(gcloud|aws|render|kubectl|docker|terraform)\b[^|]*\b(delete|rm|destroy|create|apply|deploy|update|put|set|stop|start|restart|scale|exec)\b/, "cloud/infra mutation" ],
    [ /\bcurl\b[^|]*\s(-X\s*(POST|PUT|PATCH|DELETE)|--data|-d\b|--upload-file|-T\b)/, "curl write/upload request" ],
  ]

  patterns.each do |re, why|
    if c =~ re
      deny("compliance-officer Bash blocked (#{why}). The officer is read-mostly " \
           "and drafts via the Write tool into audit-reports/ or docs/legal/, not " \
           "via shell. Command: #{cmd[0, 160]}")
    end
  end

  exit 0
'
