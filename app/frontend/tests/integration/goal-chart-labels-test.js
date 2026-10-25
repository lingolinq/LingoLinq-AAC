import { setupRenderingTest } from 'frontend/tests/helpers';
import { render } from '@ember/test-helpers';
import { hbs } from 'ember-cli-htmlbars';
import * as QUnit from 'qunit';
import { stub, restoreStubs } from 'frontend/tests/helpers/jasmine';
import { pinMomentAtOffset } from 'frontend/tests/helpers/fixed-offset-moment';
import LingoLinq from 'frontend/app';
import i18n from 'frontend/utils/i18n';

/*
 * The goal page's two charts, rendered: the "Statistics By" grid
 * (Stats::GoalStatusesOverTime) and the area chart (Stats::GoalSummary).
 * For #1172: each week or month must be labelled with the local date, in the
 * grid's date row, in the grid's tooltips, and in the rows the area chart is
 * given for its axis and tooltips.
 *
 * Every moment the goal model builds is shown at a fixed UTC offset with
 * "now" pinned, so the label is checked where the UTC date and the local date
 * differ, in CI (UTC) as on any other machine. The Google chart library is
 * replaced by a recorder: this checks what the chart is given, not how Google
 * draws it. e2e/goal-chart-labels.spec.js covers the grid in a real browser.
 */
QUnit.module('Integration | goal chart date labels', function(hooks) {
  setupRenderingTest(hooks);

  hooks.afterEach(function() {
    restoreStubs();
  });

  var at_offset = pinMomentAtOffset;

  // One session with a status of 3 in the given month and, for a weekly goal,
  // in the given week. The weekly key follows the app's own formula
  // (goal.js time_units); the server keys weeks differently (#1196).
  function goal_with(owner, weekly_key) {
    var session = {sessions: 1, positives: 1, negatives: 0, statuses: [3]};
    var none = {sessions: 0, positives: 0, negatives: 0, statuses: []};
    var stats = {
      daily: {totals: none},
      weekly: {totals: weekly_key ? session : none},
      monthly: {'2026-07': session, totals: session}
    };
    if(weekly_key) { stats.weekly[weekly_key] = session; }
    var goal = owner.lookup('service:store').createRecord('goal');
    goal.set('stats', stats);
    return goal;
  }

  function this_week_key() {
    return window.moment().weekday(1).format('GGGG-WW');
  }

  function date_row_labels(root) {
    return Array.from(root.querySelectorAll('.time_block_row.dates .time_block div')).map((d) => d.textContent.trim());
  }

  function block_tooltips(root) {
    return Array.from(root.querySelectorAll('.time_block_row:not(.dates) .time_block')).map((b) => b.getAttribute('title') || b.getAttribute('data-original-title') || '').filter((t) => t);
  }

  // Replaces the Google chart library with a recorder of the rows the chart is given.
  function record_chart() {
    var drawn = {rows: null};
    stub(LingoLinq.Visualizations, 'wait', function(name, callback) { callback(); });
    stub(window, 'google', {
      visualization: {
        DataTable: function() {
          this.addColumn = function() {};
          this.addRows = function(rows) { drawn.rows = rows; };
        },
        AreaChart: function() {
          this.draw = function() {};
          this.getSelection = function() { return []; };
        },
        events: {addListener: function() {}}
      }
    });
    return drawn;
  }

  QUnit.test('the Statistics By grid labels a month with its own first day east of UTC', async function(assert) {
    at_offset('2026-07-15T00:30:00+02:00', 120);
    this.set('goal', goal_with(this.owner, null));
    assert.strictEqual(this.goal.get('best_time_level'), 'monthly');

    await render(hbs`<Stats::GoalStatusesOverTime @goal={{this.goal}} />`);

    var labels = date_row_labels(this.element);
    assert.strictEqual(labels[labels.length - 1], '2026-07-01', 'the last column is July, labelled with July 1st');
    assert.notOk(labels.includes('2026-06-30'), 'no column carries the UTC date of the month before');
    assert.deepEqual(block_tooltips(this.element), [i18n.t('status_sessions', "status", {count: 1}) + ', 2026-07-01'], 'the status tooltip names July 1st');
  });

  QUnit.test('the Statistics By grid labels a week with its local Sunday east of UTC', async function(assert) {
    at_offset('2026-07-15T00:30:00+02:00', 120);
    this.set('goal', goal_with(this.owner, this_week_key()));
    assert.strictEqual(this.goal.get('best_time_level'), 'weekly');

    await render(hbs`<Stats::GoalStatusesOverTime @goal={{this.goal}} />`);

    var labels = date_row_labels(this.element);
    assert.strictEqual(labels[labels.length - 1], '2026-07-12', 'the current week is labelled with Sunday July 12th');
    assert.deepEqual(block_tooltips(this.element), [i18n.t('status_sessions', "status", {count: 1}) + ', 2026-07-12'], 'the status tooltip names Sunday July 12th');
  });

  QUnit.test('the Statistics By grid labels a week with its local Sunday west of UTC', async function(assert) {
    at_offset('2026-07-15T20:00:00-07:00', -420);
    this.set('goal', goal_with(this.owner, this_week_key()));
    assert.strictEqual(this.goal.get('best_time_level'), 'weekly');

    await render(hbs`<Stats::GoalStatusesOverTime @goal={{this.goal}} />`);

    var labels = date_row_labels(this.element);
    assert.strictEqual(labels[labels.length - 1], '2026-07-12', 'the current week is labelled with Sunday July 12th');
  });

  QUnit.test('the summary chart gets the local month on its axis and in its tooltip east of UTC', async function(assert) {
    at_offset('2026-07-15T00:30:00+02:00', 120);
    var drawn = record_chart();
    this.set('goal', goal_with(this.owner, null));

    await render(hbs`<Stats::GoalSummary @goal={{this.goal}} />`);

    assert.ok(drawn.rows, 'the chart was drawn');
    var last = drawn.rows[drawn.rows.length - 1];
    assert.strictEqual(last[0], '2026-07-01', 'the axis names July 1st');
    assert.ok(last[3].startsWith(i18n.t('month_of', "Month of") + ' 2026-07-01'), 'the tooltip names July 1st');
    assert.notOk(drawn.rows.some((r) => r[0] == '2026-06-30'), 'no point carries the UTC date of the month before');
  });

  QUnit.test('the summary chart gets the local Sunday on its axis and in its tooltip west of UTC', async function(assert) {
    at_offset('2026-07-15T20:00:00-07:00', -420);
    var drawn = record_chart();
    this.set('goal', goal_with(this.owner, this_week_key()));

    await render(hbs`<Stats::GoalSummary @goal={{this.goal}} />`);

    assert.ok(drawn.rows, 'the chart was drawn');
    var last = drawn.rows[drawn.rows.length - 1];
    assert.strictEqual(last[0], '2026-07-12', 'the axis names Sunday July 12th');
    assert.ok(last[3].startsWith(i18n.t('week_of', "Week of") + ' 2026-07-12'), 'the tooltip names Sunday July 12th');
  });
});
