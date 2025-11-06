# Devcontainer: Ruby LSP quick guide

This short note explains how the devcontainer is configured for this project and how to quickly verify or troubleshoot Ruby LSP (the language server) when starting a new Codespace or rebuilding the container.

Key points
- The devcontainer is pinned to Ruby 3.4 (image: `mcr.microsoft.com/devcontainers/ruby:3.4`).
- The post-create step installs Bundler 2.6.8 and runs `bundle _2.6.8_ install` so the project's gems (including `ruby-lsp`) are available.
- VS Code is configured to prefer running the Ruby LSP via Bundler (see `.vscode/settings.json`).

Quick verification (inside the rebuilt container)

1. Rebuild the container / Codespace:
   - In VS Code: Command Palette -> "Dev Containers: Rebuild Container" (or use the Codespaces UI rebuild).

2. Open a terminal in the container and run:

```bash
ruby -v
gem -v
bundle -v
bundle _2.6.8_ --version
```

You should see Ruby 3.4.x and Bundler 2.6.8. If Bundler 2.6.8 is missing, install it with:

```bash
gem install bundler -v 2.6.8 --conservative
```

3. If the Ruby LSP still fails to launch, open the VS Code Output panel and select "Ruby LSP" from the dropdown. Copy the server startup log lines — they contain the most useful error messages (missing gems, Bundler errors, or version mismatches).

Quick manual debug commands

```bash
# try starting the server via bundle (helps reproduce extension behavior)
bundle _2.6.8_ exec ruby-lsp --version || bundle _2.6.8_ exec ruby-lsp-stdio --version

# re-install gems with the pinned bundler
bundle _2.6.8_ config set --local path 'vendor/bundle'
bundle _2.6.8_ install --jobs 4
```

Notes
- If your environment can't pull `mcr.microsoft.com/devcontainers/ruby:3.4`, consider using `mcr.microsoft.com/devcontainers/ruby:3.4.3` or switching to a devcontainer feature that installs Ruby 3.4.
- The repository contains a generated `.ruby-lsp` Gemfile used by the extension; it is normal for the extension to generate this file.

If you still hit the "Launching the Ruby LSP failed" message after following these steps, paste the Ruby LSP output and the outputs of `ruby -v` and `bundle _2.6.8_ --version` here and I'll continue troubleshooting.
