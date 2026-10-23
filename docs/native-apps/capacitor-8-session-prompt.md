# Capacitor 8 move: session prompt (2026-10-21)

Router output for Scot. Source plan: `knowledge/app-store-launch-plan-2026-10-20.md`.
Queue row: propagation_map.md Part 3, row 19.

## How to run it

- **Owner: Traci** (assigned by Scot 2026-10-21 over Google Chat). She took over Melissa's roles, so she may already have the shell repo.

- **Tool and model:** Claude Code, Opus 5.5 at **high** effort. Native build tooling, two
  repos, and an unknown starting point (the shell repo's location) make this more ambiguous
  than a routine fix; medium is the default for Opus 5.5, high is worth it here.
- **Launcher (WSL):** `ll --type feat --slug capacitor-8` (or Traci's own equivalent: a fresh
  LingoLinq-AAC worktree off origin/develop, never the main checkout), then type `/effort high`
  once the session opens. This gives a fresh LingoLinq-AAC worktree off develop for the docs update.
  The shell repo has no launcher alias, so the prompt has the session make its own worktree
  there.
- **Not a cloud thread.** It needs the shell repo, local build tools and possibly Melissa's
  machine. Keep it in the `ll` session.
- **Reviewer at PR time:** Codex as the independent reviewer (pin per
  environment_constraints.md, current pin gpt-6.1-sol at xhigh). Not the same session.
- **Two stops.** STOP 1 is a read-only report. Paste it back here before saying "go".

## Watch-for notes (outside the prompt)

- **iOS builds need a Mac with Xcode 26.** Scot's machine is Windows/WSL, so this session can
  do the Android side and the iOS config, but it can't compile or upload iOS. Someone needs a
  Mac (Melissa's?) or a cloud Mac build service. That's the next decision after STOP 1.
- **The shell repo may only exist on Melissa's old machine** (Traci has since taken over her roles). The AAC docs point to
  `/home/melis/repos/lingolinq_mobile`. If STOP 1 can't find it on GitHub or locally, the fix
  is asking Melissa to push it to the lingolinq org (private), not rebuilding it.
- **Android tooling in WSL** may not be installed. The prompt tells the session to report what's
  missing instead of installing it.
- Claude Code 2.1.304 fixed `claude --worktree` deleting a worktree and branch at exit without
  asking when HEAD was detached. If the installed version is older than 2.1.304, don't use
  `claude --worktree` inside this session (the prompt uses plain `git worktree add`).
- Standing guards dropped as not relevant: 2 (no guard or validator code), 4 (no live data
  checks), 7 and 12 (no compliance text), 8 (no dated lint entries touched). Guard 3 is
  reduced to "don't edit tests" because this change adds no tests.

---

## The prompt (paste everything below this line)

```
TASK: Move the LingoLinq mobile shell from Capacitor 7 to Capacitor 8 so Google Play will
accept it, and update the LingoLinq-AAC native-apps docs to match. Two stops. Do STOP 1 and
wait for my "go" before changing anything.

CONTEXT (treat as unconfirmed until you verify it, see rule 10):
- LingoLinq-AAC (this worktree) is a Rails + Ember AAC app. Its native-apps plan is in
  docs/native-apps/ (native-apps-project-overview.md, capacitor-7-kickoff.md,
  native-bridge-inventory.md). It chose Capacitor 7 because of an old Node 20 pin.
- The native shell is a SEPARATE repo, "lingolinq_mobile" (app id com.lingolinq.app). The docs
  point to /home/melis/repos/lingolinq_mobile on a teammate's machine. It may or may not be on
  GitHub under the lingolinq org. It packages the Ember build into www/ and adds
  www/sqlite_bridge.js and www/filesystem_bridge.js over @capacitor-community/sqlite and
  @capacitor/filesystem. The Ember side has a backup bridge in
  app/frontend/app/utils/capacitor_bridge.js plus capacitor_sqlite_shim.js and
  capacitor_filesystem_shim.js.
- Claim to verify: Google Play has required targetSdk 36 for new apps since 2026-08-31
  (support.google.com/googleplay/android-developer/answer/11926878). Capacitor 7 targets 35,
  Capacitor 8 targets 36 and requires Node 22+, Xcode 26, Android Studio Otter 2025.2.1+
  (capacitorjs.com/docs/android/setting-target-sdk and capacitorjs.com/docs/updating/8-0).
  LingoLinq-AAC is now on Node 22 (read .nvmrc and app/frontend/package.json engines yourself).
- No real users or student data exist in any LingoLinq environment. Never put real personal
  data in configs, screenshots, logs or test accounts anyway.

RULES:
1. Read-only until STOP 1 is approved. No installs, no edits, no branches, no commits.
2. Check for existing work first. Before anything else, look for an open PR, branch or
   worktree in either repo that already touches Capacitor 8, targetSdk, or the native-apps
   docs (git branch -a, git worktree list, gh pr list --search "capacitor" in both repos if
   gh works). If one exists, stop and report it.
3. Never connect to anything on port 5432, by TCP or the /var/run/postgresql socket. This task
   needs no database: do not run rspec, rails console, or db tasks.
4. Do not run `claude --worktree`. Use plain `git worktree add` for any worktree you make.
5. Never install system tools (Android SDK, JDK, Gradle, Xcode) or change global npm/node.
   If something is missing, report it. Project-level `npm install` inside the shell worktree
   is fine after STOP 1.
6. Do not edit or delete any existing test to make a check pass. If a test fails, report it
   and stop for my approval.
7. Versions and branch names: read them from the canonical file and cite the path. Don't
   restate them from this prompt.
8. Public-repo filter: LingoLinq-AAC is PUBLIC. Nothing you write there (docs, commit
   messages, branch names, PR text) may describe an unfixed security, privacy or compliance
   gap as fact. Use neutral wording such as "requires internal privacy and security
   sign-off". Treat the shell repo the same way unless you confirm it is private. After a PR
   opens, read every bot comment in full and report any that characterize an unfixed issue;
   don't reply to them.
9. Research claims: cite only pages you actually opened in this session. If a page won't
   open, say so instead of quoting it.
10. The Capacitor 7 vs Play API 36 diagnosis came from another session. Verify each link
    yourself (Play requirement page, Capacitor target SDK page, the shell's actual
    variables.gradle targetSdkVersion) and try to disprove it. If any link fails, stop and
    report.
11. Evidence for every claim of "done" or "works": paste the actual command output.

STOP 1 (read-only report, then wait):
a. Where the shell repo is: GitHub (gh repo list lingolinq, gh repo view
   lingolinq/lingolinq_mobile) and local paths you checked. If you can't find it, stop here
   and say so. Do not recreate it.
b. Its current state: git remote, default branch, latest commit and date, dirty or clean,
   @capacitor/* and plugin versions from package.json and the lockfile, android/variables.gradle
   (minSdk, compileSdk, targetSdk), AGP and Gradle wrapper versions, whether an ios/ folder
   exists and whether it uses CocoaPods or Swift Package Manager.
c. Every Capacitor and Cordova plugin in the shell with its current version, the version
   that supports Capacitor 8 (from the plugin's own npm page or changelog, cite it), and
   whether one exists yet. Flag any with no Capacitor 8 release, and any that ship native
   libraries (relevant to Play's 16 KB page-size rule).
d. Which build tools exist on this machine: node/npm versions, Java, ANDROID_HOME and SDK
   platforms, Gradle, adb, and whether any Mac or Xcode is reachable (expect no on WSL).
e. Your verdict on rule 10's diagnosis, with the three links checked.
f. The plan for STOP 2: exact steps from the official 7-to-8 guide that apply, what
   `npx cap migrate` should handle vs manual steps, and every file in both repos you expect
   to change.
g. Mirror list: every AAC file that says "Capacitor 7" or gives the Node 20 reason (search
   the whole repo with rg -n -i "capacitor 7|capacitor-7|cap 7|node 20" docs/ CLAUDE.md
   AGENTS.md .github/ app/frontend/README.md and say what each hit needs). Prove the search
   works by showing it catches docs/native-apps/capacitor-7-kickoff.md.
Then STOP and wait.

STOP 2 (only after I say "go"):
1. Shell repo: create a worktree off its default branch (fetch first) on a branch named
   feat/scot-capacitor-8. Upgrade with `npm i -D @capacitor/cli@latest` and
   `npx cap migrate`, then do the remaining manual steps from
   capacitorjs.com/docs/updating/8-0 (variables.gradle to compile/target 36 and min 24, AGP
   8.13.0, Gradle wrapper 8.14.3, `=` property syntax in app/build.gradle, `density` in the
   main activity configChanges, Kotlin 2.2.20 only if used, iOS deployment target 15.0).
   Upgrade each plugin to its Capacitor 8 release. Keep the www/ sqlite and filesystem bridges
   working; don't rewrite them.
2. Verify, pasting output:
   - npx cap doctor
   - npx cap sync android (and ios if the folder exists; sync only, no build)
   - grep showing targetSdkVersion = 36 in android/variables.gradle
   - If the Android SDK is present: cd android && ./gradlew assembleDebug and bundleRelease
     (unsigned is fine). If it's missing, say so; don't install it.
   - The offline smoke test from docs/native-apps/capacitor-7-kickoff.md "Manual smoke"
     section, only if an emulator or device is available. Otherwise list it as not run.
3. LingoLinq-AAC worktree: update every hit from STOP 1 item g so the docs say Capacitor 8
   and why (Play targetSdk 36; Node 22 now in place), citing the source pages. Rename
   capacitor-7-kickoff.md only if nothing links to it; otherwise keep the name and add a dated
   note at the top. Fix every hit, not just the first.
4. Mirror check before calling it done: list every sibling or dependent file (AAC CLAUDE.md,
   AGENTS.md, .github/copilot-instructions.md, native-bridge-inventory.md, the shell's
   README) and say for each whether it changed or why it didn't need to.
5. Re-read your own diffs in both repos for anything rule 8 forbids.
6. STOP before any push or PR. Report: both diffs summarized, all verification output, what
   was not run and why, plugins that blocked or were held back, and the next step for iOS
   (who has a Mac with Xcode 26, or which cloud Mac build option to evaluate). Wait for me.

DONE means: shell on Capacitor 8 with targetSdk 36 and a passing cap doctor and sync, an
Android build if the SDK exists (or a clear note that it doesn't), AAC docs consistent with
Capacitor 8 everywhere, nothing pushed, and the report above.
```
