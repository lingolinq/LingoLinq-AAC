'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Flags an entry in an `actions: { }` block whose name is never referenced as a
 * string anywhere in app/.
 *
 * Why this exists: the board-detail redesign moved nine board actions onto an
 * edit-mode-only panel and left the old menu's actions behind, still shipping
 * but unreachable (toggle_share_dropdown, open_board_picker, toggleSetHomeMode,
 * details_dropdown_keydown, and board-detail's own copy_board). The same shape
 * hid the speak-bar features that ship in the bundle but appear in no menu.
 * Both were found by outside usability review, months later. See
 * docs/task-management/CLAIM-CHECK-BACKLOG.md section G.
 *
 * DELIBERATELY PERMISSIVE. The index counts *any* exact-match quoted string in
 * any .hbs or .js file under app/ as a call site. That is looser than real
 * reachability, and it is the right trade:
 *
 *   - This repo has no single action-invocation form to match on. Templates use
 *     per-component factories -- `ctrlAction`, `selfAction`, `eventAction`,
 *     `chipAction` (sentence-bar-chip.hbs:24) -- plus classic {{action}},
 *     `send()`, and `data-bd-action=` attributes. A rule that enumerated them
 *     would silently miss the next one somebody invents.
 *   - A lint rule that cries wolf gets disabled, and then catches nothing.
 *
 * Known limits, accepted:
 *   - Two components with the same action name: if either is wired, both look
 *     wired. board-detail's orphaned `copy_board` is missed for exactly this
 *     reason, because share-board.hbs wires an action of the same name.
 *   - Dynamic dispatch (`send(someVariable)`) is unknowable.
 *
 * So: every hit is worth a look, but absence of a hit is not proof of
 * reachability. Use `// eslint-disable-next-line lingolinq/no-orphaned-action`
 * with a reason when an action really is invoked in a way this cannot see.
 */

// app/frontend/app -- this rule lives at app/frontend/eslint-plugin-lingolinq/rules/
const APP_ROOT = path.resolve(__dirname, '..', '..', 'app');

// Invoked by Ember itself, never by name from a template.
const FRAMEWORK_ACTIONS = new Set([
  'willTransition', 'didTransition', 'error', 'loading', 'queryParamsDidChange'
]);

/* Whole-tree index of every quoted identifier-shaped token under app/, built
   once per process.

   INDEX_TTL_MS exists because "once per process" is wrong for a LONG-LIVED one.
   A single `eslint .` run is over in seconds and the cache is a pure win, but
   eslint_d and the VS Code ESLint server persist for hours: a developer who
   wires an orphaned action into a template keeps being told it is orphaned until
   they restart the server, and the rule's own message tells them to delete it.
   Being wrong in the direction of "delete this live code" is the one failure
   mode this rule must not have. A 5s TTL costs a directory walk at most once
   every 5 seconds and makes the stale window shorter than the edit-save-look
   cycle. */
const INDEX_TTL_MS = 5000;
let INDEX = null;
let INDEX_BUILT_AT = 0;

function currentIndex() {
  const now = Date.now();
  if (INDEX === null || (now - INDEX_BUILT_AT) > INDEX_TTL_MS) {
    INDEX = buildIndex();
    INDEX_BUILT_AT = now;
  }
  return INDEX;
}

function buildIndex() {
  const names = new Set();
  const stack = [APP_ROOT];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') { continue; }
        stack.push(full);
      } else if (entry.name.endsWith('.hbs') || entry.name.endsWith('.js')) {
        let text;
        try {
          text = fs.readFileSync(full, 'utf8');
        } catch (e) {
          continue;
        }
        // Every quoted token that could name an action.
        const re = /['"]([A-Za-z_$][\w$]*)['"]/g;
        let m;
        while ((m = re.exec(text))) { names.add(m[1]); }
      }
    }
  }
  return names;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Flag actions that are defined but never referenced by name, which ship as unreachable UI.',
      category: 'Possible Errors',
      recommended: true
    },
    schema: [{
      type: 'object',
      properties: {
        // Names that are reached in a way the index cannot model.
        ignore: { type: 'array', items: { type: 'string' } }
      },
      additionalProperties: false
    }],
    messages: {
      orphaned:
        "Action '{{name}}' is never referenced by name in any template or JS under app/. " +
        'If it is meant to be reachable, wire it to a control; if it is dead, delete it. ' +
        'If it is invoked in a way this rule cannot see, add an eslint-disable comment saying how.'
    }
  },

  create(context) {
    const filename = context.getFilename();
    // Only meaningful for app source.
    if (!filename || filename.indexOf(`${path.sep}app${path.sep}`) === -1) { return {}; }
    if (filename.indexOf(`${path.sep}tests${path.sep}`) !== -1) { return {}; }

    const opts = (context.options && context.options[0]) || {};
    const ignore = new Set(opts.ignore || []);

    return {
      Property(node) {
        // the `actions: { ... }` property itself
        const key = node.key && (node.key.name || node.key.value);
        if (key !== 'actions') { return; }
        if (!node.value || node.value.type !== 'ObjectExpression') { return; }

        const index = currentIndex();

        for (const prop of node.value.properties) {
          if (prop.type !== 'Property') { continue; }        // skip spreads
          if (prop.computed) { continue; }                   // dynamic key
          const name = prop.key && (prop.key.name || prop.key.value);
          if (!name || typeof name !== 'string') { continue; }
          if (FRAMEWORK_ACTIONS.has(name) || ignore.has(name)) { continue; }
          if (index.has(name)) { continue; }

          context.report({ node: prop.key, messageId: 'orphaned', data: { name } });
        }
      }
    };
  }
};
