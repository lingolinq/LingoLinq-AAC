import Component from '@ember/component';
import modal from '../utils/modal';

export default Component.extend({
  tagName: '',
  activeFont: null,
  _featuresObserver: null,
  _planObserver: null,

  didInsertElement() {
    this._super(...arguments);
    this._setupFeaturesScrollObserver();
    this._setupPlanScrollObserver();
  },

  willDestroyElement() {
    this._super(...arguments);
    if (this._featuresObserver) {
      var el = document.getElementById('la-features');
      if (el) {
        this._featuresObserver.unobserve(el);
      }
      this._featuresObserver = null;
    }
    if (this._planObserver) {
      var planEl = document.getElementById('la-plan');
      if (planEl) {
        this._planObserver.unobserve(planEl);
      }
      this._planObserver = null;
    }
  },

  _setupPlanScrollObserver() {
    var el = document.getElementById('la-plan');
    if (!el || typeof IntersectionObserver === 'undefined') {
      return;
    }
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('la-plan-visible');
          }
        });
      },
      { rootMargin: '0px 0px -40px 0px', threshold: 0.1 }
    );
    observer.observe(el);
    this._planObserver = observer;
  },

  _setupFeaturesScrollObserver() {
    var el = document.getElementById('la-features');
    if (!el || typeof IntersectionObserver === 'undefined') {
      return;
    }
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('la-features-visible');
          }
        });
      },
      { rootMargin: '0px 0px -40px 0px', threshold: 0.1 }
    );
    observer.observe(el);
    this._featuresObserver = observer;
  },

  actions: {
    support() {
      // placeholder for support/help action
    },
    applicationSupport() {
      modal.open('support');
    },
    applicationLanguage() {
      modal.open('modals/choose-locale');
    },
    showFeatures() {
      modal.open('la-features-modal');
    },
    toggleFont(fontName) {
      var _this = this;
      if (_this.get('activeFont') === fontName) {
        _this.set('activeFont', null);
      } else {
        _this.set('activeFont', fontName);
      }
    }
  }
});
