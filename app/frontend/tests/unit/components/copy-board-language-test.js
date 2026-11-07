import { module, test } from 'qunit';
import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import { setupTest } from '../../helpers';
import LingoLinq from 'frontend/app';

/* A copy keeps its own language unless something on it can actually be shown in the new one. The
 * session language stays on the last board viewed, and an ordinary English board has no
 * translations at all, so a leftover Spanish here used to crash the copy or label it Spanish. */
module('Unit | copy-board language', function(hooks) {
  setupTest(hooks);

  function copy_with(owner, translations) {
    const create_copy = owner.lookup('service:store').createRecord('board', {}).create_copy;
    const realStore = LingoLinq.store;
    let made = null;
    LingoLinq.store = { createRecord: function(type, props) {
      made = EmberObject.create(props);
      made.save = function() { return RSVP.resolve(made); };
      return made;
    } };
    const source = EmberObject.create({ id: '1_1', key: 'me/hats', name: 'Hats', locale: 'en',
      buttons: [{ id: 1, label: 'hat' }], grid: {}, translations: translations, default_locale: 'es' });
    source.rollbackAttributes = function() { };
    try {
      create_copy.call(source, null);
    } finally {
      LingoLinq.store = realStore;
    }
    return made;
  }

  test('create_copy: a board with no translations stays in its language', function(assert) {
    const copy = copy_with(this.owner, undefined);
    assert.strictEqual(copy.get('locale'), 'en');
    assert.strictEqual(copy.get('buttons')[0].label, 'hat');
  });

  test('create_copy: a board with nothing in the new language stays in its language', function(assert) {
    assert.strictEqual(copy_with(this.owner, {}).get('locale'), 'en');
  });

  test('create_copy: a board translated into the new language changes to it', function(assert) {
    const copy = copy_with(this.owner, { 1: { es: { label: 'sombrero', vocalization: 'sombrero' } } });
    assert.strictEqual(copy.get('locale'), 'es');
    assert.strictEqual(copy.get('buttons')[0].label, 'sombrero');
  });

  test('the copy dialog ignores a language left over from another board', function(assert) {
    assert.expect(1);
    const appState = this.owner.lookup('service:app-state');
    const realLocale = appState.get('label_locale');
    appState.set('label_locale', 'es');
    const component = this.owner.factoryFor('component:copy-board').create({ load_copy_hierarchy: function() { } });
    component.set('model', { board: EmberObject.create({ name: 'Hats', locale: 'en', locales: ['en'] }) });
    component.set('_copyBoardInitialized', false);
    try {
      component.runOpening();
      assert.strictEqual(component.get('default_locale'), 'en');
    } finally {
      appState.set('label_locale', realLocale);
      component.destroy();
    }
  });
});
