import { module, test } from 'qunit';
import { setupTest } from '../../helpers';

/* A SIZE SET WITH THE +/- BUTTONS IS THE PERSON'S CHOICE (2026-10-02, adversarial review, requested:
 * "fix steppers"). Typing in the rows/columns inputs and the grid-size picker record the choice
 * (`grid_size_chosen`), which stops `autoFitGrid` reshaping the board from the label count. The +/-
 * buttons (`plus_minus`, wizard step 2 and the Board Layout panel) changed the size without it, so
 * the next label typed undid the size the person had just stepped to.
 */
module('Unit | Component | create-board-new steppers', function(hooks) {
  setupTest(hooks);

  function board(context) {
    var c = context.owner.factoryFor('component:create-board-new').create();
    c.set('model.grid', { rows: 2, columns: 2, labels: '' });
    return c;
  }

  test('rows and columns stepped with +/- survive typing labels', function(assert) {
    assert.expect(2);
    var c = board(this);
    c.send('plus_minus', 'plus', 'model.grid.rows');
    c.send('plus_minus', 'plus', 'model.grid.columns');
    c.set('model.grid.labels', 'a\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl\nm\nn\no\np\nq');
    assert.strictEqual(c.get('model.grid.rows'), 3, 'rows stay where the person stepped them');
    assert.strictEqual(c.get('model.grid.columns'), 3, 'columns too');
  });

  test('untouched size still auto-fits (unchanged)', function(assert) {
    assert.expect(1);
    var c = board(this);
    c.set('model.grid.labels', 'a\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl\nm\nn\no\np\nq');
    assert.notStrictEqual(c.get('model.grid.rows') + 'x' + c.get('model.grid.columns'), '2x2', 'auto-fit reshaped a size nobody chose');
  });
});
