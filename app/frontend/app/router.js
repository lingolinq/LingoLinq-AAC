import { on } from '@ember/object/evented';
import EmberRouter from '@ember/routing/router';
import { isTesting } from '@ember/debug';
import config from './config/environment';
import capabilities from './utils/capabilities';

var use_push_state = !!(window.history && window.history.pushState);
var check_full_screen = false;
if(location.pathname.match(/^\/jasmine/)) {
  use_push_state = false;
} else if(capabilities.browserless) {
  use_push_state = false;
} else if(window.navigator.standalone) {
  use_push_state = false;
} else if(check_full_screen) { // TODO: check if full screen launch on android
  use_push_state = false;
}
if(capabilities.installed_app) {
  config.locationType = 'hash';
} else if(use_push_state) {
  config.locationType = 'history';
}
const Router = EmberRouter.extend({
  location: config.locationType,
  rootURL: config.rootURL,
  
  init() {
    this._super(...arguments);
    if (isTesting()) {
      this.location = 'none';
    }
  }
});

Router.reopen({
  notifyGoogleAnalytics: on('didTransition', function() {
    if(window.ga) {
      return window.ga('send', 'pageview', {
        'page': this.get('url'),
        'title': this.get('url')
      });
    }
  })
});

Router.map(function() {
  this.route('jasmine');
  this.route('index', { path: '/' });
  this.route('modern-dashboard', { path: '/modern-dashboard' }, function() {
    this.route('index', { path: '/' });
    this.route('boards', { path: '/boards' });
    this.route('boards-new', { path: '/boards/new' });
    this.route('extras', { path: '/extras' });
    this.route('supervisors', { path: '/supervisors' });
  });
  this.route('create-board', { path: '/create-board' });
  this.route('about', { path: '/about' });
  this.route('landing', { path: '/landing' });
  this.route('landing-alt', { path: '/landing-alt' });
  this.route('download', { path: '/download' });
  this.route('terms', { path: '/terms' });
  this.route('privacy', { path: '/privacy' });
  this.route('privacy_practices', { path: '/privacy_practices' });
  this.route('jobs', { path: '/jobs' });
  this.route('pricing', { path: '/pricing' });
  this.route('contact', { path: '/contact' });
  this.route('home-boards', { path: '/search/home' });
  this.route('emergency', { path: '/search/emergency' });
  this.route('search', { path: '/search/:l/:q' });
  this.route('inflections', { path: '/inflections' });
  this.route('inflections', { path: '/inflections/:ref/:locale' });
  this.route('old_search', { path: '/search/:q' });
  this.route('utterance-reply', { path: '/u/:reply_code'})
  this.route('login', function() {
    this.route('device', { path: '/device' });
  });
  this.route('register');
  this.route('intro');
  this.route('trends');
  this.route('forgot_password');
  this.route('forgot_login');
  this.route('partners');
  this.route('compare');
  this.route('ambassadors');
  this.route('limited', {path: '/limited'});
  this.route('utterance', { path: '/utterances/:id' });
  this.route('start_codes', { path: '/start_codes/:id' });
  this.route('admin', { path: '/admin' });
  this.route('lesson', { path: '/lessons/:lesson_id/:lesson_code/:user_token'});
  this.route('organization', { path: '/organizations/:id' }, function() {
    this.route('reports');
    this.route('subscription');
    this.route('extras');
    this.route('lessons');
    this.route('rooms');
    this.route('settings');
    this.route('room', { path: '/rooms/:room_id' });
  });
  this.route('goals', { path: '/goals' }, function() {
      this.route('goal', { path: '/:goal_id' });
  });
  this.route('redeem', { path: '/redeem' });
  this.route('redeem_with_code', { path: '/redeem/:code' });
  this.route('gift_purchase', { path: '/gift' });
  this.route('bulk_purchase', { path: '/purchase/:id'});
  this.route('troubleshooting', { path: '/troubleshooting' });
  this.route('offline_boards', { path: '/offline-boards' });
  this.route('profile', { path: '/profile/:user_id/:profile_id'});
  // Setup must come before user so /setup matches the wizard, not user with id "setup"
  this.route('setup', { path: '/setup'});
  this.route('user', { resetNamespace: true, path: '/user/:user_id' }, function() {
    this.route('edit');
    this.route('preferences');
    this.route('subscription');
    this.route('stats');
    this.route('goals');
    this.route('goal', { path: '/goals/:goal_id' });
    this.route('recordings');
    this.route('logs');
    this.route('log', { path: '/logs/:log_id' });
    this.route('badges');
    this.route('device');
    this.route('history');
    this.route('lessons');
    this.route('focus');
    this.route('confirm_registration', { path: '/confirm_registration/:code' });
    this.route('password_reset', { path: '/password_reset/:code' });
  });
  this.route('speech', { path: '/speech' });
  this.route('board', { resetNamespace: true, path: '/*key'}, function() {
//    this.route('error');
    this.route('stats');
    this.route('history');
  });
//  this.route('board_error');
});

export default Router;
