# Capacitor 8 move: STOP 2 handoff (2026-10-25)

Where the Capacitor 7 to 8 move stands after STOP 2, and every open issue, for whoever picks
it up next. The plan was [capacitor-8-stop1-handoff.md](./capacitor-8-stop1-handoff.md); the
full working record, with command output, is
[2026-10-23_capacitor-8-move.md](../task-management/2026-10-23_capacitor-8-move.md).

## Summary

Shell PR #2 (open as of 2026-10-26) moves the shell to Capacitor 8.5.3 with Android target API 36.
On that branch the shell builds for Android and iOS, passes `cap doctor` for both, and passes
the 16 KB page-size checks. The offline smoke test ran on 2026-10-25 and 2026-10-26 on the iPad
simulator (Xcode 27.1) and an API 36 Android tablet emulator, with the app packaged from
staging. It found two defects in the shell's SQLite bridge, both fixed in PR #2 with tests.
With them fixed, on both platforms the app logs in, syncs to the device, cold starts offline,
and in Basic view opens the home board and speaks with its pictures, with no network requests.

What still fails is in the shared Ember app, not in the shell: the first sync never runs on its
own and Basic view can report a sync complete when it is not
([#1208](https://github.com/lingolinq/LingoLinq-AAC/issues/1208),
[#1212](https://github.com/lingolinq/LingoLinq-AAC/issues/1212)), Modern view never loads boards
from the device offline, and an unsynced folder tapped offline fails late and replaces the board
([#1213](https://github.com/lingolinq/LingoLinq-AAC/issues/1213)). Google sign-in does not work in
the app ([#1198](https://github.com/lingolinq/LingoLinq-AAC/issues/1198)) and the release bundle
is unsigned. So the shell side of the Capacitor 8 move works, but the app is not ready for a store upload until
those issues are fixed.

| Goal | State |
|---|---|
| Shell on Capacitor 8, Android target SDK 36 | Done (shell PR #2, open as of 2026-10-26) |
| `cap sync` and `cap doctor` pass | Done, Android and iOS |
| Android debug and release builds | Done (release is unsigned) |
| 16 KB page size | Done (all native libraries aligned) |
| AAC docs say Capacitor 8 and why | Done (PR #1185) |
| App works on Capacitor 8 (offline smoke test) | Run; the shell-side checks pass (Basic view offline speech and pictures on iOS and Android). Not run: the "go online, sync keeps the local set" step. Rerun once #1208, #1212 and #1213 are fixed |
| iOS build | Done (Xcode 27.1, simulator; one bridge at launch) |
| Signed release bundle for Play | **Not started** (outside the move) |

## Pull requests

| Repo | PR | Branch | State |
|---|---|---|---|
| lingolinq/LingoLinq-AAC | [#1185](https://github.com/lingolinq/LingoLinq-AAC/pull/1185) | `traci/feat/capacitor-8` → `develop` | Ready for review. Docs only. |
| lingolinq/lingolinq_mobile | [#2](https://github.com/lingolinq/lingolinq_mobile/pull/2) | `traci/feat/capacitor-8` → `master` | As of 2026-10-26: smoke test run and canonical review passes done; nothing blocks it leaving draft. The repo has no CI. |

- The shell repo's only long-lived branch is `master` (no `develop`, and it is not being
  renamed). PR #2 is five commits on top of `master` at `0d20e48`: the move, its follow-up,
  the two SQLite bridge fixes (`cc94c74`, `9a9789b`) and a README checklist update (`7ae7419`).
- Merge order: the two can merge independently. The PR-state lines in this file are dated
  2026-10-26; update them when the PRs merge.

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

### Shell PR gates (all resolved or tracked as of 2026-10-26)

These were the gates for PR #2 leaving draft. None of them blocks it now: the smoke test ran,
the canonical reviews ran, item 2 is tracked in #1202, and item 3 is optional.

1. **Offline smoke test (done 2026-10-25 and 2026-10-26; results under "Smoke test results"
   below).** The shell passes; the failures it found are in the shared Ember app and are
   tracked as issues. The "go online and confirm sync keeps the local set" step was not run.
   How to run it again: the definition of done is the "Manual smoke"
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
   user data, and it must not use Continue with Google (see #1198 below). The runs so far used
   staging and a synthetic account, not local Rails. To test offline on the Android emulator
   without cutting the Mac's network, use `adb shell cmd connectivity airplane-mode enable`
   (and `disable`); launch the app with `adb shell am start -n com.lingolinq.app/.MainActivity`
   (a `monkey` launch did not open it).
2. **Layout: system bars and safe areas (Medium, PLAUSIBLE), Android and iOS.** Capacitor 8 registers its `SystemBars` plugin for
   every app with `insetsHandling` defaulting to `css`
   (`@capacitor/android` `Bridge.java:664`, `SystemBars.java:56,125`); Capacitor 7 did nothing
   by default. The shell does not configure it, and the Ember CSS uses
   `safe-area-inset-bottom` but not the top inset. Check the top bar, the bottom button row
   and the on-screen keyboard on Android 14 and on Android 15 or later during the smoke test.
   On iOS, the shell's own loading page sat under the status bar on iPhone 17 (the bootstrap
   `www/index.html` uses `viewport-fit=cover`), and the Ember CSS has no top safe-area inset,
   so check the top of the real UI on an iPhone and an iPad too. Fix tracked in
   [#1202](https://github.com/lingolinq/LingoLinq-AAC/issues/1202) (add the top safe-area inset to the navbar and other top-edge elements).
3. **Codex review on PR #2 has not run (not a required pass).** `@codex review` was posted;
   the Codex bot replied that the commenter's GitHub account is not connected to Codex. To get
   one, connect the account at chatgpt.com/codex/cloud/settings/connectors and post the
   request again.
4. **Canonical review passes (2026-10-26).** The PII preflight passed on PR #2 at `9a9789b`, and
   the senior-dev pass (`/review-pr`, run by Claude because the Codex CLI is not installed) and
   the adversary pass both ran on it. Verdicts: the senior-dev pass said "Request changes" on
   one High, which is refuted below; the adversary said "Ship with conditions", both met or not
   applicable below. No Critical findings. Each finding was checked by hand:
   - Refuted: "the iOS scene setup was never built or launched, and may start two bridges".
     Every saved iOS cold launch (5) logged one "Loading app at" and one shim start. The
     reviewer was reading the shell README's stale checklist, now updated (`7ae7419`).
   - Refuted: the no-op `abortAllPendingTransactions` lets a late callback misfire. Its only
     caller resolves an idempotent promise (`services/persistence.js:2075-2091`).
   - Refuted: `null` values reach the plugin; `runSql` defaults them to `[]`.
   - Not applicable: an in-place upgrade from a Capacitor 7 build. No store build exists.
   - Confirmed, outside this PR: the Ember app's own SQLite shim lacks all three bridge fixes
     ([#1206](https://github.com/lingolinq/LingoLinq-AAC/issues/1206) covers the `ios_columns`
     part; the short `executeSql` form and the abort method should be added to it). The shell's
     bridge loads first, so the Ember copy is unused in the app today.
   - Confirmed, pre-existing, launch blocker: item 27 (device database in cloud backups).
   - Low follow-ups for the bridge: no watchdog on a native call that never returns (every later
     read and write would wait); `transaction()` drops statements queued from a statement
     callback and `tx.executeSql` lacks the short form (no current caller); the shell repo has
     no CI to run `npm test`.

   The automatic Codex review on #1185 never arrived.

### iOS

**Update (Xcode 27.1 on macOS 27.0.1, 2026-10-25):** items 5 and 9 are resolved and item 7 is resolved for
launch: the app builds for the simulator, and a cold launch on iPad and iPhone logs "Loading
app at" once, with the SQLite, file storage and TTS bridges starting. The simulator smoke test
(item 6) is done. Still open on iOS: the top safe-area inset (item 2), the TTS audio-session
check with the silent switch (item 8), and export compliance at upload (item 10). Details are
in the task log.

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
6. **Simulator smoke test (done 2026-10-25).** See "Smoke test results" below.
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

**Found by the canonical review of PR #2 (2026-10-26):**

27. **Device database in cloud backups (Medium, CONFIRMED, pre-existing; blocks the first
    store release).** The shell opens SQLite unencrypted (`www/sqlite_bridge.js`,
    `mode: 'no-encryption'`), on iOS in `Documents` (no `iosDatabaseLocation` is set, and the
    plugin excludes only a custom location from backup), and Android has
    `allowBackup="true"` with no `dataExtractionRules`. With iCloud Backup or Android Auto Backup
    on, boards, user records and logs are copied to the family's cloud account, outside
    LingoLinq's retention and deletion controls. Options: set `CapacitorSQLite.iosDatabaseLocation`
    to `Library/CapacitorDatabase`, add Android backup rules that exclude `databases/` (or turn
    backup off), and decide encryption with item 15. Found by the adversary review of PR #2.

**Found during a manual iOS sign-in check (2026-10-25, app packaged against staging):** Continue with Google (sign-up and log-in) does
nothing in the native app, because the frontend opens relative `/auth/google/start` URLs that
resolve inside the app. Not a Capacitor 8 regression, but it blocks the first store release.
Tracked in [#1198](https://github.com/lingolinq/LingoLinq-AAC/issues/1198), with the full plan.

**Also found 2026-10-25:** a logged-out app opens on the marketing landing page with an empty
header (the logged-out header is hidden when `installed_app`, `app-navbar.hbs:9`). Decision:
the iOS and Android apps open on sign-in instead. Tracked in
[#1200](https://github.com/lingolinq/LingoLinq-AAC/issues/1200); also blocks the first store release.

**Also found 2026-10-25:** the app detects an iPad as a Mac desktop (Mac user agent since
iPadOS 13; `capabilities.js:182-232` only matches `ipod|ipad|iphone`), so `mobile` is false and
`system` is `Mac` on iPads, skipping iOS behaviour such as `no_linky`, native voices and iOS
offline file handling. Tracked in [#1201](https://github.com/lingolinq/LingoLinq-AAC/issues/1201).

**Also found 2026-10-25, during sign-up testing on iOS:**

- Fixed in shell PR #2 (`cc94c74`): the shell's SQLite bridge passed the iOS `ios_columns` row
  through as data, so the schema version read failed on every launch after the first and
  single-record reads found nothing. With the fix, login works and survives the reload.
- After sign-up the user comes back logged out (login works):
  [#1204](https://github.com/lingolinq/LingoLinq-AAC/issues/1204). Blocks sign-up in the apps.
- A failed SQLite setup leaves every local storage call waiting forever:
  [#1205](https://github.com/lingolinq/LingoLinq-AAC/issues/1205).
- The Ember backup SQLite shim has the same `ios_columns` defect:
  [#1206](https://github.com/lingolinq/LingoLinq-AAC/issues/1206).
- Deployed Gentle View showing Focused assets (not app-specific):
  [#1203](https://github.com/lingolinq/LingoLinq-AAC/issues/1203).

### Smoke test results (2026-10-25 and 2026-10-26)

App packaged from staging, synthetic test account, normal email login. Offline was checked
from the device side each time (no network requests in the offline window), not assumed.

**iOS (iPad Air 11-inch simulator, iOS 27.1):**

- Login, a manual sync, and the SQLite shim (not the IndexedDB fallback) all work. Pictures are
  saved for offline use.
- The first manual sync failed with "promise timed out: confirming quota". Cause: the shell's
  SQLite bridge did not accept the short `executeSql(sql, success, error)` form the sync's
  database check uses, and had no `abortAllPendingTransactions`. **Fixed in shell PR #2
  (`9a9789b`)**, with tests; the sync then completes.
- Basic view, Wi-Fi off, cold start: the home board opens, and buttons speak and show their
  pictures. (A first run showed the board but did not test speech; the rerun did.)
- Modern view offline: the board page shows no boards, because it never reads the device copy
  ([#1213](https://github.com/lingolinq/LingoLinq-AAC/issues/1213)). Not a shell defect: reading
  the same board through the app's store offline works.
- Sync errors under load: staging is slow under load, iPads sync with desktop parallelism, and
  the client's timeouts are tight with no retry
  ([#1212](https://github.com/lingolinq/LingoLinq-AAC/issues/1212)).

**Android (Pixel Tablet emulator, API 36), airplane mode:**

- The app opens offline, reads its database, and in Basic view speaks with pictures
  (TextToSpeech `speak` calls logged while in airplane mode).
- Sync is slow: about 5 boards a minute, with each SQLite bridge call taking about 130 ms. A
  Modern view sync failed on the 5-second "reloading root user" limit. A Basic view sync said
  it was complete when only 2 of the home board's 30 linked boards were on the device.
- Tapping a folder whose board is not on the device does nothing visible for about 12 seconds,
  then replaces the board with "Not available offline" (see
  [#1213](https://github.com/lingolinq/LingoLinq-AAC/issues/1213)).
- Cold start offline took about 27 seconds in one run and about 2 seconds in the next; not
  investigated.
- On both emulators the on-screen keyboard does not appear, because the Mac keyboard counts as
  a hardware keyboard. Not an app defect.

**Issues filed from this testing** (all on LingoLinq-AAC, in the shared Ember app):
[#1207](https://github.com/lingolinq/LingoLinq-AAC/issues/1207) (board-detail Predict works once;
Yes on the right), [#1208](https://github.com/lingolinq/LingoLinq-AAC/issues/1208) (the first
offline sync never runs on a new device; sync hidden in Modern view),
[#1209](https://github.com/lingolinq/LingoLinq-AAC/issues/1209) (offline Speak Mode should open
the boards page, not an error), [#1212](https://github.com/lingolinq/LingoLinq-AAC/issues/1212)
(sync timeouts under load), [#1213](https://github.com/lingolinq/LingoLinq-AAC/issues/1213)
(Modern view offline; Go to Home Board does nothing),
[#1214](https://github.com/lingolinq/LingoLinq-AAC/issues/1214) (Basic view collapsed-sidebar
button). Before the first store release, #1208 and #1213 need fixing, since without them a user
can lose their boards offline.

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

1. Merge shell PR #2 and #1185 (in either order).
2. Fix the shared-app offline and sync issues
   ([#1208](https://github.com/lingolinq/LingoLinq-AAC/issues/1208),
   [#1213](https://github.com/lingolinq/LingoLinq-AAC/issues/1213),
   [#1212](https://github.com/lingolinq/LingoLinq-AAC/issues/1212)) and rerun the offline smoke
   test on both platforms after a sync that really completes.
3. Fix native Google sign-in ([#1198](https://github.com/lingolinq/LingoLinq-AAC/issues/1198)),
   opening on sign-in ([#1200](https://github.com/lingolinq/LingoLinq-AAC/issues/1200)), sign-up
   ([#1204](https://github.com/lingolinq/LingoLinq-AAC/issues/1204)) and the top inset
   ([#1202](https://github.com/lingolinq/LingoLinq-AAC/issues/1202)) before the first store build.
4. Store preparation: release signing and versioning, Play Console, the App Store export
   compliance answer, the TTS silent-switch check (item 8), the device database backup and
   encryption settings (items 15 and 27), and the release notes (items 10 to 16).
