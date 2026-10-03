import HomeRoute from './home';
import RSVP from 'rsvp';
import { send_basic_viewer_to_landing } from '../../utils/basic_landing';

/**
 * Tools & resources grid at /:user_name/extras — same shell as home (AuthenticatedView), Extras tab.
 */
export default HomeRoute.extend({
  templateName: 'user/extras',

  /* OPENED DIRECTLY IN BASIC (2026-09-30, requested: "re-route the user to the home page with the
     extras items expanded and scrolled to"). Basic renders this route with its home page, so a
     bookmark or typed /extras showed the home page with the drawer closed. A Basic viewer now
     takes the View menu's Extras landing (utils/basic_landing.js): the home page, Actions tab,
     drawer open and scrolled to.
     After the inherited check (routes/user/home.js), which sends anyone else's /extras to the
     viewer's own home; past it, `user` is the signed-in account, which decides the view on a
     cold load too. */
  afterModel: function(user, transition) {
    var _this = this;
    return RSVP.resolve(this._super.apply(this, arguments)).then(function() {
      if(send_basic_viewer_to_landing(_this.get('appState'), _this.get('router'), 'user.extras', user, null, transition)) {
        return RSVP.reject();
      }
    });
  }
});
