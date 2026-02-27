import Controller from '@ember/controller';

export default Controller.extend({
  init() {
    this._super();
    try {
      if (sessionStorage.getItem('for_schools_scot_palette') === 'true') {
        this.set('scotPalette', true);
      }
    } catch (e) { /* ignore */ }
  },

  scotPalette: false,

  actions: {
    toggleScotPalette() {
      this.toggleProperty('scotPalette');
      try {
        if (this.get('scotPalette')) {
          sessionStorage.setItem('for_schools_scot_palette', 'true');
        } else {
          sessionStorage.removeItem('for_schools_scot_palette');
        }
      } catch (e) { /* ignore */ }
    }
  }
});
