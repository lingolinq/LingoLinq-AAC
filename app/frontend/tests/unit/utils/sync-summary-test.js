import { module, test } from 'qunit';
import { summary_text, summary_parts, size_label, counter_lines } from 'frontend/utils/sync_summary';

/* SYNC DETAILS' SUMMARY LINE (item 0.1; Traci 2026-11-20/21): plain words about the sync the cards describe, said only
 * from what its log entry holds. No percentages. */
module('Unit | Utility | sync summary', function() {
  function counters(extra) {
    return Object.assign({ started: 1700000000000, seconds: 125, requests: 400, peak: 6, open_at_end: 0, received_chars: 90000,
      failures: { timeout: 0, offline: 0, limited: 0, server: 0, refused: 0, storage: 0, supervisee: 0, other: 0 },
      boards: { fetched: 12 }, pictures: { saved: 340, bytes: 17600000 }, sounds: { saved: 0, bytes: 0 } }, extra || {});
  }
  function rows(downloaded, cached) {
    var out = [];
    for(var i = 0; i < downloaded; i++) { out.push({ id: 'd' + i, key: 'me/d' + i, status: i % 2 ? 're-downloaded' : 'downloaded' }); }
    for(var j = 0; j < cached; j++) { out.push({ id: 'c' + j, key: 'me/c' + j, status: 'cached' }); }
    return out;
  }
  function summary(entry, extra) {
    return Object.assign({ entry: entry, overall: { pictures_missing: [] } }, extra || {});
  }

  test('a finished sync: how long, what it downloaded, what could not be saved', function(assert) {
    var s = summary({ statuses: rows(12, 49), counters: counters() }, { overall: { pictures_missing: ['Food'] } });
    assert.strictEqual(summary_text(s), "Took 2 minutes · 12 boards and 340 pictures downloaded (18 MB) · 1 picture couldn't be saved");
  });

  test('boards downloaded are the ones the server sent, not rows marked downloaded', function(assert) {
    // A repeat sync marks boards loaded earlier in the session "downloaded" without fetching them (2026-11-22 run).
    var s = summary({ statuses: rows(60, 2), counters: counters({ seconds: 9, boards: { fetched: 0 }, pictures: { saved: 0, bytes: 0 } }) });
    assert.strictEqual(summary_text(s), 'Took less than a minute · Nothing new to download');
  });

  test('an entry from an older build (no counters) claims no downloads', function(assert) {
    assert.strictEqual(summary_text(summary({ statuses: rows(4, 10) })), null, 'its rows cannot show what was fetched');
    assert.strictEqual(summary_text(summary({ statuses: rows(4, 10) }, { overall: { pictures_missing: ['Food'] } })), "1 picture couldn't be saved", 'but its rows do show this');
  });

  test('a repeat sync with nothing new says so', function(assert) {
    var s = summary({ statuses: rows(0, 61), counters: counters({ seconds: 9, boards: { fetched: 0 }, pictures: { saved: 0, bytes: 0 } }) });
    assert.strictEqual(summary_text(s), 'Took less than a minute · Nothing new to download');
  });

  test('a stopped sync says it stopped and never "nothing new"', function(assert) {
    var s = summary({ statuses: rows(0, 3), counters: counters({ seconds: 600, boards: { fetched: 0 }, pictures: { saved: 0, bytes: 0 } }) }, { unfinished: true, stopped: true });
    assert.strictEqual(summary_text(s), 'Stopped after 10 minutes');
  });

  test('nothing while a sync runs (no entry yet)', function(assert) {
    assert.deepEqual(summary_parts({ unfinished: true, overall: { pictures_missing: [] } }), []);
    assert.strictEqual(summary_text(null), null);
  });

  test('sounds and communicators whose sync failed are named', function(assert) {
    var c = counters({ seconds: 4000, boards: { fetched: 1 }, sounds: { saved: 3, bytes: 30000 }, failures: { timeout: 0, offline: 0, limited: 0, server: 0, refused: 0, storage: 0, supervisee: 2, other: 0 } });
    var text = summary_text(summary({ statuses: rows(1, 0), counters: c }));
    assert.strictEqual(text, "Took 1 h 7 min · 1 board and 340 pictures downloaded (18 MB) · 3 sounds downloaded · Boards for 2 communicators couldn't sync");
  });

  test('sizes', function(assert) {
    assert.strictEqual(size_label(16000), '16 KB');
    assert.strictEqual(size_label(10), '1 KB');
    assert.strictEqual(size_label(2400000), '2.4 MB');
    assert.strictEqual(size_label(17600000), '18 MB');
    assert.strictEqual(size_label(2100000000), '2.1 GB');
    assert.strictEqual(size_label(undefined), '1 KB');
  });

  test('technical details list every counter, and nothing for an old entry', function(assert) {
    var lines = counter_lines({ counters: counters({ failures: { timeout: 2, offline: 0, limited: 0, server: 1, refused: 0, storage: 0, supervisee: 0, other: 0 } }) });
    assert.strictEqual(lines.length, 8);
    assert.ok(lines.some(function(l) { return l === 'Requests: 400 (at most 6 at once, 0 still open at the end)'; }));
    assert.ok(lines.some(function(l) { return l === 'Failures: timeout 2, server 1'; }));
    assert.deepEqual(counter_lines({}), []);
  });

  test('no percentage anywhere', function(assert) {
    var text = summary_text(summary({ statuses: rows(12, 49), counters: counters() }, { overall: { pictures_missing: ['a', 'b'] } }));
    assert.notOk(/%/.test(text));
  });
});
