# Capacitor 8 move: STOP 2 handoff (2026-10-25)

Where the Capacitor 7 to 8 move stands after STOP 2, and every open issue, for whoever picks
it up next. The plan was [capacitor-8-stop1-handoff.md](./capacitor-8-stop1-handoff.md); the
full working record, with command output, is
[2026-10-23_capacitor-8-move.md](../task-management/2026-10-23_capacitor-8-move.md).

## Summary

Shell PR #2 (not merged yet) moves the shell to Capacitor 8.5.3 with Android target API 36.
On that branch the shell builds for Android and iOS, passes `cap doctor` for both, and passes the 16 KB page-size checks. On the iOS simulator it
launches with one bridge and starts its SQLite, file storage and TTS bridges (updated
2026-10-25, Xcode 27.1). The offline smoke test has not been run on either platform, Google
sign-in does not work in the app ([#1198](https://github.com/lingolinq/LingoLinq-AAC/issues/1198)),
and the release bundle is unsigned. So the code change is ready for review, but the app is not
yet shown to work end to end on Capacitor 8 and is not yet ready for a store upload.

| Goal | State |
|---|---|
| Shell on Capacitor 8, Android target SDK 36 | Done (shell PR #2, draft) |
| `cap sync` and `cap doctor` pass | Done, Android and iOS |
| Android debug and release builds | Done (release is unsigned) |
| 16 KB page size | Done (all native libraries aligned) |
| AAC docs say Capacitor 8 and why | Done (PR #1185) |
| App works on Capacitor 8 (offline smoke test) | **Not run** |
| iOS build | Done (Xcode 27.1, simulator; one bridge at launch) |
| Signed release bundle for Play | **Not started** (outside the move) |

## Pull requests

| Repo | PR | Branch | State |
|---|---|---|---|
| lingolinq/LingoLinq-AAC | [#1185](https://github.com/lingolinq/LingoLinq-AAC/pull/1185) | `traci/feat/capacitor-8` → `develop` | Ready for review. Docs only. |
| lingolinq/lingolinq_mobile | [#2](https://github.com/lingolinq/lingolinq_mobile/pull/2) | `traci/feat/capacitor-8` → `master` | Draft until the smoke test passes. The repo has no CI. |

- The shell repo's only long-lived branch is `master` (no `develop`, and it is not being
  renamed). PR #2 is two commits on top of `master` at `0d20e48`.
- Merge order: the two can merge independently. #1185 only describes the move as "in
  progress", so it is accurate before or after #2 merges.

## Where things are on the machine that did STOP 2

- LingoLinq-AAC: the main checkout, on `traci/feat/capacitor-8`.
- Shell: a clone at `../lingolinq_mobile` (on `master`) and a worktree at
  `../lingolinq_mobile-cap8` (on `traci/feat/capacitor-8`, with `node_modules` installed).
- Installed for this work: Android Studio 2026.2.1, the Android SDK command-line tools,
  SDK platform 36, build-tools 35.0.0 and platform-tools in `~/Library/Android/sdk` (licenses
  accepted), CocoaPods 1.17.0, and a user-level Temurin JDK 21 in
  `~/Library/Java/JavaVirtualMachines`. Xcode 27.1 on macOS 27.0.1 (16.4 updated through
  the App Store) with the iOS 27.0 and 27.1 simulator runtimes. The Android emulator, an
  API 36 Google APIs arm64 system image and a Pixel Tablet AVD named `ll_cap8_tablet`.
  `ripgrep` (the packaging script calls `rg`) and `mas` from Homebrew.
- The shell worktree is currently packaged against staging for testing: an untracked
  `www/app.js` and local, uncommitted edits to `www/init.js` and `www/domain_settings.js`.
  Do not commit those two files; restore them with `git checkout -- www/init.js
  www/domain_settings.js` when testing is over.

Environment each shell session needs:

```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 22   # the nvm default is 20
export JAVA_HOME="$(/usr/libexec/java_home -v 21)"             # or Android Studio's bundled runtime
export ANDROID_HOME="$HOME/Library/Android/sdk"
export LANG=en_US.UTF-8                                        # CocoaPods and the register scripts need UTF-8
export PATH="/opt/homebrew/bin:$PATH"
```

## Open issues

Each item says whether it blocks, and what closes it. "PLAUSIBLE" means the mechanism is
real but only a run on a device or simulator can show whether it happens.

### Blocks the shell PR leaving draft

1. **Offline smoke test (Android and iOS) has not run.** The definition of done is the "Manual smoke"
   section of [capacitor-7-kickoff.md](./capacitor-7-kickoff.md): fresh install, log in, wait
   for sync, confirm the console shows the SQLite shim and not the IndexedDB fallback,
   airplane mode, cold start, open the home board and speak with local symbols, go online
   and confirm sync keeps the local set. It needs a packaged `www/app.js`
   (`npm run package:local`, or `npm run package` with `LINGOLINQ_API_HOST` set; to package
   from staging, `LINGOLINQ_ROOT=../LingoLinq-AAC PACKAGE_SOURCE=prod
   PACKAGE_PROD_HOST=https://staging.lingolinq.com LINGOLINQ_API_HOST=https://staging.lingolinq.com
   ./bin/package_from_lingolinq`). Packaging rewrites the tracked `www/init.js` and
   `www/domain_settings.js`: never commit those changes, and check `grep api_host www/init.js`
   before any shell commit. The run also needs a LingoLinq
   API reachable over HTTPS or through `adb reverse`, and a test account that holds no real
   user data, and it must not use Continue with Google (see #1198 below). The STOP 2 session
   did not run local Rails, because its session prompt forbids touching the database. The
   Android emulator and AVD are installed (see above).
2. **Layout: system bars and safe areas (Medium, PLAUSIBLE), Android and iOS.** Capacitor 8 registers its `SystemBars` plugin for
   every app with `insetsHandling` defaulting to `css`
   (`@capacitor/android` `Bridge.java:664`, `SystemBars.java:56,125`); Capacitor 7 did nothing
   by default. The shell does not configure it, and the Ember CSS uses
   `safe-area-inset-bottom` but not the top inset. Check the top bar, the bottom button row
   and the on-screen keyboard on Android 14 and on Android 15 or later during the smoke test.
   On iOS, the shell's own loading page sat under the status bar on iPhone 17 (the bootstrap
   `www/index.html` uses `viewport-fit=cover`), and the Ember CSS has no top safe-area inset,
   so check the top of the real UI on an iPhone and an iPad too.
3. **Codex review on PR #2 has not run.** `@codex review` was posted; the Codex bot replied
   that the commenter's GitHub account is not connected to Codex. Either connect the account
   at chatgpt.com/codex/cloud/settings/connectors and post the request again, or ask someone
   whose account is connected to post it.
4. **The canonical review passes have not run** on either PR. `/review-pr` and
   `/adversary-review` need the PII pre-flight script from the internal tooling repo, which
   was not available. A local substitute (`/adversary-review-local`) ran on both branches,
   then a re-check of the fix commits: no Critical or High findings, and every Low finding is
   fixed. The automatic Codex review on #1185 also never arrived.

### iOS

**Update (Xcode 27.1 on macOS 27.0.1, 2026-10-25):** items 5 and 9 are resolved and item 7 is resolved for
launch: the app builds for the simulator, and a cold launch on iPad and iPhone logs "Loading
app at" once, with the SQLite, file storage and TTS bridges starting. Still open on iOS: the
simulator smoke test with a packaged app (item 6), the top safe-area inset (item 2), the TTS
audio-session check (item 8), and export compliance at upload (item 10). Details are in the task log.

5. **Xcode (resolved).** Xcode 27.1 is installed on macOS 27.0.1 with the iOS simulator
   runtimes. For another Mac: per
   [Apple's system requirements](https://developer.apple.com/xcode/system-requirements/),
   Xcode 26.0 to 26.3 need Sequoia 15.6 or later, Xcode 26.4 and later need Tahoe 26.2 or
   later, and Xcode 27 needs Tahoe 26.6 or later; App Store Connect has required "Xcode 26 or
   later" since April 28, 2026
   ([Apple upcoming requirements](https://developer.apple.com/news/upcoming-requirements/)).
   Install the iOS platform with `xcodebuild -downloadPlatform iOS`. Xcode 27.1 has no
   separate Simulator app: open `ios/App/App.xcworkspace`, pick a simulator as the run
   destination and press Run.
6. **Simulator smoke test (open).** The build works; what remains is the item 1 smoke test
   in the iPad simulator, with a packaged app and a test login.
7. **Second bridge at cold launch (resolved for launch).** Checked 2026-10-25: one "Loading app
   at" line on iPad and iPhone. Original concern: `Info.plist` sets
   `UISceneStoryboardFile` to `Main` (whose initial view controller is a
   `CAPBridgeViewController`), and `SceneDelegate.swift` also builds its own window and
   bridge. Both match the Capacitor 8.5.3 CLI template exactly. On the first launch, count
   the "Loading app at" lines in the Xcode console. One is correct. If there are two, remove
   `UISceneStoryboardFile` from the scene manifest and record why, since that departs from
   the template.
8. **Text-to-speech audio on iOS (Low, PLAUSIBLE).** `@capacitor-community/text-to-speech`
   8.0.2 no longer sets up a `.playback` audio session at start. iOS had no TTS pod before
   this change, so this is not a regression, but check that speech plays with the silent
   switch on and while other audio is playing.
9. **`SceneDelegate.swift` project entry (resolved: the app builds with it).** The `xcode` library the CLI uses wrote
   `explicitFileType = undefined; includeInIndex = 0;` into its `project.pbxproj` entry. This
   is probably harmless; if the build cannot find `SceneDelegate`, normalise the entry to the
   template's form. `includeInIndex = 0` also turns off Xcode indexing for that file.
10. **Export compliance question at upload.** The iOS app now ships SQLCipher through the
    sqlite pod, and `Info.plist` has no `ITSAppUsesNonExemptEncryption` key, so App Store
    Connect will ask the encryption export question at the first upload. Answering it needs
    internal privacy and security sign-off.

### Needed for a Play upload (outside the Capacitor move)

11. **Release signing.** `android/app/build.gradle` has no signing configuration, and
    `jarsigner` confirms the release bundle is unsigned. Play accepts only a signed AAB:
    create an upload key, keep it and its passwords out of the repo (1Password, injected at
    build time), and enrol in Play App Signing.
12. **Version numbers.** `versionCode` is 1 and `versionName` is "1.0"
    (`android/app/build.gradle`). Decide the release numbering before the first upload.
13. **Play Console.** The listing, Data safety form and content rating belong to the store
    launch plan in [native-apps-project-overview.md](./native-apps-project-overview.md).
14. **Play target API date.** Play has required API 36 for new apps and app updates since
    August 31, 2026, with extensions available to November 1, 2026
    ([Play target API requirement](https://support.google.com/googleplay/android-developer/answer/11926878)).
    If an existing Play listing needs an update shipped before this lands, request the
    extension. A first submission just needs to target 36, which this build does.
15. **SQLite encryption setting.** `capacitor.config.json` holds the `CapacitorSQLite`
    encryption options (`androidIsEncryption` / `iosIsEncryption`). Their release setting
    requires internal privacy and security sign-off.

**Found during a manual iOS sign-in check (2026-10-25, app packaged against staging):** Continue with Google (sign-up and log-in) does
nothing in the native app, because the frontend opens relative `/auth/google/start` URLs that
resolve inside the app. Not a Capacitor 8 regression, but it blocks the first store release.
Tracked in [#1198](https://github.com/lingolinq/LingoLinq-AAC/issues/1198), with the full plan.

### Release notes

16. **Minimum OS versions rise.** Capacitor 8 requires Android 7 (API 24) and iOS 15, so
    Android 6 and iOS 14 devices will not receive further updates. Older dedicated AAC
    tablets are the likely affected devices.

### Pre-existing or minor; not blocking

17. **`npm audit`** reports 3 moderate advisories, all in the build-time CLI's `uuid`
    dependency. `npm audit --omit=dev` reports 0.
18. **Android lint:** 0 errors, 14 warnings. `ObsoleteSdkInt` on `res/drawable-v24` comes from
    the minSdk 24 bump (cosmetic). Lint suggests newer Gradle (8.14.6) and appcompat (1.8.0)
    than the Capacitor 8 guide pins; keep the guide's versions. The rest predate this change.
19. **`www/sqlite_bridge.js:56-68` (PLAUSIBLE, pre-existing).** It calls
    `checkConnectionsConsistency` with only the database being opened. If the app ever opens
    a second database, the first one's native connection could close while its cached open
    promise stays resolved. Worth its own look; untouched by this move.
20. **Filesystem path confinement (Low, PLAUSIBLE).** `@capacitor/filesystem` 8 refuses paths
    that leave their directory. Real file names (`app/frontend/app/services/persistence.js`)
    never contain a `..` path segment: a URL ending in `/` can produce a name like
    `12340000..5678.png` (`persistence.js:1733`), which has `..` inside a name, not as a
    segment. The filesystem library's check is compiled, so this is not proven; watch for a
    refused path in the smoke test. The one edge is `readdir` on the root (`www/filesystem_bridge.js:204`),
    whose only caller chain ends at `storage.clear`, which nothing calls.
21. **`audit-reports/DOCUMENT-REGISTER.md` render drift** and 11 local citation-check
    failures. Both fail identically on a clean `develop`, so they do not come from this work.
    `audit-reports/` is governed, so they were left alone. (The citation rows fail only in a
    local clone without their evidence commits; it is not a CI job.)
22. **`Info.plist` lists `armv7`** in `UIRequiredDeviceCapabilities`. It predates this change
    and is also in the Capacitor template; it does not block submission.

### Housekeeping

23. **PR rule scope.** `.claude/rules/github-pr.md` describes opening PRs on LingoLinq-AAC.
    If agents should also open and update PRs on `lingolinq_mobile`, extend that rule to cover
    it.
24. **Superseded docs branch.** `traci/docs/capacitor-8-session-prompt` (local and on GitHub)
    held only the two planning docs, which are now on `traci/feat/capacitor-8`. It can be
    deleted when convenient.
25. **Optional JDK.** The shell also builds on Android Studio 2026.2's bundled Java 25, so
    the separate Temurin JDK 21 can be removed if it is not wanted.
26. **Older docs still describe the earlier state on purpose.** The session prompt and the
    STOP 1 handoff are dated records; where they were wrong (the Node 20 premise, the
    Android Studio JDK), the task log records the correction.

## Gotchas learned

- `npx cap migrate` stops at its sync step when CocoaPods is missing, after the iOS steps
  but before any Android change, and it never upgrades `@capacitor-community/*` plugins.
  Diff the Android files against `node_modules/@capacitor/cli/assets/android-template.tar.gz`.
- The Homebrew `temurin@21` cask needs `sudo`; the Adoptium tarball installs at user level.
- Run CocoaPods and the register scripts with `LANG=en_US.UTF-8`, or they fail on encoding.
- The packaged bundle's `application-preload.js` sets `window.app_version`, so the shell's
  `init.js` fallback only shows before `app.js` loads.

## Suggested order

1. Connect a Codex account and request the review on PR #2 (item 3).
2. Run the offline smoke test with the layout checks, on the iPad simulator and the Android
   tablet emulator (items 1, 2, 6 and 8, plus the path check in item 20); then take PR #2
   out of draft. Use a normal email sign-up or login, not Google.
3. Fix native Google sign-in ([#1198](https://github.com/lingolinq/LingoLinq-AAC/issues/1198))
   before the first store build.
4. Store preparation: release signing and versioning, Play Console, the App Store export
   compliance answer, and the release notes (items 10 to 16).
