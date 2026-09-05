# Share path does not strip `data:` URIs — diagnosis

Branch `traci/fix/restore-speak-options`. Rule #0.12: fact sheet and proposals first, no code.

---

## (a) Where is the value READ? CONFIRMED

`components/share-utterance.js:67-86` — `createRecord('utterance', { button_list: settings.utterance,
…, user_id: app_state.get('referenced_user.id') })`, then `u.assert_remote_urls()` (`:85`), then
`u.save()` (`:86`). Whatever is in `button_list[].image` at `:85` is what gets persisted.

`settings.utterance` is `stashes.get('working_vocalization')` — the RAW list, passed in at
`components/speak-menu.js:485`, `:615`, `components/inbox.js:210`, `controllers/speak-menu.js:59`,
`:123`.

## (b) What are ALL the shapes, and who writes each?

`button_list[].image` is stamped in `utils/utterance.js:597-604` from
`image.get('best_url')`, and `models/image.js:130` is
`data_url || personalized_url || ""`. So the two live shapes are a remote https url and a
**`data:` URI**. (`utils/button.js:561` explicitly anticipates `best.match(/^data:/)`.)

## (c) THE CRUX — the recovery `assert_remote_urls` attempts CANNOT work for a `data:` URI

`assert_remote_urls` (`models/utterance.js:22-39`) tries to map a local value back to its remote
url via `find_remote`, which reverse-scans `persistence.url_cache` for an entry whose VALUE
equals the image string and returns that entry's KEY.

**`url_cache` never holds a `data:` URI as a value.** Two independent places say so, both read
by me:

1. `utils/persistence.js:1812-1821`, the write side:
```js
if(object.local_url) {
  var local_url = capabilities.storage.fix_url(object.local_url, type == 'image');
  persistence.url_cache[url_id] = local_url;   // only a local FILE url is cached
  persistence.url_uncache[url_id] = false;
} else {
  persistence.url_uncache[url_id] = true;      // the data_uri case -> NOT cached
}
```
2. `utils/persistence.js:1318-1320`, the read side, which says it outright:
```js
} else if(data.data_uri) {
  // methinks caching data URIs would fill up memory mighty quick, so let's not cache
  return data.data_uri;
}
```

`object.local_url` is only set when `capabilities.storage.write_file` SUCCEEDS
(`persistence.js:1788-1793`, which also nulls `data_uri` on that path) — i.e. on a native
filesystem. **On web there is no local file url, so the pair is never cached, and
`find_remote` returns the `data:` URI unchanged (`models/utterance.js:29`).**

> **Therefore the failure is not an edge case and not timing-dependent: for a `data:` URI the
> recovery fails 100% of the time, by construction.** `assert_remote_urls` can only ever
> recover `file://`-style local urls, i.e. only on native platforms. Its name promises
> something it structurally cannot deliver on web, which is the primary platform.

## The negated guards are real, but they are NOT the defect

`models/utterance.js:31` and `:35` pass a NEGATED argument:
`!LingoLinq.remote_url(!this.get('image_url'))` and `!LingoLinq.remote_url(!btn.image)`.
`LingoLinq.remote_url = function(url) { return url && url.match(/^http/) && … }`
(`app/frontend/app/app.js:112-114`), so it receives `false`, short-circuits, returns `false`,
and `!false` is `true`. **The guard is true for every non-empty image, remote ones included.**

But fixing ONLY the guard changes nothing observable: `find_remote` passes non-matching values
through unchanged (`:29`), so running it on a remote url is a no-op today. The guard is a
correctness/clarity defect; the LEAK is the missing action when recovery fails. A fix that
corrects the `!` and stops there would look right and ship the leak. **Say this explicitly in
any proposal.**

## Still open, delegated
- Ranked reachability: which real conditions produce a `data:` URI in `best_url` at share time.
- Server side: ingestion, `generate_defaults` -> `image_url`, the `original_image` repair loop,
  what `lib/json_api/utterance.rb` serves, whether the share link is authenticated, SentencePic,
  and DB/size consequences of an inline base64 blob in a `secure_serialize` column.

---

# STOP — a CRITICAL finding turned up while tracing this, and it is not the leak

## Command injection in the utterance preview worker

**CONFIRMED by execution, not by reading.**

`lib/sentence_pic.rb:32-35` builds a shell fragment from a user-supplied label:
```ruby
label = (button['label'] || button['vocalization'] || '').gsub("\"", "\\\"")
...
image_commands << "-label \"#{label}\" #{filename}"
```
and `:38` runs it through **backticks**, i.e. a shell:
```ruby
`montage #{image_commands.join(' ')} -tile … #{montage}`
```

The `gsub` escapes double quotes ONLY. `$` and backtick are untouched, and inside a
double-quoted shell string both still execute. Demonstrated:
```
raw label : $(id) and `whoami`
after gsub: $(id) and `whoami`
shell frag: -label "$(id) and `whoami`" /tmp/file.png
```

**Reachability — every link CONFIRMED, and it is fully automatic:**
1. `api/utterances_controller.rb:17-32` — `utt_data.permit!`, no validation.
2. `app/models/utterance.rb:331` — `self.data['button_list'] = params['button_list']`, raw.
   The model declares **zero** `validates`.
3. `app/models/utterance.rb:14` — `after_save :generate_preview_later`
4. `:63-68` — schedules `generate_preview` whenever `large_image_url_attempted` is unset
5. `:50` — `SentencePic.generate(self)` -> the backticks above.

So **any authenticated user who can create an utterance can execute shell commands in the
background worker**, with no further interaction — sharing a sentence is a core end-user
action. `label` is attacker-controlled free text.

This is a different unit from the `data:` URI leak and MUST NOT be bundled with it (rule
#0.15). It outranks it.

---

# CORRECTIONS TO MY OWN DIAGNOSIS ABOVE

## 1. I cited the WRONG MODULE. (rule #0.13(c))

`utils/persistence.js` ends in a **Proxy** that forwards every property to
`window.persistence` — the Ember service — falling back to its own target only when the
service is absent. `models/utterance.js:5` imports that proxy, so `persistence.url_cache` at
runtime is **`services/persistence.js`'s** cache, not `utils/`'s. The two files are near
duplicates (4666 vs 4789 lines), which is why the code I read looked right.

**The MECHANISM is unchanged — I re-verified it in the live module:**
- `services/persistence.js:1280-1282` — `else if(data.data_uri) { /* let's not cache */ return data.data_uri; }`
- `services/persistence.js:1776-1784` — `url_cache` is written only `if(object.local_url)`;
  otherwise only `url_uncache` is set.
Correct citations are these; strike the `utils/persistence.js` line numbers above.

## 2. I OVERSTATED the reachability. The leak is real but NARROW.

I wrote "for a `data:` URI the recovery fails 100% of the time, by construction." The first
half is right — a `data:` URI is never a `url_cache` value, so recovery cannot succeed. But I
implied that means it leaks on web generally. **It does not**, because in the common web case
a `data:` URI never gets into `best_url` at all:

- **Default web session: NOT A LEAK.** Every `store_url` caller sits inside `sync`, and
  `auto_sync` defaults to `!!capabilities.installed_app` (`app-state.js:2262-2263`). With no
  sync there is no `dataCache`/`url_uncache` entry, so `find_url` REJECTS, `data_url` stays
  null, and `best_url` is the remote `personalized_url`.
- **Healthy installed app: NOT A LEAK.** The filesystem write succeeds, `url_cache` is
  populated with a file url, and `find_remote` recovers the remote key correctly. The
  mechanism works as designed.
- **THE LEAK NEEDS a `dataCache` row holding `data_uri` with no `local_filename`/`local_url`.**
  Ranked: (1) installed app that has hit a filesystem quota/permission failure — MEDIUM, and
  **self-sustaining**, because the failure path persists `allow_local_filesystem_request =
  false` so every later `store_url` takes the data-uri branch; (2) web with sync manually
  enabled AND no FileSystem API (Firefox/Safari/incognito) — LOW-MEDIUM; (3) an image created
  offline and shared before its push lands — LOW.

That is a materially smaller blast radius than "on web, the primary platform". The finding
stands; my characterisation of it did not.

## 3. A TRAP for the fix — do not just move the `!`

`capabilities.js:1594-1598` rewrites local file urls on installed iOS to
`location.protocol + "//" + location.host + "/local-filesystem/…"`. If `location.protocol` is
`https:`, that value **passes `remote_url()`** (it matches `^http`, and the localhost exclusion
is `^http:\/\/localhost`, http-only). Those values DO land in `url_cache`, so today the broken
always-true guard still runs `find_remote` on them and maps them back correctly.
**Correcting the guard would skip them and save a localhost url into the shared record.**
Whether iOS serves over `https:` here is PLAUSIBLE, not confirmed — check before touching
that line. This is the second time on this branch that an "obviously correct" one-character
fix would have introduced a new defect.

## 4. Server side — CONFIRMED, no mitigation, and the HTML path is worse than the API path
- `api/utterances_controller.rb:2` — `before_action :require_api_token, :except => [:show, :reply]`.
  `show` is **unauthenticated**; `add_permissions('view', ['*']) { true }` (`utterance.rb:16`)
  is always true, and `accessible_for?` returns true for any non-`private_only` utterance.
- `lib/json_api/utterance.rb:12` serves the **entire raw `button_list`**; `:18` serves `image_url`.
- `boards_controller.rb:150-154` (`GET /utterances/:id`, `config/routes.rb:110`) has **no auth,
  no `allowed?`, and no `private_only` check at all** — strictly weaker than the API path — and
  renders `image_url` into `og:image`/`twitter:image`.
- The repair loop `utterance.rb:333-338` requires `original_image` to be present, and the raw
  shared list never carries one. It also raises `NoMethodError` if `image` is nil.
- Narrowing factor, stated fairly: ids carry a nonce (`protect_global_id`, `:9`), so they are
  not enumerable — this is link-possession, not open enumeration.
