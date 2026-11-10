# Opening a PR from this machine

Rules for any route (`gh` or the API call below):
- Opening or updating a PR is outward-facing: the user asks for it first. Pushing to a
  branch that already has an open PR updates that PR, so the same applies there.
- The GitHub credential is the user's own, not a service account, so anything done with it
  is attributed to them. Use it only for github.com calls against this repo.
- **Never print the credential**: no `gh auth token`, no `gh auth status --show-token`, no
  echoing it, never write it to a tracked file, a commit message or a PR body.

Use `gh` when `command -v gh` finds it and `gh auth status` reports a login. When it does not,
or on a machine without it, use the route below. The MCP GitHub server has rejected its
credentials here ("Bad credentials"); do not spend a turn on it.

The fallback route is the OAuth token git already uses for pushes, held by the configured
credential helper. This checkout is used from both macOS and WSL on Windows, so the
helper differs by machine: macOS uses `osxkeychain`, WSL uses Windows Git Credential
Manager (`git-credential-manager.exe`). Do not assume either: run
`git config --get credential.helper` to see which is live. The read is the same either
way. Read it with
`git credential fill` (protocol=https, host=github.com; the value comes back on the
`password=` line) and send it as a `Bearer` token to
`POST /repos/lingolinq/LingoLinq-AAC/pulls`, with `Accept: application/vnd.github+json`.
The payload is `{title, head, base, body, draft}`.

Build that payload with `json.dumps` reading the body from a FILE rather than inlining
it: PR bodies contain backticks, quotes and newlines that shell interpolation mangles.

On this route, pipe the token from the credential helper straight into the request header.
The same token serves any REST endpoint, so prefer it over asking the user to copy results
out of the web UI.
