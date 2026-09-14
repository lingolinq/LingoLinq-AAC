import {
  describe, it, expect, beforeEach, afterEach
} from 'frontend/tests/helpers/jasmine';
import scanner from '../../utils/scanner';

/*
 * A scannable speak-menu control with NO `id` must still perform its action.
 *
 * `utils/modal.js:276` puts `.md-speak-menu__bottom-btn` (and the other speak-menu classes)
 * into `scannable_targets`, so the scanner stops on them. `pick_elem` then dispatches a
 * `speakmenuselect` carrying `dom.attr('id')`. That routing only works for elements INSIDE a
 * `<ButtonListener>`: those regions are lines 22-52 and 56-299 of `components/speak-menu.hbs`,
 * and the bottom bar opens at :430. Measured on 2026-09-04, FOURTEEN matching controls sit
 * outside every listener with no id -- including `set_speak_mode_user` x4 and
 * `pick_speak_mode_user` x4, i.e. switching which communicator you are speaking as -- so the
 * event is dispatched into a hierarchy with no handler and the press is swallowed. Zero
 * id-less matching controls sit INSIDE a listener, so routing by id costs nothing.
 *
 * `pick_elem` already ends in a generic pass-through click (`scanner.js:859-862`) that works
 * for exactly these elements; they never reach it because the class branch claims them first.
 */
describe('scanner pick_elem: id-less speak-menu controls', function() {
  var host, fired, sawSpeakMenuSelect;

  beforeEach(function() {
    fired = 0; sawSpeakMenuSelect = 0;
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(function() {
    if(host && host.parentNode) { host.parentNode.removeChild(host); }
  });

  function control(opts) {
    var el = document.createElement('button');
    el.className = opts.cls;
    if(opts.id) { el.setAttribute('id', opts.id); }
    el.addEventListener('click', function() { fired++; });
    el.addEventListener('speakmenuselect', function() { sawSpeakMenuSelect++; });
    host.appendChild(el);
    /* A REAL wrapper, not a hand-rolled fake: pick_elem calls `scanner.find_elem(dom)` and
       indexes `[0]` on the result, so a stub that only mimics hasClass/attr breaks the very
       dispatch under test and reddens for the wrong reason. */
    return scanner.find_elem(el);
  }

  it('performs the action for a bottom-bar control that has no id', function() {
    var dom = control({ cls: 'md-speak-menu__bottom-btn' });
    scanner.pick_elem(dom);
    expect(fired).toEqual(1);
  });

  it('CONTROL: a control WITH an id still routes through speakmenuselect', function() {
    var dom = control({ cls: 'md-speak-menu__bottom-btn', id: 'menu_remembered_0' });
    scanner.pick_elem(dom);
    expect(sawSpeakMenuSelect).toEqual(1);
    expect(fired).toEqual(0);
  });

  it('performs the action for an id-less md-speak-menu__btn too', function() {
    var dom = control({ cls: 'md-speak-menu__btn' });
    scanner.pick_elem(dom);
    expect(fired).toEqual(1);
  });
});
