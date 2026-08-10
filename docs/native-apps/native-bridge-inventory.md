# Native Bridge Inventory (Phase 1 artifact)

**Status:** Authoritative inventory for the Cordova -> Capacitor 7 migration. Read-only,
grep-driven from the codebase at `scot/feat/native-apps`.
**Why this is a gate item:** every place the web app talks to a native shell that is missed
here becomes a silently broken capability after the migration. This is the exhaustive list
the strategy doc's section 6 matrix only sampled. All entries cite `file:line`.

**How to read the "Cordova-gated?" column:** YES means the code path is guarded on
`window.cordova` (or a Cordova plugin global) and therefore **silently no-ops** unless an
equivalent Capacitor plugin or web fallback is wired up. Those are the migration's hidden
landmines.

---

## 0. Build-system precondition: `lib/domains.json` is missing

`extras:desktop` (`lib/tasks/extras.rake:407-508`) and `extras:mobile`
(`lib/tasks/extras.rake:515+`) both read `lib/domains.json` to drive the sibling shell-folder
layout (assets are copied to `../<folder>/www/`). **That file is absent in the worktree**
(referenced at `extras.rake:408` and `:516`), so the legacy build pipeline cannot run as-is.
Phase 1 must recreate or replace it (PROJECT.md already lists this). The build tasks also
assume the Cordova/Electron shells exist as sibling directories one level up; those shells
are not yet forked under the LingoLinq org.

---

## 1. The 5 CRITICAL bridges (the real migration engineering)

These have no drop-in Capacitor equivalent or carry data-loss / revenue risk. Plan each
explicitly before committing to the full migration (Phase 2 spike).

| # | Capability | Evidence (file:line) | Cordova today | Capacitor 7 target | Risk note |
|---|-----------|----------------------|---------------|--------------------|-----------|
| 1 | **SQLite offline storage** | `dbman.js:538-541`, `632-678` | `window.sqlitePlugin` (cordova-sqlite-storage) | **MVP wired (2026-08):** Cordova-shaped shim via shell `lingolinq_mobile/www/sqlite_bridge.js` + Ember `capacitor_sqlite_shim.js` over `@capacitor-community/sqlite`. `dbman` still selects `sqlite_plugin`. | Core offline feature. Fresh Capacitor installs start empty (no Cordova DB migration this pass). IndexedDB fallback remains if shim missing — not AAC-ready. |
| 2 | **File system (app + data dirs)** | `capabilities.js:1262-1267`, `1420-1430`, `1671+`, `1723-1732`; `button.js:1165` | `window.resolveLocalFileSystemURL` + `cordova.file.applicationDirectory` / `dataDirectory` (cordova-plugin-file) | **MVP wired (2026-08):** `window.file_storage` via shell `filesystem_bridge.js` / Ember `capacitor_filesystem_shim.js` (`Directory.Data` + `convertFileSrc`). Bundled `www/` reads use `fetch` on Capacitor (`local_json`). Cordova path unchanged. | Local board/image/sound storage for offline speak. Free-disk check is a sentinel no-op on Capacitor. |
| 3 | **Custom `LingoLinqMisc` Cordova bridges** | `capabilities.js:678-687`, `788-800`, `961-1011`, `1420-1430`, `2077-2078` | `window.cordova.exec('LingoLinqMisc', ...)`: `bundleId`, `listApps`, `listFiles`, `setAudioMode`/`getAudioDevices`, `toggleKeyboardAccessoryBar` | **No Capacitor equivalent.** Must be rewritten as custom Capacitor plugins (native Obj-C/Swift + Java/Kotlin) | Audio routing (hearing-aid/headset), bundle-ID detection (drives IAP SKUs), keyboard accessory. This is new native code in the shell repos. |
| 4 | **CanvasCamera (head-tracking / eye-gaze)** | `capabilities.js:519-591`, `605-668`; weblinger at `354-515`; `eval_gazer.js:10-68` | `window.plugin.CanvasCamera` (cordova-plugin-canvas-camera) feeding WebGazer/weblinger at 30fps | **No Capacitor equivalent.** `@capacitor/camera` + `getUserMedia` to canvas, or a custom plugin; expect a performance hit | Major accessibility feature. The single hardest capability. Decide v1 scope in Phase 1 (PROJECT.md open question). |
| 5 | **In-app purchase / billing** | `subscription.js:810-1011` (SKU registration uses bundle ID at `989-1011`) | `window.store` (cordova-plugin-purchase) wrapping StoreKit / Play Billing | `@capacitor-community/in-app-purchase` (different event model) | Revenue path. Coupled to the IAP-exposure gate decision and to bundle-ID detection (#3). If monetization goes B2B-only, this may be scoped down. |

---

## 2. HIGH-risk bridges

| Capability | Evidence (file:line) | Cordova today | Capacitor target | Cordova-gated? | Note |
|-----------|----------------------|---------------|------------------|----------------|------|
| **Native TTS (iOS + Windows)** | `speecher.js:74-76`, `108-109`, `861-894`, `1344-1347`; `capabilities.js:1031-1040`; `tts_voices.js:1097` | `window.TTS` (cordova-plugin-tts on iOS); `window.extra_tts` / Electron bridge on Windows; Acapela premium voices | Web Speech API or a custom Capacitor TTS plugin; Acapela voice management needs a native plugin | YES (iOS); Electron on desktop | Premium Acapela voices degrade to low-quality SpeechSynthesis without the native bridge. Voice download/delete is desktop-only. |
| **Android runtime permissions** | `capabilities.js:714-780` | `cordova.plugins.permissions` (RECORD_AUDIO, NFC, WAKE_LOCK, GEOLOCATION, CAMERA, WRITE_EXTERNAL_STORAGE, VIBRATE) | Capacitor Permissions API (built-in) | YES | Gate for mic/camera. Test all permission types on real Android. |
| **Keyboard control** | `capabilities.js:308-310`; `scanner.js:749-752`, `887-930`; `preferences.js:721-723`; `app-state.js:3847` | `window.Keyboard` show/hide/hideFormAccessoryBar (cordova-plugin-keyboard) | `@capacitor/keyboard` (different method names) | YES | Scanner-mode UX depends on it; on-screen keyboard otherwise overlaps buttons. |

---

## 3. MEDIUM-risk bridges

| Capability | Evidence (file:line) | Cordova today | Capacitor target | Cordova-gated? |
|-----------|----------------------|---------------|------------------|----------------|
| iOS iCloud key-value store | `app.js:139-182` | `cordova.exec` -> `iCloudKV`; localStorage fallback | `@capacitor/preferences` + secure storage | YES |
| Device info (model/UUID) | `capabilities.js:244-260`; `extras.js:138`; `subscription.js:842` | `window.device` (cordova-plugin-device) | `@capacitor/device` | YES |
| Audio recording | `content-grabbers.js:1603-2022`; `media_recorder.js:1-177` | `getUserMedia` + `MediaRecorder` polyfill; Android perms Cordova-gated | Web standard + `@capacitor/core` permissions on Android | PARTIAL |
| getUserMedia (camera/mic) | `content-grabbers.js:1603-1984` | `navigator.mediaDevices.getUserMedia`; Android perms via Cordova | Web standard; HTTPS required | PARTIAL |
| App launching (intent/URI) | `capabilities.js:689-711` | `window.plugins.launcher` (cordova-plugin-app-launcher) | `@capacitor/app-launcher` | YES |
| InAppBrowser | `capabilities.js:2142-2143` | `cordova.InAppBrowser` (cordova-plugin-inappbrowser) | `@capacitor/browser` | YES |
| Native head-tracking/eye-gaze calibration | `capabilities.js:449-515`, `605-668` | optional native calibration bridge; weblinger fallback | depends on #4 (CanvasCamera) | YES (native path) |
| Audio device routing | `capabilities.js:961-1010` | `LingoLinqMisc` `setAudioMode`/`getAudioDevices` | custom plugin (see #3) | YES |

---

## 4. LOW-risk bridges (mostly mechanical swaps or graceful degradation)

| Capability | Evidence (file:line) | Cordova today | Capacitor target | Cordova-gated? |
|-----------|----------------------|---------------|------------------|----------------|
| Battery status | `capabilities.js:1887-1889` | `cordova.exec('Battery', ...)` (Android) | `@capacitor/device` battery info | YES |
| Screen brightness (read) | `capabilities.js:1989-1991` | `cordova.plugins.brightness` | community plugin | YES |
| Silent/mute detection (iOS) | `capabilities.js:1799-1800` | `cordova.plugins.SilentMode` | iOS-specific plugin / native | YES |
| NFC read/write | `capabilities.js:801-958` | `window.nfc` + `window.ndef` (cordova-plugin-nfc) | `@capacitor-community/nfc` | YES |
| Social sharing | `capabilities.js:1144-1247` | `plugins.socialsharing` | `@capacitor/share` | YES |
| Clipboard | `capabilities.js:1144-1247` | `cordova.plugins.clipboard` | `@capacitor/clipboard` | YES |
| App-store rating | `capabilities.js:332-346` | `window.LaunchReview` | community rate-app plugin | YES |
| List installed apps | `capabilities.js:678-687` | `LingoLinqMisc` `listApps` (Android) | custom plugin (see #3) | YES |
| Keyboard accessory bar (iOS) | `capabilities.js:2077-2078` | `LingoLinqMisc` `toggleKeyboardAccessoryBar` | custom plugin (see #3) | YES |
| Vibration / haptics | `capabilities.js:782-786` (NFC at `923`) | `navigator.vibrate`; Android perm Cordova-gated | `@capacitor/haptics` | PARTIAL |
| Error reporting | `button.js:1165`; `content-grabbers.js:1552`, `2199`, `2582` | `lingoLinqExtras.track_error` (Electron/Cordova) | wire to Sentry / Capacitor logging | YES |

---

## 5. Electron desktop bridges (`window.lingoLinqExtras`), stay on Electron

These are NOT migrating to Capacitor (desktop stays Electron), but they must be preserved
when the Electron shell is refreshed in Phase 4:

| Capability | Evidence (file:line) | What it does |
|-----------|----------------------|--------------|
| IPC extension messages | `capabilities.js:95-96` | `lingoLinqExtras.extension_message()` to the Electron main process |
| Electron TTS bridge | `vendor/speech/speech.js:240-241` | `lingoLinqExtras.tts.speak()` (Windows SAPI / macOS AVSpeech) |
| Acapela voice management | `capabilities.js:1031-1040`; `tts_voices.js:1097` | `window.extra_tts` voice download/delete, version tracking |
| Error tracking | `button.js:1165` et al. | `lingoLinqExtras.track_error()` |
| Build-time version patching | `extras.rake:407-508` | patches `application-preload.js`, Electron `package.json`, `www/init.js` |

---

## 6. Browser-standard APIs (no native plugin; verify under WKWebView)

IndexedDB (`dbman.js:525-545`), `getUserMedia`, `MediaRecorder` (polyfilled,
`media_recorder.js`), `speechSynthesis` (polyfilled via `vendor/speech/speech.js` +
`services/speech-output.js:23-82`), `navigator.vibrate`, `Notification`. These work in the
Capacitor WKWebView but should be smoke-tested; Capacitor's WKWebView generally handles
IndexedDB better than Cordova's old webview.

---

## 7. Capabilities that silently no-op without a plugin (the regression watchlist)

Because these are `window.cordova`-gated, they fail invisibly after migration unless ported.
Verify each in the Phase 2 spike before submission:

iCloud KV (login state), native TTS / Acapela, file system (offline boards/assets),
keyboard hide/show, keyboard accessory bar, audio output routing, battery, brightness,
silent-mode detection, NFC, social sharing, clipboard, app-store rating, app launcher,
list-apps, device info, bundle-ID detection (breaks IAP SKUs), InAppBrowser, CanvasCamera
(breaks eye-gaze/head-tracking), in-app purchase.

---

*Source: full read of `capabilities.js` (2527 lines), the six anchor files, a broad grep
sweep of `app/frontend/` for 30+ native patterns, and `lib/tasks/extras.rake`. Read-only,
no edits. The Capacitor-target column draws on the strategy doc section 6 and current
Capacitor plugin availability; re-verify plugin names/versions at Phase 2 planning per the
SaaS-freshness rule.*
