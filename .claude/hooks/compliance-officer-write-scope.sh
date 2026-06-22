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
# those, but ONLY on the explicit allowlist below - never application code, never
# git state, never infrastructure, and never the findings register truth
# (FINDINGS.json / FINDINGS.md). This hook is that backstop.
#
# Contract (Claude Code PreToolUse): reads a JSON event on stdin carrying
# `tool_name` and `tool_input`; emits an allow (exit 0, no output) or a structured
# deny. Pure stdlib Ruby (the repo already requires Ruby 3.4); no gems, no network.
#
# Read-only by construction: this script itself never writes anything.

exec ruby -rjson -rpathname -e '
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
  proj_real = File.realpath(proj)

  # Explicit relative-path allowlist. The officer drafts compliance artifacts only;
  # it must never mutate the findings register or other audit-report truth files.
  ALLOWED_RELATIVE_PATTERNS = [
    %r{\Aaudit-reports/compliance-calendar\.(json|md)\z},
    %r{\Aaudit-reports/compliance-[a-z0-9-]+\.md\z},
    %r{\Aaudit-reports/regulatory-watch-[0-9]{4}-[0-9]{2}-[0-9]{2}\.md\z},
    %r{\Aaudit-reports/self-findings-triage-[0-9]{4}-[0-9]{2}-[0-9]{2}\.md\z},
    %r{\Aaudit-reports/DOCUMENT-REGISTER\.(json|md)\z},
    %r{\Adocs/legal/[A-Za-z0-9_.-]+\.md\z},
  ].freeze

  FORBIDDEN_RELATIVE = %w[
    audit-reports/FINDINGS.json
    audit-reports/FINDINGS.md
  ].freeze

  def resolve_under_project(raw_path, proj_real)
    return nil if raw_path.nil? || raw_path.strip.empty?
    return nil if raw_path.include?("\0")

    abs = File.expand_path(raw_path, proj_real)
    abs = Pathname.new(abs).cleanpath.to_s

    begin
      if File.exist?(abs)
        resolved = File.realpath(abs)
      else
        parent = File.dirname(abs)
        base = File.basename(abs)
        resolved_parent = nil
        while parent != File.dirname(parent)
          if File.exist?(parent)
            resolved_parent = File.realpath(parent)
            break
          end
          parent = File.dirname(parent)
        end
        return nil unless resolved_parent
        resolved = File.join(resolved_parent, base)
      end
    rescue Errno::ENOENT, Errno::ELOOP
      return nil
    end

    return nil unless resolved == proj_real || resolved.start_with?(proj_real + "/")
    Pathname.new(resolved).relative_path_from(Pathname.new(proj_real)).to_s
  rescue ArgumentError
    nil
  end

  def allowed_write_relative?(rel)
    return false if rel.nil? || rel.empty?
    return false if rel.include?("..")
    return false if FORBIDDEN_RELATIVE.include?(rel)

    ALLOWED_RELATIVE_PATTERNS.any? { |re| rel.match?(re) }
  end

  WRITE_TOOLS = %w[Edit Write NotebookEdit MultiEdit Update].freeze
  if WRITE_TOOLS.include?(tool)
    path = (input["file_path"] || input["notebook_path"] || input["path"]).to_s
    if path.empty?
      deny("compliance-officer write blocked: no file_path on #{tool}.")
    end

    rel = resolve_under_project(path, proj_real)
    unless rel && allowed_write_relative?(rel)
      deny("compliance-officer is read-mostly: writes are allowed only on the " \
           "compliance artifact allowlist under audit-reports/ (calendar, dated " \
           "hygiene/regulatory notes, triage docs) and docs/legal/*.md - not #{path}. " \
           "Never edit audit-reports/FINDINGS.json or FINDINGS.md. Record register " \
           "issues as a dated note or a DRAFT artifact instead.")
    end
    exit 0
  end

  exit 0 unless tool == "Bash"

  cmd = input["command"].to_s
  exit 0 if cmd.strip.empty?

  c = cmd.gsub(/\s+/, " ").strip
  c = c.sub(/\A(env\s+)?((?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+)/, "")

  git_pre = /(?:(?:-c\s+\S+|-C\s+\S+|--?[A-Za-z][\w-]*(?:=\S+)?)\s+)*/

  patterns = [
    # File output redirection (allow >/dev/null, >&2, 2>&1, &>/dev/null)
    [ %r{(^|[^0-9&>])>>?\s*(?!\s*(&\d|/dev/(null|stderr|stdout)))}, "output redirection writes a file" ],
    [ /\btee\b/, "tee writes files" ],
    [ /\bsed\b[^|]*\s-[a-z]*i(?:\b|\.)/, "sed -i edits in place" ],
    [ /(?<![\w\/-])(python3?|node|nodejs|ruby|perl|php|deno|bun|Rscript|osascript|gawk|awk)\b[^|]*\s(-(?:[A-Za-z]*[ecrniEW])\b|--(?:eval|exec|require|inplace|in-place|command)\b)/, "interpreter eval flag can write files" ],
    [ /(?<![\w\/-])(npx|bunx|pnpx|make|just|task|gulp|grunt|mvn|gradle|rake)\b/, "task runner / npx can run arbitrary writes" ],
    [ /(?<![\w-])(rm|mv|cp|mkdir|rmdir|touch|truncate|chmod|chown|ln)\b/, "filesystem mutation command" ],
    [ /\bgit\s+#{git_pre}(commit|push|merge|rebase|reset|checkout|switch|tag|am|apply|cherry-pick|stash|clean|rm|mv|add|restore|revert|worktree)\b/, "git state mutation" ],
    [ /\bgh\s+(?:pr|issue|release|repo|api|workflow|run)\b/, "gh can mutate GitHub state" ],
    [ /\b(npm|pnpm|yarn|bundle|gem|pip|pip3|brew|apt|apt-get|cargo)\s+(i|install|add|update|upgrade|remove|uninstall|publish)\b/, "package mutation" ],
    [ /\b(rails|bin\/rails|bundle\s+exec\s+rails)\b[^|]*\b(db:|generate|g\b|destroy|d\b|runner|console|c\b|dbconsole)/, "rails mutation or live console" ],
    [ /\b(bundle\s+exec\s+)?rake\b[^|]*\b(db:|environment|stats|extras:)/, "rake task can mutate state" ],
    [ /\b(gcloud|aws|render|kubectl|docker|terraform)\b[^|]*\b(delete|rm|destroy|create|apply|deploy|update|put|set|stop|start|restart|scale|exec)\b/, "cloud/infra mutation" ],
    [ /\bcurl\b[^|]*\s(-X\s*(POST|PUT|PATCH|DELETE)|--data|-d\b|--upload-file|-T\b)/, "curl write/upload request" ],
  ]

  patterns.each do |re, why|
    if c =~ re
      deny("compliance-officer Bash blocked (#{why}). The officer is read-mostly " \
           "and drafts via the Write tool on the compliance artifact allowlist, not " \
           "via shell. Command: #{cmd[0, 160]}")
    end
  end

  exit 0
'
