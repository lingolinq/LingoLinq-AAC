import { module, test } from 'qunit';
import workbook from 'frontend/utils/eval_workbook';

/*
 * The workbook must be ABLE to produce every element Medicare LCD L33739
 * requires. Verbatim criteria: docs/AAC_EVALUATION_STANDARDS.md §4a, retrieved
 * from CMS 2026-08-17.
 *
 * This is a coverage contract, not a style check. If someone removes or renames
 * a section, the report silently stops being able to satisfy a clause a funding
 * reviewer checks for — and nothing else in the suite would notice.
 */

// Every clause a report must be able to evidence, with the requirement in plain
// words so a failure says WHAT is missing rather than just naming a key.
const REQUIRED = {
  'c1.1': 'current communication impairment — type, severity, language skills, cognitive ability, anticipated course',
  'c1.2': 'whether daily needs could be met using other natural modes',
  'c1.3': 'functional communication goals expected to be achieved',
  'c1.4': 'rationale for selection of a specific device and any accessories',
  'c1.5': 'treatment plan including a training schedule',
  'c1.6': 'cognitive and physical abilities to effectively use the SELECTED device',
  'c1.7': 'upgrade — functional benefit compared with the device already issued',
  'c2': 'medical condition resulting in severe expressive speech impairment',
  // Added 2026-08-25. c3 was absent from this map AND from the schema, so the test
  // below reported that medical mode "can evidence every required clause" while a
  // standalone, independently-deniable criterion was missing from both sides. This
  // map is hand-maintained, so it can only test what its author remembered — that
  // is its weakness, and the reason the count is asserted against the LCD's seven
  // criteria in the test that follows rather than against the map's own length.
  'c3': 'the beneficiary\'s speaking needs cannot be met using natural communication methods',
  'c4': 'other forms of treatment considered and ruled out',
  'c5': 'the impairment will benefit from the device ordered',
  'c6': "SLP's evaluation forwarded to the treating practitioner before ordering",
  'c7': 'SLP has no employment or financial relationship with the supplier'
};

module('Unit | eval_workbook LCD coverage', function () {
  test('medical mode can evidence every required clause', function (assert) {
    assert.expect(Object.keys(REQUIRED).length);
    const covered = workbook.lcdCoverage('medical').covered;
    Object.keys(REQUIRED).forEach(function (clause) {
      assert.ok(covered.indexOf(clause) > -1,
        clause + ' — ' + REQUIRED[clause]);
    });
  });

  /* Guards REQUIRED itself. The map above is hand-written, so the test that walks
     it can only be as complete as its author's memory — and it was not: c3 was
     missing from both the map and the schema, so "can evidence every required
     clause" passed while an independently-deniable criterion was unrepresented.
     L33739 has exactly seven numbered criteria; assert against that fixed shape
     rather than against the map's own length, which is what let the gap hide. */
  test('the required-clause map covers all seven LCD criteria', function (assert) {
    assert.expect(7);
    const tops = Object.keys(REQUIRED).map(function (c) { return c.split('.')[0]; });
    ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'].forEach(function (top) {
      assert.ok(tops.indexOf(top) > -1,
        top + ' is represented in REQUIRED — L33739 denies the claim if ANY of the seven is unmet');
    });
  });

  test('every clause maps to a section that actually exists', function (assert) {
    const cov = workbook.lcdCoverage('medical');
    assert.expect(Object.keys(cov.sections).length);
    const ids = workbook.sectionsFor('medical').map(function (s) { return s.id; });
    Object.keys(cov.sections).forEach(function (clause) {
      assert.ok(ids.indexOf(cov.sections[clause]) > -1,
        clause + ' points at a real section (' + cov.sections[clause] + ')');
    });
  });

  test('criteria 6 and 7 are printed statements, not free-text fields', function (assert) {
    // A reviewer checks for these clauses literally, so the report prints them
    // and the SLP signs. Collecting them as text would let them be paraphrased.
    assert.ok(workbook.LCD_STATEMENTS.c6.indexOf('forwarded to the beneficiary') > -1,
      'criterion 6 statement is stored verbatim');
    assert.ok(workbook.LCD_STATEMENTS.c7.indexOf('financial relationship') > -1,
      'criterion 7 statement is stored verbatim');
  });

  test('a new eval starts with every required section present and blank', function (assert) {
    assert.expect(workbook.sectionsFor('medical').length + 1);
    const wb = workbook.blankWorkbook();
    workbook.sectionsFor('medical').forEach(function (s) {
      assert.notStrictEqual(wb.medical[s.id], undefined, s.id + ' exists in a blank workbook');
    });
    assert.strictEqual(workbook.startedCount('medical', wb), 0, 'and nothing counts as started');
  });

  test('a workbook stored BEFORE these sections existed still hydrates', function (assert) {
    // The real upgrade path: evals saved against the old schema must not lose
    // their answers or blow up when the new sections are absent from storage.
    const legacy = { medical: { non_sgd_ruled_out: { notes: 'tried PECS for 6 weeks' } } };
    const wb = workbook.hydrate(legacy);
    assert.strictEqual(wb.medical.non_sgd_ruled_out.notes, 'tried PECS for 6 weeks',
      'the pre-existing answer survives');
    assert.deepEqual(wb.medical.communication_status,
      { impairment_type: '', severity: '', language_skills: '', cognitive_ability: '', anticipated_course: '' },
      'and a section added later arrives blank rather than undefined');
  });
});

module('Unit | eval_workbook derivePrefill', function () {
  const analysis = {
    grid_height: 6, grid_width: 10, avg_accuracy: 78, hits: 112,
    avg_response_time: 1.4, button_width: 0.9, button_height: 0.9,
    access_method: 'Touch'
  };

  test('drafts the two sections the evaluation can actually evidence', function (assert) {
    const out = workbook.derivePrefill(analysis, { page_set: 'Vocal Flair 84' });
    assert.ok(out.device_ability.notes.indexOf('6×10') > -1, 'names the grid that was mastered');
    assert.ok(out.device_ability.notes.indexOf('78%') > -1, 'and the measured accuracy');
    assert.ok(out.selection_rationale.notes.indexOf('Vocal Flair 84') > -1, 'names the recommended set');
  });

  test('says the grid was measured, not extrapolated', function (assert) {
    // The distinction that matters clinically: the Quick Screen extrapolates
    // upward from 4x6 probes, the full eval tests the grid directly. A reviewer
    // reading "84 buttons" should be able to tell which produced it.
    const out = workbook.derivePrefill(analysis, {});
    assert.ok(out.selection_rationale.notes.indexOf('not an extrapolation') > -1,
      'the draft states the number was measured directly');
  });

  test('marks drafts for review rather than presenting them as final', function (assert) {
    const out = workbook.derivePrefill(analysis, {});
    assert.ok(out.device_ability.notes.indexOf('[Auto-drafted') > -1,
      'auto-drafted text is labelled as such');
  });

  test('never concludes anything the eval did not measure', function (assert) {
    assert.expect(4);
    // Our own research (§6) is explicit that feature matching is not empirically
    // validated. The generator reports observations; clinical conclusions stay
    // SLP-authored, so these must never appear in generated text.
    const all = JSON.stringify(workbook.derivePrefill(analysis, { page_set: 'Vocal Flair 84' }));
    ['requires', 'medically necessary', 'clinically proven', 'will benefit'].forEach(function (claim) {
      assert.notOk(all.toLowerCase().indexOf(claim) > -1, 'does not assert "' + claim + '"');
    });
  });

  test('omits what it cannot support instead of inventing it', function (assert) {
    assert.deepEqual(workbook.derivePrefill({}, {}), {}, 'an empty analysis drafts nothing');
    assert.deepEqual(workbook.derivePrefill(null, null), {}, 'and null does not throw');
  });

  test('drafts nothing for the clauses only the SLP can answer', function (assert) {
    assert.expect(4);
    const out = workbook.derivePrefill(analysis, { page_set: 'Vocal Flair 84' });
    ['communication_status', 'medical_condition', 'benefit_statement', 'upgrade_justification'].forEach(function (id) {
      assert.notOk(out[id], id + ' is not auto-drafted — the eval does not measure it');
    });
  });
});
