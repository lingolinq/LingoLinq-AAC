# iOS run of #1212 against staging (for Traci's Mac)

Goal: one first sync of a large staging account in the installed iOS app, built from PR #1268 (head
`d1d547985`), on the iOS Simulator, and the same on a real iPad if one is at hand. Report: did it finish, how
long, how many boards, how many errors, and the error texts. That is the iOS half of #1212's first criterion.

Time: about 25 minutes the first time (Xcode build), 10 minutes after.

## What to copy to the Mac

This folder is on the branch `chore/traci-ios-staging-run-bundle-2026-11-10` (pull it on the Mac; it is a throwaway branch that holds a built bundle, not for merging; delete it when the run is done). The same files are at `/home/tracid/offline-sync-handoff/ios-run/` on the WSL machine. It holds:

- `application-local.js`: the PR's frontend, assembled the way Rails serves it (built from `d1d547985` on
  2026-11-10). This is the one thing staging and production do NOT have, so the bundle must come from here;
  `PACKAGE_SOURCE=prod` would download the live site's older code.
- `application-local.css`: its stylesheet.
- this file.

Any way is fine (AirDrop from the Windows side, a USB stick, `scp`); they total about 15 MB.

## On the Mac

Prerequisites, all already in place if you built the shell before: Xcode 26+, CocoaPods, Node 22, a checkout
of `lingolinq_mobile` (branch `main`, at or after `90b04fd`), and a checkout of the monorepo (any recent
branch is fine: only `public/images`, `public/fonts`, `public/icons` and `public/locales` are read from it).

1. Make a scratch "LingoLinq root" that holds the PR bundle plus the public files:

   ```bash
   mkdir -p ~/ll-ios-run/public/assets
   cp /path/to/LingoLinq-AAC/docs/task-management/2026-11-10_ios-staging-run/application-local.* ~/ll-ios-run/public/assets/
   for d in images fonts icons locales; do ln -s /path/to/LingoLinq-AAC/public/$d ~/ll-ios-run/public/$d; done
   ```

   Replace `/path/to/LingoLinq-AAC` with the monorepo checkout on the Mac.

2. Package the shell against staging and sync the iOS project:

   ```bash
   cd /path/to/lingolinq_mobile
   npm install
   LINGOLINQ_ROOT=~/ll-ios-run LINGOLINQ_API_HOST=https://staging.lingolinq.com ./bin/package_from_lingolinq
   grep api_host www/init.js          # must say https://staging.lingolinq.com
   npx cap sync ios
   npx cap open ios
   ```

   `package_from_lingolinq` prints "Packaged local .../application-local.js and .../application-local.css"; if it
   complains about a missing bundle, the files are not under `~/ll-ios-run/public/assets/`.

3. In Xcode: choose an iPad simulator (iPad Pro 11-inch or the one you usually test on), Product > Run. Wait
   for the app's sign-in page. For a real iPad instead: plug it in, choose it as the run destination, sign the
   App target with your team in Signing & Capabilities, Product > Run; iPadOS asks once to trust the developer
   profile under Settings > General > VPN & Device Management.

4. If the app has been installed before on that simulator, reset it first so this is a first sync: Simulator
   menu Device > Erase All Content and Settings, then Product > Run again. On a real iPad: delete the app
   and run again.

5. Sign in with the staging account that has the large board set (the demo account, or the one you used on
   2026-10-27). Choose "Trust this Device" if asked.

6. Open Safari's Web Inspector on the app: Safari > Develop > [the simulator or iPad name] > LingoLinq >
   the page. (If Develop is missing: Safari > Settings > Advanced > "Show features for web developers". On a
   real iPad also turn on Settings > Safari > Advanced > Web Inspector.)

7. In the inspector's Console, paste this and press Return. It starts a sync if one is not already running,
   waits for it to finish, and prints the report. It can take several minutes; leave the app in the foreground.

   ```js
   (function () {
     var p = window.persistence, t0 = Date.now();
     var status = function () { return p.get('sync_status'); };
     if (status() !== 'syncing') { p.sync('self').then(null, function () {}); }
     var started = status() === 'syncing' ? 'already running' : 'started now';
     var wait = function () {
       if (['succeeded', 'finished', 'failed'].indexOf(status()) === -1) { return new Promise(function (r) { setTimeout(r, 2000); }).then(wait); }
       var log = p.get('sync_log') || [], last = log[log.length - 1] || {}, st = last.statuses || [], by = {}, errs = [];
       st.forEach(function (s) { by[s.status || 'none'] = (by[s.status || 'none'] || 0) + 1; if (s.error) { errs.push(String(s.error).slice(0, 160)); } });
       return window.lingoLinqExtras.storage.find_all('board').then(function (rows) { return rows.length; }, function () { return 'unreadable'; }).then(function (rows) {
         var out = { sync: started, status: status(), seconds: Math.round((Date.now() - t0) / 1000), summary: last.summary,
           boards_in_log: st.length, by_status: by, errors: errs.length, error_texts: errs, board_rows_on_device: rows,
           storage: window.capabilities.dbman && window.capabilities.dbman.db_type, system: window.capabilities.system, mobile: window.capabilities.mobile };
         console.log(JSON.stringify(out, null, 1));
         return out;
       });
     };
     return wait();
   })();
   ```

   What to copy back: the printed JSON block. The useful lines are `status`, `seconds`, `boards_in_log`,
   `by_status`, `errors`, `error_texts` and `board_rows_on_device`. `mobile` should print `true` (#1201: iPads
   use the mobile parallelism), `system` prints what the app thinks the device is.

8. Optional, the offline check: Simulator menu Device > Toggle Network Link Conditioner is not enough; instead
   turn the Mac's Wi-Fi off, quit the app (swipe up in the simulator's app switcher), run it again from Xcode,
   and see whether the home board opens with its buttons. Turn Wi-Fi back on afterwards.

## What to send back

Paste the JSON block (step 7) and say which simulator or iPad, and which account, into the chat or on #1212.
If the sync ends with errors, the `error_texts` say which boards and why; that is the data the issue needs.

## Why these steps and not `npm run sync:ios:local`

That script downloads the LIVE site's bundle (`PACKAGE_SOURCE=prod`), which does not have this PR's sync
changes, and points the app at a local server. The run above uses the PR's bundle and staging's API.
