# Capacitor 8 move: STOP 1 report and Mac handoff (2026-10-23)

This is the read-only STOP 1 report for [capacitor-8-session-prompt.md](./capacitor-8-session-prompt.md),
plus the decisions made afterwards and the plan for picking STOP 2 up on a Mac. STOP 1 was
run in WSL on 2026-10-23. Nothing was installed, edited or pushed in the shell repo.

## Decisions (Traci, 2026-10-23)

| Question | Decision |
|---|---|
| Shell repo visibility | Keep `lingolinq/lingolinq_mobile` **public**. Prompt rule 8 (public-repo filter) applies to everything written there. |
| Android build tools | Install approved (JDK 21, Android SDK 36, Android Studio Otter 2025.2.1+). |
| Where to run STOP 2 | On Traci's Mac: one machine builds both Android and iOS, and avoids the WSL plus Windows Android Studio split the shell README calls fragile. |
| Branch name (both repos) | `traci/feat/capacitor-8` (replaces the prompt's `feat/scot-capacitor-8`). |
| `buildToolsVersion` pin | Follow best practice: remove the pin and let the Android Gradle Plugin pick its matching build-tools version. Confirm against Android's current docs before editing. |

## Starting on the Mac

### Prerequisites

- Xcode 26 (required by Capacitor 8 for iOS)
- CocoaPods (the shell's iOS project uses CocoaPods; stay on it)
- Android Studio Otter 2025.2.1 or later, with SDK platform 36 installed (includes a JDK 21)
- nvm with Node 22 (`.nvmrc` in LingoLinq-AAC is 22)
- Claude Code, run at high effort (`/effort high`)

### Resume steps

1. In LingoLinq-AAC, fetch and check out this branch (`traci/docs/capacitor-8-session-prompt`),
   or create `traci/feat/capacitor-8` off `origin/develop` and bring these two docs across.
2. Clone the shell: `git clone https://github.com/lingolinq/lingolinq_mobile.git`, then
   `git worktree add -b traci/feat/capacitor-8 ../lingolinq_mobile-cap8 origin/master`.
3. Redo STOP 1 item d (build tools) on the Mac, because the WSL results below no longer
   apply. Everything else in this report still stands. Recheck the shell's `master` for new
   commits since `0d20e48` first.
4. Proceed with STOP 2 from the prompt, using the plan in section f below.

## STOP 1 report

**Bottom line:** the diagnosis holds. Google Play requires API 36, Capacitor 7 cannot target
it, and Capacitor 8 can. Every plugin already has a Capacitor 8 release.

**Existing work (rule 2):** no open PRs, branches or worktrees for Capacitor 8 or targetSdk in
either repo, other than this docs branch. Checked through the GitHub API.

### a. Where the shell repo is

- `github.com/lingolinq/lingolinq_mobile`, default branch `master`. The API reports it as
  **public**.
- It did not need to be pushed from Melissa's machine. The local paths in the older docs
  (a teammate's machine) do not exist on Traci's machine.

### b. Current state

| Item | Value (file) |
|---|---|
| Latest commit | `0d20e48`, 2026-08-10, merge of PR #1 "SQLite/Filesystem bridges" |
| Capacitor core, cli, android, ios | 7.6.8 (`package.json`, `package-lock.json`) |
| min / compile / target SDK | 23 / 35 / 35 (`android/variables.gradle`) |
| `buildToolsVersion` | Pinned to `'35.0.1'`, a workaround for a corrupt build-tools install on the original machine (`android/variables.gradle`) |
| Android Gradle Plugin / google-services | 8.7.2 / 4.4.2 (`android/build.gradle`) |
| Gradle wrapper | 8.11.1 (`android/gradle/wrapper/gradle-wrapper.properties`) |
| Java target | 21 (`android/app/capacitor.build.gradle`) |
| Kotlin | Not used (`MainActivity.java` only) |
| iOS | `ios/` exists and uses CocoaPods; `platform :ios, '14.0'`, deployment target 14.0 (`ios/App/Podfile`, `project.pbxproj`) |

Two further findings:

- **The iOS Podfile is out of sync.** It has no pods for sqlite, filesystem or
  text-to-speech, so `cap sync ios` was not re-run after those plugins were added.
- **The shell has two bridges the AAC docs do not mention.** Besides `www/sqlite_bridge.js`
  and `www/filesystem_bridge.js`, it also has `www/tts_bridge.js` and
  `www/video_host_fix.js`.

### c. Plugins

Latest versions come from `registry.npmjs.org/<package>/latest`, checked 2026-10-23. Each
plugin's peer dependency is `@capacitor/core >=8.0.0`. No Cordova plugins are in the shell.

| Plugin | Now | Capacitor 8 release | Native libraries |
|---|---|---|---|
| @capacitor/core, cli, android, ios | 7.6.8 | 8.5.3 | n/a |
| @capacitor-community/sqlite | 7.0.3 | 8.1.1 | Yes: SQLCipher (`net.zetetic:sqlcipher-android:4.17.0`) |
| @capacitor-community/text-to-speech | 6.1.0 (the Capacitor 7 line) | 8.0.2 | No |
| @capacitor/app | 7.1.2 | 8.1.2 | No |
| @capacitor/browser | 7.0.5 | 8.0.5 | No |
| @capacitor/clipboard | 7.0.4 | 8.0.1 | No |
| @capacitor/device | 7.0.5 | 8.0.3 | No |
| @capacitor/filesystem | 7.1.8 | 8.1.5 | No NDK code |
| @capacitor/keyboard | 7.0.6 | 8.0.6 | Not checked |
| @capacitor/network | 7.0.4 | 8.0.1 | No |
| @capacitor/preferences | 7.0.4 | 8.0.1 | No |
| @capacitor/share | 7.0.4 | 8.0.3 | No |
| @capacitor/splash-screen | 7.0.5 | 8.0.2 | No |
| @capacitor/status-bar | 7.0.6 | 8.0.4 | No |

- **16 KB page size:** Google Play blocks updates without 16 KB page support from
  2027-02-01 ([page sizes guide](https://developer.android.com/guide/practices/page-sizes)).
  Zetetic states sqlcipher-android has supported 16 KB pages since 4.6.1. The sqlite plugin
  makes no alignment claim of its own, so check the built APK (Android Studio APK Analyzer).
- **Behaviour change to test:** `@capacitor/filesystem` 8.1.4 confines paths to their
  target directory. The bridge always uses `directory: 'DATA'`, and its `joinPath` strips
  slashes but not `..`. A path containing `..` would now be refused. This is unconfirmed, so
  the offline smoke test should cover it.
- **Capacitor 8 breaking changes** that could touch this shell: `bridge_layout_main.xml` is
  renamed to `capacitor_bridge_layout_main.xml`; `android.adjustMarginsForEdgeToEdge` is
  removed; the Status Bar plugin dropped `CAPNotifications.swift` and
  `CAPBridgeViewController.swift`.

### d. Build tools (WSL, now superseded by the Mac)

In WSL: Node 22.23.3 via nvm (the default shell Node was 16); no Java, Android SDK, Gradle,
adb, Xcode or CocoaPods. Redo this check on the Mac.

### e. Verdict on the diagnosis: confirmed

1. **Google Play** ([target API requirement](https://support.google.com/googleplay/android-developer/answer/11926878)):
   "Starting August 31, 2026: New apps and app updates must target Android 16 (API level 36)
   or higher". It covers both new apps and updates. An extension to November 1, 2026 can be
   requested.
2. **Capacitor** ([setting target SDK](https://capacitorjs.com/docs/android/setting-target-sdk)):
   8.x maps to 36 and 7.x to 35, and "Capacitor Android does not support custom target SDK
   versions", so Capacitor 7 cannot be bumped by hand.
3. **The shell:** `targetSdkVersion = 35` in `android/variables.gradle`.

One correction to the prompt's premise: the overview doc gives no Node 20 reason.
`native-apps-project-overview.md` says Capacitor 7 was chosen "because it is compatible
with the Node 22 version our app is pinned to." Capacitor 8 needs Node 22 or later, which
LingoLinq-AAC has (`.nvmrc`; `app/frontend/package.json` engines `>=22.0.0 <23.0.0`), so that
sentence needs rewriting rather than a Node change.

### f. Plan for STOP 2

Source: the [Capacitor 8 upgrade guide](https://capacitorjs.com/docs/updating/8-0). It does
not say which steps `npx cap migrate` does itself, only that the CLI prints the steps it
could not do, so run it and then check each item below by hand.

**Shell repo**

1. Worktree on `traci/feat/capacitor-8` off `origin/master` (fetch first).
2. Under Node 22: `npm i -D @capacitor/cli@latest`, then `npx cap migrate`. Upgrade each
   plugin to the Capacitor 8 release in section c.
3. Check, and fix by hand where needed:
   - `android/variables.gradle`: minSdk 24, compileSdk 36, targetSdk 36, and the guide's
     androidx versions (activity 1.11.0, appcompat 1.7.1, coordinatorlayout 1.3.0, core
     1.17.0, fragment 1.8.9, core-splashscreen 1.2.0, webkit 1.14.0, androidx junit 1.3.0,
     espresso 3.7.0, cordovaAndroidVersion 14.0.1).
   - Remove the `buildToolsVersion` pin from `variables.gradle` and the line that reads it
     in `android/app/build.gradle`.
   - Android Gradle Plugin 8.13.0 and google-services 4.4.4 (`android/build.gradle`);
     Gradle wrapper 8.14.3.
   - `=` property syntax in `android/app/build.gradle` (for example `namespace = "..."`).
   - Add `density` to the activity's `android:configChanges` in `AndroidManifest.xml`.
   - iOS deployment target 15.0 in `ios/App/Podfile` and `project.pbxproj`. Stay on
     CocoaPods.
   - No Kotlin changes (the project does not use it).
4. `npx cap sync android` and `npx cap sync ios`. The iOS sync should also add the missing
   pods.
5. Update the shell's `package.json` description and `README.md` (title, Node, JDK, SDK
   platform 35 and Android Studio Ladybug rows, checklist).
6. Leave the `www/` bridges unchanged.
7. Verify, pasting output: `npx cap doctor`; both syncs; the `targetSdkVersion = 36` line;
   `cd android && ./gradlew assembleDebug bundleRelease` (unsigned is fine); an iOS build in
   Xcode; the 16 KB check on the APK; the "Manual smoke" test in
   [capacitor-7-kickoff.md](./capacitor-7-kickoff.md) on an emulator or device.

**Expected shell files:** `package.json`, `package-lock.json`, `android/variables.gradle`,
`android/build.gradle`, `android/gradle/wrapper/gradle-wrapper.properties`,
`android/app/build.gradle`, `android/app/src/main/AndroidManifest.xml`,
`android/capacitor.settings.gradle` and `android/app/capacitor.build.gradle` (generated),
`ios/App/Podfile`, `ios/App/App.xcodeproj/project.pbxproj`, `README.md`.

### g. Mirror list (LingoLinq-AAC)

Search used: `rg -n -i "capacitor 7|capacitor-7|cap 7|node 20" docs/ CLAUDE.md AGENTS.md
.github/ app/frontend/README.md`. It catches `capacitor-7-kickoff.md` (title and branch
line), so it works.

| Hit | Needs |
|---|---|
| `docs/native-apps/native-apps-project-overview.md` (lines 63-65, 131, 202, 247) | Change to Capacitor 8 and give the real reason: Play API 36, Node 22 already in place |
| `docs/native-apps/native-bridge-inventory.md` (lines 3, 33) | Change "Capacitor 7" to "Capacitor 8"; consider adding the TTS and video bridges |
| `docs/native-apps/capacitor-7-kickoff.md` | Keep the name (a task log and the learnings archive link to it). Add a dated Capacitor 8 note at the top and point the shell link at the GitHub repo instead of a local path. |
| `.github/copilot-instructions.md:34` | No change; it is a correct historical note about Node |
| `docs/archive/`, `docs/CHANGES.md`, `docs/task-management/` logs and learnings archive | No change; dated records |
| `CLAUDE.md`, `AGENTS.md`, `app/frontend/README.md` | No hits |

A wider search (adding `targetSdk` and `lingolinq_mobile`) also matched files under
`audit-reports/`, plus `core_ngrams.rb` and `lib/domains.json.example`. Those were not
opened; `audit-reports/` is governed and outside this task.

## Still open

- **Prompt rule 8 check:** re-read both diffs before any push.
- **Mirror check:** before calling STOP 2 done, account for every sibling file listed in
  prompt STOP 2 step 4.
- **Pushes and PRs:** STOP 2 ends before any push or PR, as the prompt requires.
