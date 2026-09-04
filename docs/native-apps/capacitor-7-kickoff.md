# Capacitor 7 kickoff + offline boards

Sibling shell: [`lingolinq_mobile`](file:///home/melis/repos/lingolinq_mobile) (`com.lingolinq.app`).  
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

`capacitor.config.json` sets `CapacitorSQLite.androidIsEncryption` / `iosIsEncryption` to `false` for unencrypted MVP DBs.

## Manual smoke (definition of done)

1. Fresh install → login → wait for sync (`settings.lastSync`).
2. Console: shim ready; **no** `should be using sqlite but using indexeddb instead`.
3. Confirm `dataCache` / board rows + files under Data for several board images.
4. Airplane mode → cold start → home board speak with local symbols.
5. Online again → sync does not wipe local set.

Free-disk warning may no-op (Filesystem has no portable free-space API); acceptable for MVP.

## Related docs

- [native-bridge-inventory.md](./native-bridge-inventory.md) — rows 1–2 status
- Shell README offline section — `lingolinq_mobile/README.md`
