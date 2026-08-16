import { module, test } from 'qunit';
import workbook_schema from 'frontend/utils/eval_workbook';

/*
 * mergeForSend — the concurrent-save guard for the eval report workbook.
 *
 * A save replaces data['eval'] wholesale (log_session.rb:1875) and delivery is
 * fire-and-forget through Resque, so nothing compares state on the way in. If a
 * session sends the workbook it hydrated on load, any section written by another
 * session in the meantime is silently erased. Only the author can edit an eval's
 * workbook (eval-workbook.js#canEdit), so "another session" means the same SLP in
 * a second tab or on a second device.
 *
 * The merge keys on which sections THIS session edited, not on which are
 * non-empty. That distinction is the whole point and both directions are pinned
 * below: an untouched section keeps the stored text, and a deliberately CLEARED
 * section stays cleared instead of being resurrected.
 */
module('Unit | Utility | eval_workbook mergeForSend', function() {
  // A stored workbook with one medical section filled in.
  const storedWith = function(sectionId, value) {
    const wb = workbook_schema.blankWorkbook();
    wb.medical[sectionId].notes = value;
    return wb;
  };

  test('a section this session never touched keeps the stored text', function(assert) {
    const stored = storedWith('non_sgd_ruled_out', 'written by the other tab');
    const local = workbook_schema.blankWorkbook();
    local.medical.functional_goals.notes = 'written here';

    const merged = workbook_schema.mergeForSend(stored, local, ['medical:functional_goals']);

    assert.strictEqual(merged.medical.non_sgd_ruled_out.notes, 'written by the other tab',
      'the other session\'s section survives our save');
    assert.strictEqual(merged.medical.functional_goals.notes, 'written here',
      'our own edited section is what we typed');
  });

  test('without the dirty key our edit would be dropped — the key is load-bearing', function(assert) {
    const stored = storedWith('non_sgd_ruled_out', 'stored');
    const local = workbook_schema.blankWorkbook();
    local.medical.functional_goals.notes = 'written here';

    const merged = workbook_schema.mergeForSend(stored, local, []);

    assert.strictEqual(merged.medical.functional_goals.notes, '',
      'nothing is carried over when no section is marked dirty');
  });

  test('a deliberately cleared section stays cleared', function(assert) {
    // The trap that rules out "prefer whichever side is non-empty": clearing a
    // section would be undone on the next save and the text would reappear.
    const stored = storedWith('functional_goals', 'text the SLP just deleted');
    const local = workbook_schema.blankWorkbook();
    local.medical.functional_goals.notes = '';

    const merged = workbook_schema.mergeForSend(stored, local, ['medical:functional_goals']);

    assert.strictEqual(merged.medical.functional_goals.notes, '',
      'the clear sticks because the cleared section is dirty');
  });

  test('the two modes are independent', function(assert) {
    const stored = workbook_schema.blankWorkbook();
    stored.medical.functional_goals.notes = 'medical, from the other tab';
    stored.school.customary_environments.notes = 'school, from the other tab';

    const local = workbook_schema.blankWorkbook();
    local.school.customary_environments.notes = 'school, edited here';

    const merged = workbook_schema.mergeForSend(stored, local, ['school:customary_environments']);

    assert.strictEqual(merged.medical.functional_goals.notes, 'medical, from the other tab',
      'editing in school mode does not wipe the medical side');
    assert.strictEqual(merged.school.customary_environments.notes, 'school, edited here');
  });

  test('rows sections merge whole, including a removed row', function(assert) {
    const stored = workbook_schema.blankWorkbook();
    stored.medical.least_costly.rows = [
      { option: 'stored A', trial_length: '', training: '', reason: '' },
      { option: 'stored B', trial_length: '', training: '', reason: '' }
    ];
    stored.medical.daily_needs_by_environment.rows = [
      { environment: 'home', partner: 'parent', needs: 'stored' }
    ];

    const local = workbook_schema.blankWorkbook();
    local.medical.least_costly.rows = [
      { option: 'kept row', trial_length: '', training: '', reason: '' }
    ];

    const merged = workbook_schema.mergeForSend(stored, local, ['medical:least_costly']);

    assert.strictEqual(merged.medical.least_costly.rows.length, 1, 'the row removal sticks');
    assert.strictEqual(merged.medical.least_costly.rows[0].option, 'kept row');
    assert.strictEqual(merged.medical.daily_needs_by_environment.rows[0].needs, 'stored',
      'an untouched rows section is untouched');
  });

  test('no stored copy yet -> the local workbook is sent as-is', function(assert) {
    const local = workbook_schema.blankWorkbook();
    local.medical.functional_goals.notes = 'first save';

    const merged = workbook_schema.mergeForSend(null, local, ['medical:functional_goals']);

    assert.strictEqual(merged.medical.functional_goals.notes, 'first save');
  });

  test('a dirty key naming a section that does not exist is ignored', function(assert) {
    const stored = storedWith('functional_goals', 'stored');
    const local = workbook_schema.blankWorkbook();

    const merged = workbook_schema.mergeForSend(stored, local, ['medical:no_such_section', 'garbage', '']);

    assert.strictEqual(merged.medical.functional_goals.notes, 'stored',
      'stored content is not disturbed by junk keys');
  });
});
