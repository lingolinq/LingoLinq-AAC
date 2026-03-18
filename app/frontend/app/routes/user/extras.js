import HomeRoute from './home';

/**
 * Tools & resources grid at /:user_name/extras — same shell as home (AuthenticatedView), Extras tab.
 */
export default HomeRoute.extend({
  renderTemplate: function() {
    this.render('user/extras');
  }
});
