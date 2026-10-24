# Capacitor 7 kickoff + offline boards

> **2026-10-23: the shell is moving to Capacitor 8.** Google Play requires new apps and app
> updates to target Android 16 (API level 36) from August 31, 2026
> ([Play target API requirement](https://support.google.com/googleplay/android-developer/answer/11926878)),
> and Capacitor 7 can only target API 35
> ([Capacitor target SDK](https://capacitorjs.com/docs/android/setting-target-sdk)). The
> offline design below is unchanged by the move and the shell's `www/` bridges are not
> rewritten. Building the shell now needs Node 22+, JDK 21+, Android SDK platform 36 and, for
> iOS, Xcode 26 ([Capacitor 8 upgrade guide](https://capacitorjs.com/docs/updating/8-0)); the
> shell README lists them once the Capacitor 8 change merges. The "Manual smoke" section below is also the
> definition of done for the Capacitor 8 move. This file keeps its name because other docs
> refer to it. Plan: [capacitor-8-stop1-handoff.md](./capacitor-8-stop1-handoff.md). Progress:
> [2026-10-23_capacitor-8-move.md](../task-management/2026-10-23_capacitor-8-move.md).

Sibling shell: [`lingolinq/lingolinq_mobile`](https://github.com/lingolinq/lingolinq_mobile) (`com.lingolinq.app`).\
Monorepo branch: `feat/melissa-capacitor-7-kickoff`.

## Offline MVP (this pass)

**Goal:** After online login + one full sync, airplane mode + cold start still opens the home board and speaks with cached symbols.

| Layer | Mechanism |
|-------|-----------|
| SQLite | Shell `www/sqlite_bridge.js` exposes Cordova-shaped `window.sqlitePlugin` over `@capacitor-community/sqlite`. Ember `dbman.setup_database` then selects `sqlite_plugin`. |
| Files | Shell `www/filesystem_bridge.js` exposes `window.file_storage` over `@capacitor/filesystem` + `Capacitor.convertFileSrc` for speak-mode image/audio URLs. |
| Ember backup | `app/frontend/app/utils/capacitor_bridge.js` (+ sqlite/filesystem shims) installs the same globals when packaging a monorepo Ember build; no-ops if shell already installed them. |
| Cordova path | Unchanged (`cordova.file` / `resolveLocalFileSystemURL`) for `coughdrop_mobile` reference builds. |

**Out of scope:** Cordova→Capacitor data migration, supervisee/tag/log offline parity, custom `LingoLinqMisc`, IAP, eye-gaze, Acapela.

## Shell setup

```bash
cd /path/to/lingolinq_mobile
npm install   # includes @capacitor-community/sqlite, @capacitor/filesystem
npm run sync:android:local   # or sync:android for prod API
# confirm bridges before app.js
grep -E 'sqlite_bridge|filesystem_bridge' www/index.html
grep api_host www/init.js
adb reverse tcp:5000 tcp:5000   # local API
```

`capacitor.config.json` holds the `CapacitorSQLite` encryption options (`androidIsEncryption` / `iosIsEncryption`); their release setting requires internal privacy and security sign-off.

## Manual smoke (definition of done)

1. Fresh install → login → wait for sync (`settings.lastSync`).
2. Console: shim ready; **no** `should be using sqlite but using indexeddb instead`.
3. Confirm `dataCache` / board rows + files under Data for several board images.
4. Airplane mode → cold start → home board speak with local symbols.
5. Online again → sync does not wipe local set.

Free-disk warning may no-op (Filesystem has no portable free-space API); acceptable for MVP.

## Related docs

- [native-bridge-inventory.md](./native-bridge-inventory.md) — rows 1–2 status
- Shell README offline section — [`lingolinq_mobile/README.md`](https://github.com/lingolinq/lingolinq_mobile/blob/master/README.md)
