# Capacitor 8 move: STOP 2 on the Mac (2026-10-23)

Runs STOP 2 of [capacitor-8-session-prompt.md](../native-apps/capacitor-8-session-prompt.md)
from the plan in [capacitor-8-stop1-handoff.md](../native-apps/capacitor-8-stop1-handoff.md).
Branch `traci/feat/capacitor-8` in both repos (the shell in a worktree beside its clone). Nothing pushed.

## Sources opened this session

- [Capacitor 8 upgrade guide](https://capacitorjs.com/docs/updating/8-0)
- [Capacitor 8.5 UIScene guide](https://capacitorjs.com/docs/updating/8-5): "Xcode 27
  requires it"; the core library still supports the AppDelegate path.
- [Capacitor target SDK](https://capacitorjs.com/docs/android/setting-target-sdk): 8.x is 36,
  7.x is 35, no custom target SDK.
- [Google Play target API requirement](https://support.google.com/googleplay/android-developer/answer/11926878):
  from August 31, 2026, new apps and app updates must target API 36; extension to
  November 1, 2026 on request.
- [Android build tools](https://developer.android.com/tools/releases/build-tools): AGP 3.0+
  "automatically uses a default version of the build tools that the plugin specifies".
- [AGP 8.13 release notes](https://developer.android.com/build/releases/agp-8-13-0-release-notes):
  default SDK Build Tools 35.0.0, max API level 36.1.

## Mac build tools (STOP 1 item d, redone)

macOS 15.5 arm64. Node 22.23.3 via nvm (default alias is 20; commands ran under
`nvm use 22`). Xcode 16.4. No Java, Android SDK, Android Studio, adb, Gradle or CocoaPods.

Installed afterwards with Traci's approval: Android Studio 2026.2.1 and the SDK command-line
tools (Homebrew casks), SDK licenses accepted, `platforms;android-36`, `build-tools;35.0.0`
and `platform-tools` into `~/Library/Android/sdk`; CocoaPods 1.17.0 (Homebrew); Temurin JDK
21.0.13 at user level in `~/Library/Java/JavaVirtualMachines` (the Homebrew cask needs sudo;
the tarball's SHA-256 was checked against Adoptium's API). Android Studio 2026.2 bundles a
Java 25 runtime, not 21; the shell also builds on it (below), so the separate JDK 21 is
optional. Xcode 26 needs macOS Sequoia 15.6 or later, so the iOS build waits on a macOS update.

## Shell repo (`lingolinq_mobile`, off `origin/master` at `0d20e48`, unchanged since STOP 1)

- `npm i -D @capacitor/cli@latest`, then `npx cap migrate --noprompt --packagemanager npm`.
  Migrate upgraded the `@capacitor/*` packages, set the iOS deployment target to 15.0
  (Podfile and `project.pbxproj`), applied the 8.5 UIScene migration (`SceneDelegate.swift`,
  `UIApplicationSceneManifest` in `Info.plist`, `configurationForConnecting` in
  `AppDelegate.swift`), then failed at its `cap sync` step: "CocoaPods is not installed".
  It made no Android changes.
- The UIScene migration is kept: it matches the 8.5 guide, and the shell's `AppDelegate`
  holds only template code (its URL handlers only forward to `ApplicationDelegateProxy`,
  which `SceneDelegate` forwards to as well).
- Community plugins upgraded by hand: `@capacitor-community/sqlite` 8.1.1,
  `@capacitor-community/text-to-speech` 8.0.2 (peer `@capacitor/core >=8.0.0`).
- Android done by hand, diffed against the CLI's own template
  (`node_modules/@capacitor/cli/assets/android-template.tar.gz`): `variables.gradle`,
  `build.gradle`, `app/build.gradle` and the wrapper now match it except the app id and
  namespace. `buildToolsVersion` pin removed (AGP 8.13 defaults to 35.0.0). `density` added to
  `configChanges`. `kotlin_version` not added: the app has no Kotlin, and
  `@capacitor/filesystem` defaults to `'2.2.20'` when it is unset.
- README and `package.json` description updated. `www/` untouched in this commit (the
  `www/init.js` fallback label changed after the review; see below).

## Verification

- `npx cap sync android`: exit 0, 13 plugins at their Capacitor 8 versions.
- `./gradlew assembleDebug bundleRelease`: BUILD SUCCESSFUL on JDK 21, and again with
  `--rerun-tasks` on Android Studio's bundled Java 25. `aapt2 dump badging` on the debug APK:
  `targetSdkVersion:'36'`, `compileSdkVersion='36'`.
- 16 KB page size: `zipalign -c -P 16 -v 4` on the APK reports "Verification succesful". The
  only native library is `libsqlcipher.so`; all four ABIs have 16 KB (16384) ELF LOAD
  alignment, read from the program headers.
- `npx cap sync ios` (with CocoaPods): exit 0; pod install added the sqlite, text-to-speech
  and filesystem pods and created `Podfile.lock` and `App.xcworkspace`, which the template's
  `.gitignore` does not exclude, so they are committed.
- `npx cap doctor`: exit 0, "Android looking great" and "iOS looking great".
- `plutil -lint` OK on `Info.plist` and `project.pbxproj`.

## Not run, and why

- iOS build: Xcode 16.4 is installed and Capacitor 8 needs Xcode 26, which needs macOS 15.6+.
- Manual smoke from `capacitor-7-kickoff.md`: needs an emulator image, a packaged `www/app.js`
  and a LingoLinq API with a test account. The session prompt's rule 3 forbids this session
  from touching the database, so a local Rails run is out of scope here.

## AAC docs

`native-apps-project-overview.md`, `native-bridge-inventory.md` and
`capacitor-7-kickoff.md` updated (kickoff keeps its name: the learnings archive, the bridge
inventory and the shell README refer to it). `.github/copilot-instructions.md`, `CLAUDE.md`, `AGENTS.md` and
`app/frontend/README.md` need no change.

## Local adversary review (2026-10-23)

`/adversary-review-local`, three read-only slices (AAC docs; shell Android, packages and
`www/` bridge compatibility; shell iOS). This is the local substitute; the canonical
`/review-pr` and `/adversary-review` passes did not run here. No Critical or High findings.

- **Bridges vs Capacitor 8 plugins: compatible as far as source shows (CONFIRMED by diffing the
  7.x and 8.x plugin sources).** SQLite Android Java differs only in formatting; TTS Android
  Java is identical; Filesystem option keys, `DATA` mapping and result shapes are unchanged.
  The new path confinement cannot be hit by real call paths: filenames come from
  `app/frontend/app/services/persistence.js` and never contain `..`.
- **Medium, PLAUSIBLE: system-bar insets.** Capacitor 8 registers `SystemBars` for every app with
  `insetsHandling` defaulting to `css` (`@capacitor/android` `Bridge.java:664`,
  `SystemBars.java:56,125`); Capacitor 7 did nothing by default. Layout may vary by Android
  and WebView version. Check the top bar, bottom button row and keyboard in the smoke test.
- **Medium, PLAUSIBLE: possible second hidden `CAPBridgeViewController` on iOS cold launch.**
  `Info.plist` sets `UISceneStoryboardFile` while `SceneDelegate` builds its own window; both
  match the Capacitor 8.5.3 template exactly. Check on the first Xcode run by counting
  "Loading app at" log lines.
- **Low, CONFIRMED: `package.json` ranges are `^8.0.0`** but `CAPSceneDelegateProxy.swift`
  first ships in `@capacitor/ios` 8.5.0 (absent from 8.4.0). The lockfile pins 8.5.3.
- **Low, CONFIRMED: `www/init.js:54` still labels `app_version` `"capacitor-7-kickoff"`.**
- **Low, CONFIRMED: docs say the shell "moved" to Capacitor 8** while the shell branch is
  unmerged and the smoke test has not run; this log's claim that a task log links to the
  kickoff doc was wrong (the learnings archive, the inventory and the shell README refer to it).
- **Low, CONFIRMED: minSdk 24 and iOS 15** drop Android 6 and iOS 14 devices (required by
  Capacitor 8; note in release notes).
- **Refuted:** the 16 KB date. Android's page-sizes guide says "Starting February 1, 2027".

### Fixes applied after the review

- Docs say the shell "is moving" to Capacitor 8 until the shell change merges and the smoke
  test passes; the kickoff note says JDK 21+ and that the shell README lists the
  prerequisites once the change merges.
- Shell `package.json`: `@capacitor/core`, `android`, `ios` and `cli` ranges raised to
  `^8.5.3` (lockfile resolutions unchanged; `cap sync` and `cap doctor` still pass).
- Shell `www/init.js` fallback label renamed to `"capacitor-8"`. No runtime effect once the
  app loads: the packaged bundle's `application-preload.js` sets `window.app_version`
  unconditionally, so `LingoLinq.VERSION`, the `X-LingoLinq-Version` header the server
  parses, and the stored device settings all get the bundle's date version; nothing in
  `www/` reads the fallback, and nothing calls `LingoLinq.expired()`.
- The two Medium checks (Android system-bar layout, iOS single bridge at launch) are on the
  shell README checklist.
- Public-doc wording: the session prompt now tells agents to treat every environment as
  holding real user data, teammates' local paths are no longer spelled out, and the kickoff
  doc's SQLite encryption line uses the neutral sign-off wording.

### Re-check of the fix commits

A second local adversary pass covered the two follow-up commits (shell `316e209`, AAC
`1be1cb2b1`). Shell: nothing found; the range, lockfile and label claims all held. AAC: five
Low wording issues (a leftover copy of the wrong link claim in the handoff, a stale "`www/`
untouched" line, an over-strong "only parser" claim, the prompt's stale local-path sentence,
and two missing "Still open" items), all fixed in the following commit.

### Still open

- Offline smoke on an Android emulator or device, including the layout check. This session
  cannot run it: it needs a LingoLinq API and a test account, and the session prompt forbids
  touching the database.
- iOS: update macOS to 15.6 or later, install Xcode 26, build, check the cold-launch log, and
  run the simulator smoke test.
- Release notes: Capacitor 8 raises the minimum to Android 7 (API 24) and iOS 15, so Android 6
  and iOS 14 devices get no further updates.

## Simulated CI on the shell PR (2026-10-25)

The shell repo has no CI, so lingolinq/lingolinq_mobile#2 was checked on a fresh clone of its
head (`316e209`) with the AAC CI's equivalents where they apply:

- gitleaks 8.30.1 over the PR's commits and the full history: no leaks.
- `git diff --check`, `node --check` on every `www/*.js`, JSON parse of `package.json`,
  `package-lock.json` and `capacitor.config.json`, `plutil -lint` and `xmllint`: all clean.
- `npm ci`: installs from the lockfile with no changes. `npm audit --audit-level=high`: exit 0
  (3 moderate, all in the build-time CLI's `uuid`); `npm audit --omit=dev`: 0.
- `npx cap sync` then `git status`: no changes, so the committed generated files are current.
  `npx cap doctor`: Android and iOS pass.
- `./gradlew clean assembleDebug bundleRelease :app:lintDebug :app:testDebugUnitTest` (JDK 21):
  BUILD SUCCESSFUL. Lint: 0 errors, 14 warnings, none blocking (`ObsoleteSdkInt` on
  `drawable-v24` from the minSdk 24 bump; newer Gradle and appcompat than the Capacitor 8 guide
  pins; the rest predate the branch). Unit tests: 1 run, 0 failures.
- APK `targetSdkVersion:'36'`; 16 KB zip alignment passes; all 8 `libsqlcipher.so` copies
  (APK and AAB, four ABIs) have 16 KB LOAD alignment. `jarsigner`: the release bundle is
  unsigned, as expected; Play upload needs a signing setup.
- iOS: `xcodebuild` cannot run on this Mac (Xcode 16.4 has no iOS platform installed, and
  Capacitor 8 needs Xcode 26).
- `@codex review` on the PR: the Codex bot replied that the commenter's account is not
  connected to Codex, so no review ran.
