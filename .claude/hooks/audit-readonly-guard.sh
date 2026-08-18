#!/usr/bin/env bash
# audit-readonly-guard.sh
#
# PreToolUse write-blocker for the LingoLinq read-only audit finder agents
# (privacy-auditor, infra-auditor, api-auditor, dependency-auditor,
#  accessibility-auditor, code-hygiene-auditor). Wired into each finder via its
# `hooks:` frontmatter so it is scoped to those agents only and never affects
# normal editing in the main session.
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

  # Normalize for matching: collapse whitespace, then strip a leading environment / variable-
  # assignment prefix (`env FOO=1 ...`, `FOO=bar cmd`) so it cannot hide the real command from
  # the patterns below. Keep the original `cmd` for the human-readable reason text.
  c = cmd.gsub(/\s+/, " ").strip
  c = c.sub(/\A(env\s+)?((?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+)/, "")

  # IMPORTANT (defense-in-depth, not a sandbox): a denylist over arbitrary Bash is inherently
  # leaky. The PRIMARY read-only guarantee for finders is the `tools: Read, Grep, Glob, Bash`
  # allowlist (no Edit/Write) plus the read-only agent instructions. This denylist closes the
  # well-known Bash write vectors and errs toward blocking. It deliberately over-blocks some
  # legitimate read-only commands (interpreter eval, raw `ruby -e` analysis): finders should use
  # Read/Grep/Glob for analysis, not shell interpreters.

  # --- Mutating Bash patterns (deny) ---------------------------------------
  # optional git/gh global options before the subcommand (Regexp literal: no shell-quote clash,
  # and \s keeps its regex meaning). Interpolated into the git/gh patterns below.
  git_pre = /(?:(?:-c\s+\S+|-C\s+\S+|--?[A-Za-z][\w-]*(?:=\S+)?)\s+)*/
  patterns = [
    # File output redirection to a real path (allow >/dev/null, >&2, 2>&1, &>/dev/null)
    [ %r{(^|[^0-9&>])>>?\s*(?!\s*(&\d|/dev/(null|stderr|stdout)))}, "output redirection writes a file" ],
    [ /\btee\b/,                                "tee writes files" ],
    [ /\bsed\b[^|]*\s-[a-z]*i/,                 "sed -i edits in place" ],
    # Interpreter eval / stdin / heredoc can write arbitrary files (the dominant bypass).
    # Blocks `python -c`, `ruby -e`, `node -e`, `perl -i/-e`, `php -r`, and `interp -`/heredoc.
    [ /(?<![\w\/-])(python3?|node|nodejs|ruby|perl|php|deno|bun|Rscript|osascript|gawk|awk)\b[^|]*\s(-(?:[A-Za-z]*[ecrniEW])\b|--(?:eval|exec|require|inplace|in-place|command)\b)/, "interpreter eval flag can write files" ],
    [ /(?<![\w\/-])(python3?|node|nodejs|ruby|perl|php|deno|bun|Rscript)\b[^|]*(\s-(?:\s|$)|<<)/, "interpreter stdin/heredoc can write files" ],
    [ /(?<![\w\/-])(npx|bunx|pnpx|make|just|task|gulp|grunt|mvn|gradle|rake)\b/, "task runner / npx can run arbitrary writes" ],
    [ /(?<![\w\/-])(deno|bun)\s+(eval|run|repl|install|add|task)\b/, "deno/bun eval/run can write files" ],
    # Pipe-to-shell / fetch-and-exec is the dominant remaining denylist bypass
    # (`curl ... | bash`, `base64 -d | sh`, `... | python`). Catch a pipe into any shell or
    # interpreter, plus `eval`/`source` and `sh -c`/`bash -c` which run an arbitrary string.
    [ /\|\s*(sudo\s+)?(sh|bash|zsh|dash|ksh|fish|python3?|node|nodejs|ruby|perl|php|deno|bun)\b/, "pipe into a shell/interpreter can execute fetched code" ],
    [ /(?<![\w-])(eval|source)\s/, "eval/source executes arbitrary code" ],
    [ /(?<![\w\/-])(sh|bash|zsh|dash|ksh)\s+-[a-z]*c\b/, "shell -c executes an arbitrary command string" ],
    # Negative lookbehind for [\w-] so command flags like `docker run --rm` or
    # `--install` are not mistaken for the `rm`/`install` commands themselves.
    [ /(?<![\w-])(rm|rmdir|unlink|shred|truncate|dd)\b/,"file deletion/truncation" ],
    [ /(?<![\w-])(mv|cp|install|ln)\b/,         "moves/copies/links write the target" ],
    [ /(?<![\w-])(mkdir|touch|mktemp)\b/,       "creates files/directories" ],
    [ /(?<![\w-])(chmod|chown|chgrp|chflags)\b/,"changes file permissions/ownership" ],
    # find: block the mutating actions, but allow a read-only `-exec grep/cat {} +`. Only deny
    # -exec when it runs a known mutating command (so finders can still fan grep/cat over results).
    [ /\bfind\b[^|]*\s-(delete|fprint|fprintf)\b/, "find with a mutating action (-delete/-fprint)" ],
    [ /\bfind\b[^|]*-exec(dir)?\s+(rm|rmdir|mv|cp|tee|truncate|dd|sed|chmod|chown|ln|sh|bash|python3?|ruby|perl)\b/, "find -exec runs a mutating command" ],
    [ /\bxargs\b[^|]*\s(rm|mv|cp|tee|sed|truncate|dd)\b/, "xargs into a mutating command" ],
    # git: mutating subcommands only (read subcommands like log/show/diff/status/grep/ls-files
    # stay allowed). git_pre tolerates global options (`git -c k=v commit`, `git --no-pager push`).
    # `fetch` is intentionally NOT denied: it only downloads objects (no working-tree/index
    # change) and finders legitimately need it for remote-ref drift checks. `pull` stays denied
    # (it merges into the working tree).
    [ /\bgit\s+#{git_pre}(add|commit|push|reset|checkout|restore|switch|rm|mv|merge|rebase|cherry-pick|clean|stash|revert|apply|am|tag|branch|pull|remote|config|init|worktree|gc|prune|filter-branch|update-ref|notes)\b/, "mutating git subcommand" ],
    # gh: mutating subcommands and non-GET api calls (tolerate global opts too)
    [ /\bgh\s+#{git_pre}(pr|issue|release|repo|gist|secret|workflow|run|label|api)\b.*\b(create|merge|close|edit|comment|delete|review|reopen|lock|unlock|rerun|cancel|dispatch|sync|set|add|remove)\b/, "mutating gh command" ],
    [ /\bgh\s+api\b[^|]*-X\s*(POST|PUT|PATCH|DELETE)/i, "gh api non-GET write" ],
    [ /\bgh\s+api\b[^|]*(-f|--field|--input)\b/,        "gh api with a write body" ],
    # package / dependency installs
    [ /\b(npm|pnpm|yarn|bun)\s+(i|install|add|ci|update|upgrade|remove|uninstall|link)\b/, "package install/modify" ],
    [ /\b(bundle\s+(install|update|add|remove)|gem\s+(install|update|uninstall))\b/, "ruby gem install/modify" ],
    [ /\b(pip|pip3)\s+(install|uninstall)\b/, "pip install/modify" ],
    [ /\b(apt|apt-get|brew|yum|dnf|apk)\s+(install|remove|upgrade|update|add)\b/, "system package change" ],
    # Rails mutations (migrations, generators, db tasks, seeds, live console). `rake` is already
    # covered by the task-runner pattern above.
    [ /\b(rails|bin\/rails|bundle\s+exec\s+rails)\b[^|]*\b(db:|generate|g\b|destroy|d\b|runner|console|c\b|dbconsole)/, "rails mutation or live console" ],
    # Cloud CLIs: deny anything that is not clearly a read verb.
    # NOTE: "run"/"exec" are intentionally excluded as verbs ("gcloud run", "docker run" are
    # product/service names, not mutations). Real infra writes below; SQL/redirect caught separately.
    [ /\b(gcloud|aws|render|kubectl|terraform|docker|psql)\b.*\b(create|delete|update|deploy|apply|destroy|put|set-|add-|remove|patch|drop|insert|restart|scale|rollout|publish|terminate|enable|disable|grant|revoke)\b/, "cloud/infra mutation" ],
    # SQL writes: only when a DB client is present, so `grep INSERT app/` is NOT a false positive.
    [ /\b(psql|sqlite3|mysql|mariadb|cockroach|pg_dump|pg_restore|mongo|redis-cli)\b[^|]*\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE)\b/i, "SQL write via DB client" ],
    # Outbound network requests (ANY method, not just non-GET/download variants, and not just
    # HTTP tools -- ssh/scp/sftp/ftp/rsync are equally viable exfiltration channels). Read-only
    # finders read attacker-influenced diffs/PRs; a prompt-injected comment could otherwise
    # exfiltrate secrets/env vars via a crafted GET URL (query-string data) or a peer transfer
    # tool, which a non-GET-only or download-only denylist does not catch. Finders have no
    # legitimate need for raw network calls -- Read/Grep/Glob and the deepwiki MCP tool cover
    # their job. Anchored to command position (start of string/pipeline/subshell, optionally
    # after `sudo`) rather than a bare word match: an unanchored match denied routine greps for
    # these words themselves (`grep -rn curl app/`, `find . -path "*nc*"`) -- exactly the kind
    # of search a security/infra finder legitimately runs. Known residual gap (regex, not a
    # real shell parser, same tradeoff as the rest of this file): a literal `|` sitting inside a
    # quoted argument right before one of these words (e.g. `grep "ssh\|scp" docs/`) still
    # reads as a pipe boundary and gets denied -- rare, and errs toward over-blocking, not under.
    [ /(?:\A|[|;]|&&|\|\||`|\$\()\s*(?:sudo\s+)?(curl|wget|nc|ncat|netcat|telnet|ssh|scp|sftp|ftp|rsync)\b/, "outbound network request (exfiltration risk from prompt-injected content; use Read/Grep/Glob or an MCP tool instead)" ]
  ]

  patterns.each do |re, why|
    if c.match?(re)
      deny("Audit finders are read-only; this Bash command was blocked (#{why}). Record what you found as a finding rather than acting on it. Command: #{cmd[0, 200]}")
    end
  end

  # Default: allow read-only Bash (cat, ls, find, grep/rg, git log/show/diff/grep, gh pr view,
  # bundle list, npm ls, gcloud/aws describe|list, psql -c "select ...", etc.)
  exit 0
'
