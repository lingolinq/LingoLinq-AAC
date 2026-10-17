/*
 * Chooses which half of the suite a CI shard runs, from `?pool=include` or `?pool=exclude` on
 * the test page URL (`ember test --query pool=include`). Without the parameter it returns null
 * and the run is untouched, so local runs and the single build-and-test job are unaffected.
 *
 * Why not `ember test --filter`: ember-cli lowercases the filter
 * (node_modules/ember-cli/lib/commands/test.js, buildTestPageQueryString) and the full pool as a
 * URL parameter exceeds the test server's 16 KB request-header limit. Built here, the filter is
 * exact and case-sensitive.
 */

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

// QUnit applies the filter to each test's full name, `module: test`. The include and exclude
// filters are exact negations of each other (QUnit's leading `!`), so every test runs in
// exactly one shard.
export function poolFilter(moduleNames, exclude) {
  const pattern = '/^(?:' + moduleNames.map(escapeRegExp).join('|') + '): /';
  return (exclude ? '!' : '') + pattern;
}

export function poolSelection(search, moduleNames) {
  const mode = new URLSearchParams(search || '').get('pool');
  if (mode === 'include') {
    return poolFilter(moduleNames, false);
  }
  if (mode === 'exclude') {
    return poolFilter(moduleNames, true);
  }
  if (mode !== null) {
    throw new Error("Unknown ?pool= value '" + mode + "': expected include or exclude");
  }
  return null;
}
