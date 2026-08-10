import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed } from '@ember/object';
import i18n from '../utils/i18n';

/**
 * Information pill naming the account a supporter is currently viewing.
 *
 * Renders nothing unless app-state reports a supervising context — own pages,
 * unsupervised users and a disabled feature flag all resolve to null (see
 * utils/supervising_context.js).
 *
 * LAYOUT CONTRACT: the pill is `position: absolute` inside a zero-height anchor
 * (styles/app.scss) precisely so that adding it changes NOTHING around it. A
 * previous attempt rendered it in normal flow under the header and pushed every
 * page's content down. It is also `pointer-events: none`, so it can never
 * intercept a click meant for the page beneath it. Keep both properties if this
 * markup is ever moved.
 *
 * SCROLL CONTRACT: it is rendered inside `#content` (templates/application.hbs),
 * which is the app's scroll container — `#within_ember` is fixed/overflow:hidden
 * on the page-footer layout, so the document never scrolls. That, plus the
 * anchor giving the pill a containing block inside the scroller, is what makes
 * it stay at the top of the page rather than follow the reader down it. It was
 * `position: fixed` before and hovered over every scrolled page.
 */
export default Component.extend({
  tagName: '',
  appState: service('app-state'),

  /* NOTE: `reads` would have to come from '@ember/object/computed' — it is NOT a
     property of the `computed` import. `computed.reads(...)` throws at module
     evaluation on Ember 5 and blanks the whole app. A plain computed avoids the
     question entirely. */
  message: computed('appState.supervising_context.display_name', function() {
    var name = this.get('appState.supervising_context.display_name');
    if(!name) { return null; }
    /* NEW key, not a re-word of supervising_context_viewing: that key still
       carries "…'s account" in the other 12 locales, and dropping the noun from
       the English default alone would leave them saying something different. */
    return i18n.t('supervising_context_viewing_name', "Viewing %{name}", { name: name });
  })
});
