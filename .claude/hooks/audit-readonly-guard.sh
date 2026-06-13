#!/usr/bin/env bash
# audit-readonly-guard.sh
#
# PreToolUse write-blocker for the LingoLinq read-only audit finder agents
# (privacy-auditor, infra-auditor, api-auditor, dependency-auditor). Wired into
# each finder via its `hooks:` frontmatter so it is scoped to those agents only
# and never affects normal editing in the main session.
#
# Why it exists: the finders use a `tools: Read, Grep, Glob, Bash` allowlist, which
# already removes Edit/Write/NotebookEdit. But Bash can STILL mutate the repo or
# infrastructure (`>`, `sed -i`, `rm`, `git commit`, `gh pr merge`, `gcloud ... delete`,
# package installs, db migrations). This hook is the real backstop for that residual
# path: it denies any obviously-mutating Bash command and denies the write tools
# outright (defense-in-depth in case a finder's allowlist is ever widened).
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

  # 1. Hard-block any file-mutating tool. Finders should not have these in their
  #    allowlist at all; this is belt-and-suspenders if that ever changes.
  WRITE_TOOLS = %w[Edit Write NotebookEdit MultiEdit Update].freeze
  if WRITE_TOOLS.include?(tool)
    deny("Audit finders are read-only: #{tool} is blocked. Report the issue as a finding instead of fixing it.")
  end

  # 2. Everything except Bash is read-only (Read/Grep/Glob and read MCP tools).
  exit 0 unless tool == "Bash"

  cmd = input["command"].to_s
  exit 0 if cmd.strip.empty?

  # Normalize for matching: collapse whitespace, keep original for the reason text.
  c = cmd.gsub(/\s+/, " ").strip

  # --- Mutating Bash patterns (deny) ---------------------------------------
  patterns = [
    # File output redirection to a real path (allow >/dev/null, >&2, 2>&1, &>/dev/null)
    [ %r{(^|[^0-9&>])>>?\s*(?!\s*(&\d|/dev/(null|stderr|stdout)))}, "output redirection writes a file" ],
    [ /\btee\b/,                                "tee writes files" ],
    [ /\bsed\b[^|]*\s-[a-z]*i/,                 "sed -i edits in place" ],
    [ /\bperl\b[^|]*\s-[a-z]*i/,                "perl -i edits in place" ],
    # Negative lookbehind for [\w-] so command flags like `docker run --rm` or
    # `--install` are not mistaken for the `rm`/`install` commands themselves.
    [ /(?<![\w-])(rm|rmdir|unlink|shred|truncate|dd)\b/,"file deletion/truncation" ],
    [ /(?<![\w-])(mv|cp|install|ln)\b/,         "moves/copies/links write the target" ],
    [ /(?<![\w-])(mkdir|touch|mktemp)\b/,       "creates files/directories" ],
    [ /(?<![\w-])(chmod|chown|chgrp|chflags)\b/,"changes file permissions/ownership" ],
    # git: mutating subcommands only (read subcommands like log/show/diff/status/grep/ls-files stay allowed)
    [ /\bgit\s+(add|commit|push|reset|checkout|restore|switch|rm|mv|merge|rebase|cherry-pick|clean|stash|revert|apply|am|tag|branch|fetch|pull|remote|config|init|worktree|gc|prune|filter-branch|update-ref|notes)\b/, "mutating git subcommand" ],
    # gh: mutating subcommands and non-GET api calls
    [ /\bgh\s+(pr|issue|release|repo|gist|secret|workflow|run|label|api)\b.*\b(create|merge|close|edit|comment|delete|review|reopen|lock|unlock|rerun|cancel|dispatch|sync|set|add|remove)\b/, "mutating gh command" ],
    [ /\bgh\s+api\b[^|]*-X\s*(POST|PUT|PATCH|DELETE)/i, "gh api non-GET write" ],
    [ /\bgh\s+api\b[^|]*(-f|--field|--input)\b/,        "gh api with a write body" ],
    # package / dependency installs
    [ /\b(npm|pnpm|yarn|bun)\s+(i|install|add|ci|update|upgrade|remove|uninstall|link)\b/, "package install/modify" ],
    [ /\b(bundle\s+(install|update|add|remove)|gem\s+(install|update|uninstall))\b/, "ruby gem install/modify" ],
    [ /\b(pip|pip3)\s+(install|uninstall)\b/, "pip install/modify" ],
    [ /\b(apt|apt-get|brew|yum|dnf|apk)\s+(install|remove|upgrade|update|add)\b/, "system package change" ],
    # Rails/rake mutations (migrations, generators, db tasks, seeds)
    [ /\b(rails|rake|bin\/rails|bin\/rake|bundle\s+exec\s+(rails|rake))\b[^|]*\b(db:|generate|g\b|destroy|d\b|runner|console|c\b|dbconsole)/, "rails/rake mutation or live console" ],
    # Cloud CLIs: deny anything that is not clearly a read verb
    # NOTE: "run"/"exec" are intentionally excluded as verbs here ("gcloud run",
    # "docker run" are product/service names, not mutations). Real infra writes
    # below; raw SQL and redirect writes are caught by their own patterns.
    [ /\b(gcloud|aws|render|kubectl|terraform|docker|psql)\b.*\b(create|delete|update|deploy|apply|destroy|put|set-|add-|remove|patch|drop|insert|restart|scale|rollout|publish|terminate|enable|disable|grant|revoke)\b/, "cloud/infra mutation" ],
    # psql/sql writes
    [ /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE)\b/i, "SQL write statement" ],
    # curl/wget with write methods or saving to disk
    [ /\bcurl\b[^|]*-X\s*(POST|PUT|PATCH|DELETE)/i, "curl non-GET request" ],
    [ /\b(curl|wget)\b[^|]*\s(-o|-O|--output|--output-document)\b/, "downloads to disk" ],
    [ /\bwget\b/, "wget writes files by default" ]
  ]

  patterns.each do |re, why|
    if c.match?(re)
      deny("Audit finders are read-only; this Bash command was blocked (#{why}). Record what you found as a finding rather than acting on it. Command: #{cmd[0, 200]}")
    end
  end

  # Default: allow read-only Bash (cat, ls, find, grep, ruby read scripts, git log/show/diff, gh pr view, etc.)
  exit 0
'
