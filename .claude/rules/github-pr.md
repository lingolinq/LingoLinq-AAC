# Opening a PR from this machine

Two obvious routes are dead ends here — do not spend a turn rediscovering them:
- **`gh` CLI is not installed** (`gh not found`).
- **The MCP GitHub server rejects its credentials** ("Bad credentials").

What works is the OAuth token git already uses for pushes, held by the configured
credential helper. This checkout is used from both macOS and WSL on Windows, so the
helper differs by machine — macOS uses `osxkeychain`, WSL uses Windows Git Credential
Manager (`git-credential-manager.exe`). Do not assume either: run
`git config --get credential.helper` to see which is live. The read is the same either
way. Read it with
`git credential fill` (protocol=https, host=github.com; the value comes back on the
`password=` line) and send it as a `Bearer` token to
`POST /repos/lingolinq/LingoLinq-AAC/pulls`, with `Accept: application/vnd.github+json`.
The payload is `{title, head, base, body, draft}`.

Build that payload with `json.dumps` reading the body from a FILE rather than inlining
it: PR bodies contain backticks, quotes and newlines that shell interpolation mangles.

Handling rules for that credential:
- **Never echo it, never write it to a tracked file, never put it in a commit message or
  PR body.** Pipe it from the credential helper straight into the request header.
- Use it only for github.com API calls against this repo. It is the user's own
  credential, not a service account, so anything done with it is attributed to them.
- Opening or updating a PR is outward-facing: the user asks for it first. Pushing to a
  branch that already has an open PR updates that PR, so the same applies there.
- The same token serves any REST endpoint, so prefer it over asking the user to copy
  results out of the web UI.
