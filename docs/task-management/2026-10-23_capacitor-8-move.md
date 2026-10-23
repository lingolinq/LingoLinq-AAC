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
- README and `package.json` description updated. `www/` untouched.

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
`capacitor-7-kickoff.md` updated (kickoff keeps its name: a task log and the learnings
archive link to it). `.github/copilot-instructions.md`, `CLAUDE.md`, `AGENTS.md` and
`app/frontend/README.md` need no change.
