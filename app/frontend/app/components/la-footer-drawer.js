import Component from '@ember/component';

/**
 * Reusable footer collapse: hamburger trigger + LaMobileDrawer for footer links.
 * Same pattern as navbar (la-topbar-hamburger + LaMobileDrawer). Use with la-footer--collapsible.
 * Yields (hash closeDrawer=...) so parent can close drawer on link click.
 */
export default Component.extend({
  tagName: '',

  isDrawerOpen: false,

  actions: {
    toggleDrawer() {
      this.set('isDrawerOpen', !this.get('isDrawerOpen'));
    },
    closeDrawer() {
      this.set('isDrawerOpen', false);
    }
  }
});
