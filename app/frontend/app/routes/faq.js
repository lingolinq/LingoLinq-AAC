import Route from '@ember/routing/route';
import i18n from '../utils/i18n';

export default Route.extend({
  title: i18n.t('faq_document_title', "FAQ"),

  activate() {
    this._super(...arguments);
    if (window.scrollTo) {
      window.scrollTo(0, 0);
    }
  }
});
