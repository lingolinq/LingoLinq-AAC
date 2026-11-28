# Picture grabber remote-image test

GitHub #1101. The test reads `editManager.stashedImage` (`edit_manager.js` `stash_image` writes that field; the postMessage handler at `edit_manager.js` also reads it).

The test before it stashes `{url: 'data:image/png'}`. This test's `waitsFor` accepted that leftover, so it passed without the proxy fetch in `content-grabbers.js` `edit_image_preview`.

Fix: set `editManager.stashedImage = null` before calling `edit_image_preview`, matching the neighbour test. The ajax stub stays. Removing the `http` fetch made the assertion see `http://www.picture.com` instead of `data:image/png`. The fetch was restored from a copy.
