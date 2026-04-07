import EmberObject from '@ember/object';
import RSVP from 'rsvp';
import DS from 'ember-data';
import LingoLinq from '../app';
import templateHelpers from '../utils/template_helpers';
import speecher from '../utils/speecher';
import lingoLinqExtras from '../utils/extras';
import editManager from '../utils/edit_manager';
import progress_tracker from '../utils/progress_tracker';
import capabilities from '../utils/capabilities';
import Utils from '../utils/misc';
import { set as emberSet, get as emberGet } from '@ember/object';
import { later as runLater } from '@ember/runloop';
import i18n from '../utils/i18n';
import ButtonSet from '../models/buttonset';
import modal from '../utils/modal';
import BoardHierarchy from '../utils/board_hierarchy';
import { observer } from '@ember/object';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

LingoLinq.User = DS.Model.extend({
  persistence: service('persistence'),
  appState: service('app-state'),
  stashes: service('stashes'),
  
  init() {
    this._super(...arguments);
    // Set default preference if not set
    if(this.get('preferences') && !this.get('preferences.stretch_buttons')) {
      this.set('preferences.stretch_buttons', 'none');
    }
  },
  user_name: DS.attr('string'),
  user_token: DS.attr('string'),
  link: DS.attr('string'),
  joined: DS.attr('date'),
  sync_stamp: DS.attr('string'),
  settings: DS.attr('raw'),
  is_admin: DS.attr('boolean'),
  authored_organization_id: DS.attr('string'),
  terms_agree: DS.attr('boolean'),
  name: DS.attr('string'),
  email: DS.attr('string'),
  needs_billing_update: DS.attr('string'),
  public: DS.attr('boolean'),
  pending: DS.attr('boolean'),
  description: DS.attr('string'),
  details_url: DS.attr('string'),
  avatar_url: DS.attr('string'),
  fallback_avatar_url: DS.attr('string'),
  prior_avatar_urls: DS.attr('raw'),
  last_profile: DS.attr('raw'),
  location: DS.attr('string'),
  home_board_key: DS.attr('string'),
  permissions: DS.attr('raw'),
  external_nonce: DS.attr('raw'),
  state_2fa: DS.attr('raw'),
  board_tags: DS.attr('raw'),
  /** Tag name -> global_id[] for folder UI (same as server user_extra.board_tags). */
  board_tag_map: DS.attr('raw'),
  focus_words: DS.attr('raw'),
  access_methods: DS.attr('raw'),
  start_codes: DS.attr('raw'),
  start_code: DS.attr('string'),
  unread_messages: DS.attr('number'),
  unread_alerts: DS.attr('number'),
  external_device: DS.attr('raw'),
  start_progress: DS.attr('raw'),
  valet_password: DS.attr('string'),
  valet_login: DS.attr('boolean'),
  valet_password_set: DS.attr('boolean'),
  valet_disabled: DS.attr('boolean'),
  valet_long_term: DS.attr('boolean'),
  valet_prevent_disable: DS.attr('boolean'),
  has_logging_code: DS.attr('boolean'),
  lessons: DS.attr('raw'),
  topics: DS.attr('raw'),
  last_message_read: DS.attr('number'),
  last_alert_access: DS.attr('number'),
  last_access: DS.attr('date'),
  membership_type: DS.attr('string'),
  subscription: DS.attr('raw'),
  org_assistant: DS.attr('boolean'),
  org_manager: DS.attr('boolean'),
  org_supervision_pending: DS.attr('boolean'),
  organizations: DS.attr('raw'),
  password: DS.attr('string'),
  old_password: DS.attr('string'),
  referrer: DS.attr('string'),
  ad_referrer: DS.attr('string'),
  preferences: DS.attr('raw'),
  global_integrations: DS.attr('raw'),
  devices: DS.attr('raw'),
  requested_phrase_changes: DS.attr('raw'),
  premium_voices: DS.attr('raw'),
  purchase_duration: DS.attr('number'),
  feature_flags: DS.attr('raw'),
  prior_home_boards: DS.attr('raw'),
  supervisor_key: DS.attr('string'),
  supervisors: DS.attr('raw'),
  supervisee_code: DS.attr('string'),
  supervised_units: DS.attr('raw'),
  supervisees: DS.attr('raw'),
  offline_actions: DS.attr('raw'),
  vocalizations: DS.attr('raw'),
  contacts: DS.attr('raw'),
  goal: DS.attr('raw'),
  pending_board_shares: DS.attr('raw'),
  pending_supervisor_requests: DS.attr('raw'),
  edit_permission: DS.attr('boolean'),
  cell_phone: DS.attr('string'),
  next_notification_delay: DS.attr('string'),
  read_notifications: DS.attr('boolean'),
  supervisors_or_managing_org: computed('supervisors', 'managing_org', 'managing_supervision_orgs', function() {
    return (this.get('supervisors') || []).length > 0 || this.get('managing_org') || this.get('managing_supervision_orgs.length') > 0;
  }),
  has_management_responsibility: computed('managed_orgs', function() {
    return (this.get('managed_orgs') || []).length > 0;
  }),
  is_sponsored: computed('organizations', function() {
    return !!(this.get('organizations') || []).find(function(o) { return o.type == 'user' && o.sponsored; });
  }),
  is_managed: computed('organizations', function() {
    return !!(this.get('organizations') || []).find(function(o) { return o.type == 'user'; });
  }),
  managing_org: computed('organizations', function() {
    return (this.get('organizations') || []).find(function(o) { return o.type == 'user'; });
  }),
  managing_orgs: computed('organizations', function() {
    return (this.get('organizations') || []).filter(function(o) { return o.type == 'user'; });
  }),
  org_board_keys: computed('organizations', function() {
    var res = [];
    (this.get('organizations') || []).forEach(function(org) {
      if(org.home_board_keys) {
        res = res.concat(org.home_board_keys);
      }
    })
    return res.uniq();
  }),
  manages_multiple_orgs: computed('managed_orgs', function() {
    return (this.get('managed_orgs') || []).length > 1;
  }),
  managed_orgs: computed('organizations', function() {
    return (this.get('organizations') || []).filter(function(o) { return o.type == 'manager' && o.restricted != true; });
  }),
  single_org: computed('organizations', function() {
    var org_ids = {};
    (this.get('organizations') || []).forEach(function(org) {
      if(org.premium) {
        if(!org_ids[org.id]) {
          org_ids[org.id] = org;
        }
        if(org.admin) {
          org_ids[org.id].admin = true;
        }  
      }
    })
    var res = Object.keys(org_ids).length == 1 ? org_ids[Object.keys(org_ids)[0]] : null;
    if(res && res.image_url) {
      this.persistence.find_url(res.image_url, 'image').then(function(data_uri) {
        emberSet(res, 'image_url', data_uri);
      }, function() { });
    }
    return (res && !res.admin) ? res : null;
  }),
  managing_supervision_orgs: computed('organizations', function() {
    return (this.get('organizations') || []).filter(function(o) { return o.type == 'supervisor'; });
  }),
  pending_org: computed('organizations', function() {
    return (this.get('organizations') || []).find(function(o) { return o.type == 'user' && o.pending; });
  }),
  pending_supervision_org: computed('organizations', function() {
    return (this.get('organizations') || []).find(function(o) { return o.type == 'supervisor' && o.pending; });
  }),
  supervisor_names: computed('supervisors', 'is_managed', 'managing_orgs', function() {
    var names = [];
    if(this.get('is_managed') && this.get('managing_orgs.length')) {
      names = names.concat(this.get('managing_orgs').map(function(u) { return u.name; }));
    }
    names = names.concat((this.get('supervisors') || []).map(function(u) { return u.name || u.user_name; }));
    return names.join(", ");
  }),
  supervisee_names: computed('supervisees', function() {
    return (this.get('supervisees') || []).map(function(u) { return u.name; }).join(", ");
  }),
  profile_class: computed('last_profile', 'profile_due', 'appState.refresh_stamp', function() {
    var res = 'profile_circle';
    if(this.get('profile_due.overdue') || !this.get('last_profile_date')) {
      res = res + ' overdue';
    } else if(this.get('profile_due.soon') || this.get('profile_due.encouraged')) {
      res = res + ' due_soon';
    }
    return res;
  }),
  last_profile_date: computed('last_profile', function() {
    if(!this.get('last_profile')) { return null; }
    var date = window.moment(this.get('last_profile.added') * 1000);
    return date;
  }),
  profile_due: computed('last_profile_date', 'appState.refresh_stamp', function() {
    var res = {};
    var date = this.get('last_profile_date');
    var now = window.moment();
    var org_cutoff = this.get('last_profile.expected');
    if(org_cutoff) {
      var cutoff = window.moment(org_cutoff * 1000);
      if(date > cutoff) {
        res.overdue = true;
      } else if(date > cutoff.subtract(1, 'month')) {
        res.soon = true;
      }
    } else {
      if(date < now.add(-8, 'month')) {
        res.encouraged = true;
      }
    }
    return res;
  }),
  device_image: computed('external_device.device_id', 'external_device.vocab_id', function() {
    var device_id = this.get('external_device.device_id') || 'na';
    var vocab_id = this.get('external_device.vocab_id') || 'na';
    var res = {};
    var device = LingoLinq.User.devices.find(function(dev) { return dev.id == device_id; });
    var vocab = ((device || {vocabs: []}).vocabs || []).find(function(voc) { return voc.id == vocab_id; });
    if(device && device.img) {
      res.device_url = templateHelpers.path('alt-aac/' + device.img);
    }
    if(vocab && vocab.img) {
      res.vocab_url = templateHelpers.path('alt-aac/' + vocab.img);
    }
    return res;
  }),
  notifications: DS.attr('raw'),
  parsed_notifications: computed('notifications', function() {
    var notifs = this.get('notifications') || [];
    notifs.forEach(function(notif) {
      notif[notif.type] = true;
      notif.occurred_at = (Date.parse(notif.occurred_at) || new Date(notif.occurred_at));
    });
    return notifs;
  }),
  online: computed('last_ws_access', function() {
    LingoLinq.User.ws_accesses = LingoLinq.User.ws_accesses || {};
    var last_access = this.get('last_ws_access');
    if(!last_access) {
      var _this = this;
      if(LingoLinq.User.ws_accesses[this.get('id')]) {
        last_access = LingoLinq.User.ws_accesses[this.get('id')];
        runLater(function() {
          _this.set('last_ws_access', LingoLinq.User.ws_accesses[_this.get('id')]);
        }, 50)
      }
    } else {
      LingoLinq.User.ws_accesses[this.get('id')] = Math.max(LingoLinq.User.ws_accesses[this.get('id')] || 0, this.get('last_ws_access'));
    }
    return last_access > (((new Date()).getTime() - (5 * 60 * 1000)) / 1000);
  }),
  update_voice_uri: observer(
    'preferences.device.voice.voice_uri',
    'preferences.device.voice.voice_uris',
    'preferences.device.alternate_voice.voice_uri',
    'preferences.device.alternate_voice.voice_uris',
    function() {
      if(this.get('preferences.device.voice')) {
        var voice = null;
        var voices = speecher.get('voices');
        var voiceURIs = this.get('preferences.device.voice.voice_uris') || [];
        if(this.get('preferences.device.voice.voice_uri')) { voiceURIs.unshift(this.get('preferences.device.voice.voice_uri')); }
        var finder = function(v) { return v.voiceURI == voiceURI; };
        for(var idx = 0; idx < voiceURIs.length && !voice; idx++) {
          var voiceURI = voiceURIs[idx];
          voice = voices.find(finder);
          if(voiceURI == 'force_default') {
            voice = {voiceURI: 'force_default'};
          }
        }
        this.set('preferences.device.voice.voice_uri', voice && voice.voiceURI);
      }
      if(this.get('preferences.device.alternate_voice')) {
        var voice = null;
        var voices = speecher.get('voices');
        var voiceURIs = this.get('preferences.device.alternate_voice.voice_uris') || [];
        if(this.get('preferences.device.alternate_voice.voice_uri')) { voiceURIs.unshift(this.get('preferences.device.alternate_voice.voice_uri')); }
        var finder = function(v) { return v.voiceURI == voiceURI; };
        for(var idx = 0; idx < voiceURIs.length && !voice; idx++) {
          var voiceURI = voiceURIs[idx];
          voice = voices.find(finder);
          if(voiceURI == 'force_default') {
            voice = {voiceURI: 'force_default'};
          }
        }
        this.set('preferences.device.alternate_voice.voice_uri', voice && voice.voiceURI);
      }
    }
  ),
  stats: DS.attr('raw'),
  avatar_url_with_fallback: computed('avatar_url', 'avatar_data_uri', 'fallback_avatar_url', function() {
    var url = this.get('avatar_data_uri') || this.get('avatar_url');
    if(!url) {
      url = this.get('fallback_avatar_url') || templateHelpers.path('avatars/avatar-0.png');
    }
    return url;
  }),
  using_for_a_while: computed('joined', 'appState.refresh_stamp', function() {
    var a_while_ago = window.moment().add(-2, 'weeks');
    var joined = window.moment(this.get('joined'));
    return (joined < a_while_ago);
  }),
  // currently_premium means fully-featured premium, 
  // as in a paid or sponsored communicator
  // (even a paid communicator who sets their role to supporter)
  // * or a free trial *
  currently_premium: computed('subscription.billing_state', 'grace_period', 'subscription.premium_supporter', 'subscription.premium_supporter_plus_communicator', 'subscription.never_expires', 'subscription.timestamp', function() {
    if(this.get('subscription.never_expires')) { return true; }
    // NOTE: Long-term purchases that have expired and have
    // remained unsynced for a while could be
    // marked as not-currently-premium, but if you're 
    // offline they're not going to be adding any load anyway
    if(this.get('grace_period')) { return true; }
    if(this.get('subscription.billing_state') == 'modeling_only') { return false; }
    if(this.get('subscription.billing_state') == 'expired_communicator' || this.get('subscription.billing_state') == 'lapsed_communicator') { return false; }
    return (!this.get('subscription.premium_supporter') || this.get('subscription.billing_state') == 'trialing_supporter' || this.get('subscription.premium_supporter_plus_communicator'));
  }),
  currently_premium_or_fully_purchased: computed('currently_premium', 'fully_purchased', function() {
    return !!(this.get('currently_premium') || this.get('fully_purchased'));
  }),
  currently_premium_or_premium_supporter: computed('currently_premium', 'supporter_role', 'subscription.premium_supporter', function() {
    return !!(this.get('currently_premium') || (this.get('supporter_role') && this.get('subscription.premium_supporter')));
  }),
  unclear_if_subscription_active: computed('subscription.timestamp', function() {
    // TODO: If the user's subscription_hash is outdated
    // by more than 2 months and says it's active
    // but they are monthly or 
    // long-term-whose-expiration-has-passed, encourage a sync
  }),
  // limited_paid_supervisor is a PAID supervisor who doesn't have
  // any communicators they're working with, and so are 
  // slightly limited to prevent people just using as 
  // a communicator account.
  limited_paid_supervisor: computed('subscription.limited_supervisor', 'currently_premium', 'subscription.premium_supporter', function() {
    return !!(this.get('subscription.premium_supporter') && this.get('subscription.limited_supervisor') && !this.get('currently_premium'));
  }),
  any_limited_supervisor: computed('limited_paid_supervisor', 'modeling_only', function() {
    return !!(this.get('limited_paid_supervisor') || this.get('modeling_only'));
  }),
  // modeling_only has no cloud extras, no editing, no reports
  // no personal home board
  // yes modeling ideas for supervisees
  modeling_only: computed(
    'subscription.billing_state', 
    'supporter_role',
    'grace_period',
    'modeling_session',
    'expiration_passed',
    'subscription.premium_supporter',
    function() {
      if(this.get('modeling_session')) { return true; }
      if(this.get('subscription.billing_state') == 'modeling_only' && !this.get('grace_period')) { return true; }
      // auto-convert a free-trial supporter to modeling_only when their trial expires
      if(this.get('supporter_role') && !this.get('subscription.premium_supporter')) {
        if(this.get('expiration_passed')) { return true; }
      }
      return false;
    }
  ),
  expiration_passed: computed('subscription.expires', 'appState.refresh_stamp', function() {
    if(!this.get('subscription.expires')) { return false; }
    var now = window.moment();
    var expires = window.moment(this.get('subscription.expires'));
    return expires < now;
  }),
  expired: computed('expiration_passed', 'membership_type', 'supporter_role', 'fully_purchased', function() {
    // expired is only true for users who have
    // never fully-purchased the app in any form
    if(this.get('membership_type') == 'free') { return true; }
    var passed = this.get('expiration_passed');
    if(!passed) { return false; }
    // if(this.get('supporter_role')) { return false; }
    if(this.get('fully_purchased')) { return false; }
    return !!passed;
  }),
  lapsed: computed('subscription.lapsed_communicator', 'expiration_passed', 'supporter_role', 'fully_purchased', function() {
    // lapsed is a communicator who paid money, but
    // their cloud extras have now expired
    if(this.get('supporter_role')) { return false; }
    if(!this.get('fully_purchased')) { return false; }
    return !!(this.get('subscription.lapsed_communicator') || this.get('expiration_passed'));
  }),
  eval_end_date: computed('subscription.eval_account', 'subscription.eval_expires', function() {
    if(this.get('subscription.eval_account') && this.get('subscription.eval_expires')) {
      var expires = window.moment(this.get('subscription.eval_expires'));
      return expires;
    }
  }),
  eval_ending: function(days_to_go) {
    var expires = this.get('eval_end_date');
    if(expires) {
      var cutoff = window.moment().add(days_to_go, 'day');
      return expires < cutoff;
    }
    return false;
  },
  eval_ended: computed('subscription.eval_account', 'subscription.eval_expires', 'appState.refresh_stamp', function() {
    return this.eval_ending(0);
  }),
  eval_ending_soon: computed('subscription.eval_account', 'subscription.eval_expires', 'appState.refresh_stamp', function() {
    return this.eval_ending(14) && !this.eval_ending(0);
  }),
  can_reset_eval: computed('subscription.eval_account', 'is_managed', 'supervisors', 'supervisors.length', 'permissions.supervise', 'permissions.user_id', function() {
    return !!(this.get('subscription.eval_account') && (((this.get('supervisors') || []).length == 0) && !this.get('is_managed')) || (this.get('permissions.supervise') && this.get('permissions.user_id') != this.get('id')));
  }),
  joined_within_24_hours: computed('appState.refresh_stamp', 'joined', function() {
    var one_day_ago = window.moment().add(-1, 'day');
    if(this.get('joined') && this.get('joined') > one_day_ago) {
      return true;
    }
    return false;
  }),
  really_expired: computed('expired', 'subscription.expires', 'fully_purchased', 'subscription.premium_supporter', function() {
    if(!this.get('expired')) { return false; }
    if(this.get('fully_purchased')) { return false; }
    if(this.get('subscription.premium_supporter')) { return false; }
    var now = window.moment();
    var expires = window.moment(this.get('subscription.expires')).add(14, 'day');
    return (expires < now);
  }),
  really_really_expired: computed('expired', 'subscription.expires', 'fully_purchased', 'subscription.premium_supporter', function() {
    if(!this.get('expired')) { return false; }
    if(this.get('fully_purchased')) { return false; }
    if(this.get('subscription.premium_supporter')) { return false; }
    var now = window.moment();
    var expires = window.moment(this.get('subscription.expires')).add(6, 'month');
    return (expires < now);
  }),
  fully_purchased: computed('subscription.fully_purchased', function() {
    return !!this.get('subscription.fully_purchased');
  }),
  grace_period: computed(
    'subscription.grace_period',
    'expiration_passed',
    function() {
      if(!this.get('subscription.grace_period')) { return false; }
      else if(this.get('expiration_passed')) { return false; }
      else { return true; }
    }
  ),
  expired_or_grace_period: computed('expired', 'grace_period', function() {
    return !!(this.get('expired') || this.get('grace_period'));
  }),
  supporter_role: computed('preferences.role', function() {
    return this.get('preferences.role') == 'supporter';
  }),
  communicator_in_supporter_view: computed('preferences.role', 'preferences.device.role', function() {
    return this.get('preferences.role') != 'supporter' && this.get('preferences.device.role') == 'supporter';
  }),
  supporter_view: computed('preferences.role', 'preferences.device.role', function() {
    return this.get('preferences.role') == 'supporter' || this.get('preferences.device.role') == 'supporter';
  }),
  profile_url: computed('user_name', function() {
    var prefix = location.protocol + '//' + location.host;
    if(capabilities.installed_app && capabilities.api_host) {
      prefix = capabilities.api_host;
    }
    return prefix + '/' + this.get('user_name');
  }),
  first_incomplete_lesson: computed('sorted_lessons', function() {
    return (this.get('sorted_lessons') || []).find(function(l) { return !l.completed; });
  }),
  sorted_lessons: computed('lessons', function() {
    var source_scores = {org: 1, unit: 2, user: 4, supervisee: 3};
    return (this.get('lessons') || []).sort(function(a, b) {
      var a_score = source_scores[a.source] || 0;
      var b_score = source_scores[a.source] || 0;
      if(a.required && !b.required) {
        return -1;
      } else if(b.required && !a.required) {
        return 1;
      }
      if(a_score != b_score) {
        return b_score - a_score;
      }
      if(a.due_ts && !b.due_ts) {
        return -1;
      } else if(b.due_ts && !a.due_ts) {
        return 1;
      } else if(a.due_ts != b.due_ts) {
        return b.due_ts - a.due_ts;
      } else {
        return a.title.localeCompare(b.title);
      }
    });
  }),
  multiple_devices: computed('devices', function() {
    return (this.get('devices') || []).length > 1;
  }),
  device_count: computed('devices', function() {
    return (this.get('devices') || []).length;
  }),
  current_device_name: computed('devices', function() {
    var device = (this.get('devices') || []).findBy('current_device', true);
    return (device && device.name) || "Unknown device";
  }),
  access_method: computed(
    'preferences.device.scanning',
    'preferences.device.scan_mode',
    'preferences.device.dwell',
    'preferences.device.dwell_type',
    function() {
      if(this.get('preferences.device.scanning')) {
        if(this.get('preferences.device.scan_mode') == 'axes') {
          return 'axis_scanning';
        } else {
          return 'scanning';
        }
      } else if(this.get('preferences.device.dwell')) {
        if(this.get('preferences.device.dwell_type') == 'arrow_dwell') {
          return 'arrow_dwell';
        } else {
          return 'dwell';
        }
      } else {
        return 'touch';
      }
    }
  ),
  hide_symbols: computed(
    'preferences.device.button_text',
    'preferences.device.button_text_position',
    function() {
      var device = this.get('preferences.device');
      if(!device) { return false; }
      return device.button_text == 'text_only' || device.button_text_position == 'text_only';
    }
  ),
  preferred_symbol_library: function(board) {
    if(board && board.get('user_name')) {
      if(board.get('user_name') == this.get('user_name')) {
        // On my boards, default to my preferred symbols.
        // 'original' means "keep the board's original symbols" and isn't
        // a valid OpenSymbols repo, so fall back to 'opensymbols'.
        var pref = this.get('preferences.preferred_symbols');
        return (pref && pref !== 'original') ? pref : 'opensymbols';
      } else {
        // On a supervisee's boards, default to their preferred symbols if set
        var sup = this.get('known_supervisees').find(function(s) { return s.user_name == board.get('user_name'); });
        var symbols = sup && (emberGet(sup, 'preferred_symbols') || emberGet(sup, 'preferences.preferred_symbols'));
        if(symbols && symbols !== 'original') {
          return symbols;
        }
      }
    }
    if(board.get('current_library')) {
      // If the board has a proprietary library, use that
      if(['pcs', 'symbolstix', 'lessonpix'].indexOf(board.get('current_library'))) {
        return board.get('current_library');
      }
    }
    // Fall back to the user's preferred symbols
    return this.get('preferences.preferred_symbols') || 'opensymbols';
  },
  remove_device: function(id) {
    var url = '/api/v1/users/' + this.get('user_name') + '/devices/' + id;
    var _this = this;
    return this.persistence.ajax(url, {type: 'POST', data: {'_method': 'DELETE'}}).then(function(res) {
      var devices = _this.get('devices') || [];
      var new_devices = [];
      for(var idx = 0; idx < devices.length; idx++) {
        if(devices[idx].id != id) {
          new_devices.push(devices[idx]);
        }
      }
      _this.set('devices', new_devices);
    });
  },
  rename_device: function(id, name) {
    var url = '/api/v1/users/' + this.get('user_name') + '/devices/' + id;
    var _this = this;
    return this.persistence.ajax(url, {type: 'POST', data: {'_method': 'PUT', device: {name: name}}}).then(function(res) {
      var devices = _this.get('devices') || [];
      var new_devices = [];
      for(var idx = 0; idx < devices.length; idx++) {
        if(devices[idx].id != id) {
          new_devices.push(devices[idx]);
        } else {
          new_devices.push(res);
        }
      }
      _this.set('devices', new_devices);
    });
  },
  sidebar_boards_with_fallbacks: computed('preferences.sidebar_boards', function() {
    var boards = this.get('preferences.sidebar_boards') || [];
    var res = [];
    var _this = this;
    boards.forEach(function(board) {
      var board_object = EmberObject.create(board);
      _this.persistence.find_url(board.image, 'image').then(function(data_uri) {
        board_object.set('image', data_uri);
      }, function() { });
      res.push(board_object);
    });
    return res;
  }),
  checkForDataURL: function() {
    this.set('checked_for_data_url', true);
    var url = this.get('avatar_url_with_fallback');
    var _this = this;
    if(!this.get('avatar_data_uri') && LingoLinq.remote_url(url)) {
      return this.persistence.find_url(url, 'image').then(function(data_uri) {
        _this.set('avatar_data_uri', data_uri);
        return _this;
      });
    } else if(url && url.match(/^data/)) {
      return RSVP.resolve(this);
    } else if(url && (url.match(/^file/) || url.match(/localhost/))) {
      return RSVP.resolve(capabilities.storage.fix_url(url, true));
    }
    return RSVP.reject('no user data url');
  },
  checkForDataURLOnChange: observer('avatar_url', function() {
    this.checkForDataURL().then(null, function() { });
  }),
  validate_pin: observer('preferences.speak_mode_pin', function() {
    var pin = this.get('preferences.speak_mode_pin');
    var new_pin = (pin || "").replace(/[^\d]/g, '').substring(0, 4);
    if(pin && pin != new_pin) {
      this.set('preferences.speak_mode_pin', new_pin);
    }
  }),
  all_note_templates: computed('organizations.@each.note_templates', function() {
    var res = [];
    var org_ids = {};
    (this.get('organizations') || []).forEach(function(org) {
      if(!org_ids[org.id]) {
        (org.note_templates || []).forEach(function(template) {
          org_ids[org.id] = true;
          template.org_name = org.name;
          var found = false;
          if(template.default) {
            found = !!res.find(function(t) { return t.title == template.title && t.default; });
          }
          if(!found) {
            res.push(template);
          }
        });
      }
    });
    if(Object.keys(org_ids).length > 1) {
      res.forEach(function(t) { 
        if(!t.default) {
          t.title = t.title + " - " + t.org_name;
        }
      });
    }
    if(res.length > 0) { return res; }
    return null;
  }),
  all_extra_colors: computed('preferences.extra_colors', 'organizations.@each.extra_colors', function() {
    var res = [];
    var extra = this.get('preferences.extra_colors');
    if(extra && extra.forEach) {
      extra.forEach(function(color) {
        res.push(color);
      });
    }
    var org_ids = {};
    (this.get('organizations') || []).forEach(function(org) {
      if(!org_ids[org.id]) {
        (org.extra_colors || []).forEach(function(color) {
          org_ids[org.id] = true;
          res.push(color);
        });
      }
    });
    if(res.length > 0) { return res; }
    return null;
  }),
  needs_speak_mode_intro: computed('joined', function() {
    var joined = window.moment(this.get('joined'));
    var cutoff = window.moment('2018-02-20');
    if(joined >= cutoff) {
      return true;
    }
    return false;
  }),
  auto_sync: computed(
    'preferences.device.auto_sync',
    'preferences.device.ever_synced',
    function() {
      var ever_synced = this.get('preferences.device.ever_synced');
      var auto_sync = this.get('preferences.device.auto_sync');
      if(auto_sync === true || auto_sync === false) {
        return auto_sync;
      } else {
        if(capabilities.installed_app) {
          return true;
        } else if(ever_synced === true) {
          return true;
        } else if(ever_synced === false) {
          return false;
        } else if(ever_synced == null) {
          return true;
        }
      }
    }
  ),
  load_more_supervision: observer('load_all_connections', 'sync_stamp', function() {
    var _this = this;
    var localize_connections = function(sups) {
      (sups || []).forEach(function(sup) {
        if(LingoLinq.remote_url(sup.avatar_url)) {
          this.persistence.find_url(sup.avatar_url, 'image').then(function(uri) {
            emberSet(sup, 'original_avatar_url', sup.avatar_url);
            emberSet(sup, 'avatar_url', uri);
          }, function() { });
        } else if(sup.avatar_url && (sup.avatar_url.match(/^file:/) || sup.avatar_url.match(/localhost/))) {
          emberSet(sup, 'avatar_url', capabilities.storage.fix_url(sup.avatar_url, true));
        } 
      });
    };
    if(this.get('load_all_connections') && (!this.get('all_connections.loaded') || this.get('all_connections.stamp') != this.get('sync_stamp'))) {
      _this.set('all_connections', {loading: true, sync_stamp: _this.get('sync_stamp')});
      var defer = RSVP.defer();
      _this.set('all_connections_promise', defer.promise);
      var advance = function(type) {
        defer[type] = true;
        if(defer.supervisors && defer.supervisees) {
          defer.resolve();
        }
      };
      if((this.get('supervisors') || []).length >= 10) {
        Utils.all_pages('/api/v1/users/' + this.get('id') + '/supervisors', {result_type: 'user', type: 'GET', data: {}}, function(data) {
        }).then(function(res) {
          _this.set('supervisors', res);
          localize_connections(res);
          _this.set('all_connections.supervisors', true);
          advance('supervisors');
        }, function(err) {
          console.log('error loading supervisors');
          console.log(err);
          _this.set('all_connections.error', true);
          advance('supervisors');
        });
      } else {
        localize_connections(_this.get('supervisors'));
        _this.set('all_connections.supervisors', true);
        advance('supervisors');
      }
      if((this.get('supervisees') || []).length >= 10) {
        Utils.all_pages('/api/v1/users/' + this.get('id') + '/supervisees', {result_type: 'user', type: 'GET', data: {}}, function(data) {
        }).then(function(res) {
          _this.set('supervisees', res);
          _this.set('all_supervisees', res);
          localize_connections(res);
          _this.set('all_connections.supervisees', true);
          advance('supervisees');
        }, function(err) {
          console.log('error loading supervisees');
          console.log(err);
          _this.set('all_connections.error', true);
          advance('supervisees');
        });
      } else {
        localize_connections(_this.get('supervisees'));
        _this.set('all_connections.supervisees', true);
        advance('supervisees');
      }
      _this.set('all_connections_loaded', true);
    }
  }),
  known_supervisees: computed('all_supervisees', 'supervisees', function() {
    var res = this.get('all_supervisees') || this.get('supervisees') || [];
    LingoLinq.User.ws_accesses = LingoLinq.User.ws_accesses || {};
    var cutoff = ((new Date()).getTime() - (10 * 60 * 1000)) / 1000;
    res.forEach(function(sup) {
      if(LingoLinq.User.ws_accesses[emberGet(sup, 'id')] > cutoff) {
        emberSet(sup, 'online', true);          
      }  
    });
    return res;
  }),
  check_all_connections: observer(
    'all_connections',
    'all_connections.supervisors',
    'all_connections.supervisees',
    function() {
      if(this.get('all_connections.supervisors') && this.get('all_connections.supervisees')) {
        this.set('all_connections.loading', null);
        this.set('all_connections.loaded', true);
      }
    }
  ),
  load_active_goals: function() {
    var _this = this;
    this.store.query('goal', {active: true, user_id: this.get('id')}).then(function(list) {
      _this.set('active_goals', list.map(function(i) { return i; }).sort(function(a, b) {
        if(a.get('primary')) {
          return -1;
        } else if(b.get('primary')) {
          return 1;
        } else {
          return a.get('id') - b.get('id');
        }
      }));
    }, function() { });
  },
  find_button: function(label) {
    return this.load_button_sets().then(function(list) {
      var promises = [];
      var closest = list.length + 1;
      var best = null;
      list.forEach(function(bs, idx) {
        promises.push(bs.find_buttons(label).then(function(res) {
          res.forEach(function(btn) {
            if(btn.label && label && btn.label.toLowerCase() == label.toLowerCase() && idx < closest) {
              best = btn;
            }
          });
        }));
      });
      return RSVP.all_wait(promises).then(function() {
        if(best) {
          return best;
        } else {
          return RSVP.reject({error: 'no exact matches found'});
        }
      });
    });
  },
  load_button_sets: function() {
    var ids = [];
    if(this.get('preferences.home_board.id')) {
      ids.push(this.get('preferences.home_board.id'));
    }
    (this.get('preferences.sidebar_boards') || []).forEach(function(b) {
      if(b.key) {
        ids.push(b.key);
      }
    });
    if(this.get('preferences.sync_starred_boards')) {
      (this.get('stats.starred_board_refs') || []).forEach(function(ref) {
        ids.push(ref.id);
      });
    }
    var promises = [];
    var list = [];
    ids.forEach(function(id, idx) {
      promises.push(LingoLinq.Buttonset.load_button_set(id).then(function(bs) {
        list[idx] = bs;
      }));
    });
    return RSVP.all_wait(promises).then(function() {
      var res = [];
      list.forEach(function(i) { if(i) { res.push(i); } });
      return res;
    });
  },
  check_integrations: function(reload) {
    var res = null;
    var _this = this;
    if(this.get('permissions.supervise')) {
      _this.set('integrations', {loading: true});
      res = LingoLinq.User.check_integrations(this.get('id'), reload);
    } else {
      res = RSVP.reject({error: 'not allowed'});
    }
    if(res && res.then) {
      res.then(function(ints) {
        _this.set('integrations', ints);
      }, function(err) {
        _this.set('integrations', err);
      });
    }
    return res;
  },
  find_integration: function(key, supervisee_user_name) {
    var search_user = LingoLinq.User.find_integration(this.get('id'), key);
    var user = this;
    var supervisee_fallback = search_user.then(null, function(err) {
      if(err.error == 'no matching integration found' && supervisee_user_name) {
        var sup = (user.get('supervisees') || []).find(function(sup) { return sup.user_id == supervisee_user_name || sup.user_name == supervisee_user_name });
        if(sup) {
          return LingoLinq.User.find_integration(sup.user_id || sup.user_name, key);
        } else {
          return RSVP.reject({error: 'no matching integration found for user or board author'});
        }
      } else {
        return RSVP.reject(err);
      }
    });
    return supervisee_fallback;
  },
  add_action: function(action) {
    var actions = this.get('offline_actions') || [];
    actions.push(action);
    this.set('offline_actions', actions);
  },
  tag_board: function(board, tag, remove, downstream) {
    var _this = this;
    return this.persistence.ajax('/api/v1/boards/' + board.get('id') + '/tag', {
      type: 'POST',
      data: {
        tag: tag,
        remove: !!remove,
        downstream: !!downstream
      }
    }).then(function(res) {
      if(res.tagged) {
        if(res.board_tags) {
          _this.set('board_tags', res.board_tags);
        }
        if(res.board_tag_map) {
          _this.set('board_tag_map', res.board_tag_map);
        }
        _this.reload();
        return true;
      } else {
        return RSVP.reject({error: 'tag failed'});
      }
    });
  },
  ensureBoardTag: function(tag) {
    var _this = this;
    return this.persistence.ajax('/api/v1/users/' + this.get('id') + '/board_tags/ensure', {
      type: 'POST',
      data: { tag: tag }
    }).then(function(res) {
      if(res.ok) {
        if(res.board_tags) {
          _this.set('board_tags', res.board_tags);
        }
        if(res.board_tag_map) {
          _this.set('board_tag_map', res.board_tag_map);
        }
        return true;
      }
      return RSVP.reject({ error: 'ensure tag failed' });
    });
  },
  copy_home_board: function(board, swap_images, home_level) {
    // TODO: change this to create a shallow clone
    // instead of copying everything
    var user = this;
    var board_key = emberGet(board, 'key');
    var board_id = emberGet(board, 'id');
    var preferred_symbols = user.get('preferences.preferred_symbols') || 'original';
    var copy_promise = new RSVP.Promise(function(resolve, reject) {
      user.set('home_board_pending', board_key);
      LingoLinq.store.findRecord('board', board_id).then(function(board) {
        var swap_library = null;
        if(swap_images && preferred_symbols && preferred_symbols != 'original') { swap_library = user.get('preferences.preferred_symbols'); }
        user.set('copy_level', home_level);
        editManager.copy_board(board, 'links_copy_as_home', user, false, swap_library).then(function(new_board) {
          user.set('home_board_pending', false);
          var p = (user && user.persistence) || (typeof window !== 'undefined' && window.persistence);
          if(p && typeof p.get === 'function' && p.get('online') && p.get('auto_sync')) {
            runLater(function() {
              var p2 = (user && user.persistence) || (typeof window !== 'undefined' && window.persistence);
              if(p2 && typeof p2.get === 'function' && p2.get('auto_sync')) {
                console.debug('syncing because home board changes');
                p2.sync('self', null, null, 'home_board_copied').then(null, function() { });
              }
            }, 1000);
          }
          user.set('home_board_copy', {id: user.get('preferences.home_board.id'), at: (new Date()).getTime()});
          resolve(new_board);
        }, function() {
          user.set('home_board_pending', false);
          reject({error: 'copy failed'});
        });
      }, function() {
        user.set('home_board_pending', false);
        reject({error: 'board not found'});
      });
    });
    copy_promise.then(null, function() { return RSVP.resolve(); }).then(function() {
      if(user.get('copy_promise') == copy_promise) {
        user.set('copy_promise', null);
      }
    });
    user.set('copy_promise', copy_promise);
    return copy_promise;
  },
  assert_local_boards: function() {
    var _this = this;
    var user_name = _this.get('user_name');
    return new RSVP.Promise(function(resolve, reject) {
      // ensure you're online
      if(_this.persistence.get('online')) {
        // retrieve all locally-saved boards
        return lingoLinqExtras.storage.find_all('board').then(function(list) {
          var promises = [];
          list.forEach(function(item) {
            // filter to only those owned by the current user
            if(item.data && item.data.raw && item.data.raw.user_name == user_name) {
              // load each local copy and call .save to PUT the local version
              var existing = LingoLinq.store.peekRecord('board', item.data.raw.id);
              if(!existing) {
                var json_api = { data: {
                  id: item.data.raw.id,
                  type: 'board',
                  attributes: item.data.raw
                }};
                existing = LingoLinq.store.push(json_api);
              }
              for(var key in item.data.raw) {
                existing.set(key, item.data.raw[key]);
              }
              promises.push(existing.save());
            }
          });
          RSVP.all_wait(promises).then(function(res) {
            resolve(list);
          }, function(err) {
            reject({error: err, save_failed: true});
          });
        }, function(err) {
          reject(err);
        });      
      } else {
        reject({error: 'not online'});
      }
    });
  },
  swap_home_board_images: function(swap_library) {
    var user = this;
    user.set('preferred_symbols_changed', null);
    user.set('original_preferred_symbols', null);
    var now = (new Date()).getTime();
    var re = new RegExp("^" + user.get('user_name') + "\\\/");
    var board_id = user.get('preferences.home_board.id');
    var swap_library = user.get('preferences.preferred_symbols')
    var defer = RSVP.defer();
    var find = LingoLinq.store.findRecord('board', board_id).then(function(board) {
      defer.ready_to_swap = function(board_id) {
        var err = function() {
          modal.error(i18n.t('error_swapping_images', "There was an unexpected error when trying to update your home board's symbol library"));
          defer.reject();
        };
        // retrieve board
        var persistenceForSwap = user.persistence || (typeof window !== 'undefined' && window.persistence);
        BoardHierarchy.load_with_button_set(board, {prevent_keyboard: true, prevent_different: true}).then(function(hierarchy) {
          if(!persistenceForSwap) { return err(); }
          var board_ids_to_include = hierarchy.selected_board_ids();
          persistenceForSwap.ajax('/api/v1/boards/' + board_id + '/swap_images', {
            type: 'POST',
            data: {
              library: swap_library,
              include_new: true,
              board_ids_to_convert: board_ids_to_include
            }
          }).then(function(res) {
            progress_tracker.track(res.progress, function(event) {
              if(event.status == 'errored') {
                err();
              } else if(event.status == 'finished') {
                // reload board and re-sync (use persistenceForSwap from outer closure; avoid this.persistence in .then callback)
                runLater(function() {
                  board.reload(true).then(function() {
                    if(persistenceForSwap && persistenceForSwap.get && persistenceForSwap.get('auto_sync')) {
                      console.debug('syncing because home board symbol changes');
                      persistenceForSwap.sync('self', null, null, 'home_board_symbols_changed').then(null, function() { });
                    }
                  }, function() { });
                  defer.resolve();
                });
              }
            });
          }, function(res) {
            err();
          });  
        }, function(err) {
          err();
        });
      }
    }, function() { defer.reject(); });
    if(user.get('copy_promise')) {
      // If the user's home board is copying, queue a swap_images call
      user.get('copy_promise').then(function(new_board) {
        find.then(function() {
          defer.ready_to_swap(new_board.get('id')); 
        })
      });
    } else if(user.get('home_board_copy') && user.get('home_board_copy.at') > (now - (60 * 60 * 1000)) && user.get('home_board_copy.id') == board_id) {
      // If the user's home board is brand new, trigger a swap_images call
      find.then(function() {
        defer.ready_to_swap(board_id);
      })
    } else if(user.get('preferences.home_board.key').match(re)) {
      // If the user's home board is owned by them but not brand new, open the swap-images modal with a special prompt
      defer.promise.wait = true;
      find.then(function(board) {
        modal.open('swap-images', {board: board, button_set: board.get('button_set'), library: swap_library, confirmation: true}).then(function() {
          defer.resolve();        
        });  
      });
    }

    return defer.promise;
  },
  check_user_name: observer('watch_user_name_and_cookies', 'user_name', function() {
    if(this.get('watch_user_name_and_cookies')) {
      var user_name = this.get('user_name');
      var user_id = this.get('id');
      this.set('user_name_check', null);
      if(user_name && user_name.length > 2) {
        var _this = this;
        _this.set('user_name_check', {checking: true});
        this.store.findRecord('user', user_name).then(function(u) {
          if(user_name == _this.get('user_name') && u.get('id') != user_id) {
            _this.set('user_name_check', {exists: true});
          }
        }, function() {
          if(user_name == _this.get('user_name')) {
           _this.set('user_name_check', {exists: false});
          }
          return RSVP.resolve();
        });
      }
    }
  }),
  toggle_cookies: observer('watch_user_name_and_cookies', 'preferences.cookies', function() {
    if(this.get('watch_user_name_and_cookies')) {
      var val = this.get('preferences.cookies');
      if(val !== undefined && val !== null) {
        this.appState.toggle_cookies(val === true || val === 'true');
      }
    }
  }),
  load_word_activities: function() {
    // if already loaded for the user, keep the local copy unless it's really old
    var _this = this;
    if(this.get('word_activities')) {
      if(this.get('word_activities.promise')) {
        return this.get('word_activities.promise');
      }
      var cutoff = window.moment().add(-3, 'days').toISOString();
      if(this.get('word_activities.checked') > cutoff) {
        return RSVP.resolve(this.get('word_activities'));
      }
    }
    var try_online = RSVP.reject();
    // try a remote lookup, which will possibly return a progress object
    if(this.persistence.get('online')) {
      try_online = this.persistence.ajax('/api/v1/users/' + _this.get('id') + '/word_activities', {type: 'GET'}).then(function(res) {
        if(res.progress) {
          return new RSVP.Promise(function(resolve, reject) {
            progress_tracker.track(res.progress, function(event) {
              if(event.status == 'errored') {
                reject({error: 'processing failed'});
              } else if(event.status == 'finished') {
                resolve(event.result);
              }
            });
          });
        } else {
          return RSVP.resolve(res);
        }
      });
    }
    // if not possible or errored, check for a local copy in the dataCache
    var try_local = try_online.then(function(res) {
      // persist to dataCache
      _this.persistence.store('dataCache', res, 'word_activities/' + _this.get('id')).then(null, function() { });
      _this.set('word_activities', res);
      return RSVP.resolve(res);
    }, function() {
      return _this.persistence.find('dataCache', 'word_activities/' + _this.get('id'));
      // look up a local copy
    });
    var promise_result = try_local.then(function(res) {
      res.local_log = [];
      return _this.persistence.find('dataCache', 'word_log/' + _this.get('id')).then(function(list) {
        res.local_log = list;
        return res;
      }, function() { return RSVP.resolve(res); });
    });
    promise_result.then(null, function() { });
    this.set('word_activities', {promise: promise_result});
    return promise_result;
  },
  log_word_activity: function(opts) {
    opts.timestamp = this.stashes.current_timestamp();
    var user_id = this.get('id');
    this.stashes.log_event(opts, user_id);
    this.stashes.push_log(true);
    this.persistence.find('dataCache', 'word_log/' + user_id).then(null, function() { return RSVP.resolve([]); }).then(function(list) {
      var cutoff = parseInt(window.moment().add(-2, 'week').format('X'), 10);
      list = (list || []).filter(function(e) { return e.timestamp > cutoff; });
      list.push(opts);
      this.persistence.store('dataCache', list, 'word_log/' + user_id).then(null, function() { });
    });
  }
});
LingoLinq.User.integrations_for = {};
LingoLinq.User.find_integration = function(user_name, key) {
  var integrations_for = LingoLinq.User.integrations_for;
  var loading = integrations_for[user_name] && integrations_for[user_name].promise;
  if(!loading) {
    if(integrations_for[user_name] && integrations_for[user_name].length) {
      loading = RSVP.resolve(integrations_for[user_name]);
    } else {
      loading = LingoLinq.User.check_integrations(user_name);
    }
  }
  return loading.then(function(list) {
    if(list && list.length > 0) {
      var res = list.find(function(integration) { return integration.get('template_key') == key; });
      if(res) {
        return res;
      } else {
        return RSVP.reject({error: 'no matching integration found'});
      }
    } else {
      return RSVP.reject({error: 'no matching integration found'});
    }
  });
};
LingoLinq.User.check_integrations = function(user_name, reload) {
  var integrations_for = LingoLinq.User.integrations_for;
  if(integrations_for[user_name] && integrations_for[user_name].promise) {
    return integrations_for[user_name].promise;
  }
  if(reload === true) { integrations_for[user_name] = null; }
  if(integrations_for[user_name]) {
    return RSVP.resolve(integrations_for[user_name]);
  }
  var promise = Utils.all_pages('integration', {user_id: user_name}, function(partial) {
  }).then(function(res) {
    LingoLinq.User.integrations_for[user_name] = res;
    return res;
  }, function(err) {
    LingoLinq.User.integrations_for[user_name] = {error: true};
    return RSVP.reject({error: 'error retrieving integrations'});
  });
  promise.then(null, function() { });
  LingoLinq.User.integrations_for[user_name] = {loading: true, promise: promise};
  return promise;
};

LingoLinq.User.devices = [
  {id: 'grid', name: i18n.t('grid', "Grid Pad, Grid for iOS"), img: 'grid-3.png', vocabs: [
    // podd, supercore, text talker, word power, vocabulary for life, beeline
    {id: 'supercore_30', name: i18n.t('super_core_30', "Super Core 30"), buttons: 30, img: 'super-core.png'},
    {id: 'supercore_50', name: i18n.t('super_core_50', "Super Core 50"), buttons: 50, img: 'super-core.png'},
    {id: 'text_talker', name: i18n.t('text_talker', "Text Talker"), buttons: 46, img: 'text-talker.png'},
    {id: 'word_power_25', name: i18n.t('word_power_25', "WordPower 25"), buttons: 25, img: 'wordpower.png'},
    {id: 'word_power_60', name: i18n.t('word_power_60', "WordPower 60"), buttons: 60, img: 'wordpower.png'},
    {id: 'word_power_100', name: i18n.t('word_power_100', "WordPower 100"), buttons: 100, img: 'wordpower.png'},
    {id: 'vocab_for_life', name: i18n.t('vocabulary_for_life', "Vocabulary for Life"), buttons: 42, img: 'vocabulary-for-life.png'},
    {id: 'beeline', name: i18n.t('beeline', "Beeline"), buttons: 88, img: 'beeline.png'},
    {id: 'custom', name: i18n.t('custom_vocabulary', "Custom Vocabulary")},
    {id: 'other_grid', name: i18n.t('other_grid_vocabulary', "Other Vocabulary")},
  ]},
  {id: 'alpha_core', name: i18n.t('alpha_core', "AlphaCore"), img: 'alpha-core-grid.png', vocabs: [
    {id: 'alphacore', name: i18n.t('alphacore_keyboard', "AlphaCore Keyboard"), buttons: 168},
    {id: 'touchtype', name: i18n.t('touchtype keyboard', "TouchType Keyboard"), buttons: 38},
    {id: 'large', name: i18n.t('large_keyboard', "Large Keyboard"), buttons: 42},
    {id: 'xlarge', name: i18n.t('extra_large_keyboard', "Extra-Large Keyboard"), buttons: 16},
    {id: 'custom', name: i18n.t('custom_keyboard', "Custom Keyboard")},
    // touchtype keyboard (38), large keyboard (6 x 7 42), extra large keyboard (4 x 4 16), alphacore keyboard (12x14 168)
  ]},
  {id: 'lamp_wfl', name: i18n.t('lamp_words_for_life', "LAMP Words for Life"), img: 'lamp-wfl.png', vocabs: [
    {id: 'one_hit', name: i18n.t('one_hit', "One-Hit"), buttons: 84},
    {id: 'transition', name: i18n.t('transition', "Transition"), buttons: 84},
    {id: 'full', name: i18n.t('full_vocab', "Full Vocabulary"), buttons: 84},
    // 1-hit, transition, full vocab
  ]},
  {id: 'podd_book', name: i18n.t('podd_book', "PODD Book"), img: 'podd.png', vocabs: [
    {id: 'printed_podd', name: i18n.t('printed_podd', "Printed PODD Book"), buttons: 60},
    {id: 'simpodd_15', name: i18n.t('simpodd_15', "simPODD 15"), buttons: 15, img: 'simpodd.png'},
    {id: 'simpodd_60', name: i18n.t('simpodd_60', "simPODD 60"), buttons: 60, img: 'simpodd.png'},
    {id: 'podd_app', name: i18n.t('other_podd_software', "Other PODD Software"), buttons: 60},
  ]},
  {id: 'prc_accent', name: i18n.t('prc_accent', "PRC Accent Series"), img: 'prc-accent.png', vocabs: [
    {id: 'unity', name: i18n.t('unity', "Unity"), buttons: 84, img: 'prc-unity.png'},
    {id: 'wordpower_28', name: i18n.t('wordpower_28', "WordPower 28"), buttons: 28, img: 'wordpower.png'},
    {id: 'wordpower_36', name: i18n.t('wordpower_36', "WordPower 36"), buttons: 36, img: 'wordpower.png'},
    {id: 'wordpower_45', name: i18n.t('wordpower_45', "WordPower 45"), buttons: 45, img: 'wordpower.png'},
    {id: 'wordpower_60', name: i18n.t('wordpower_60', "WordPower 60"), buttons: 60, img: 'wordpower.png'},
    {id: 'wordpower_84', name: i18n.t('wordpower_84', "WordPower 84"), buttons: 84, img: 'wordpower.png'},
    {id: 'wordpower_144', name: i18n.t('wordpower_144', "WordPower 144"), buttons: 144, img: 'wordpower.png'},
    {id: 'essence', name: i18n.t('essence', "Essence"), buttons: 18, img: 'prc-essence.png'},
    {id: 'empower', name: i18n.t('empower', "Empower"), buttons: 36},
    {id: 'corescanner', name: i18n.t('corescanner', "CoreScanner"), img: 'prc-core-scanner.png'},
    // unity, wordpower, essence, scorescanner, wordcore
  ]},
  {id: 'assistiveware', name: i18n.t('assistiveware_proloquo', "AssistiveWare (Proloquo, etc.)"), img: 'ipad.png', vocabs: [
    {id: 'p2g_crescendo', name: i18n.t('proloquo2go_crescendo', "Proloquo2Go Crescendo"), buttons: 77, img: 'proloquo2go.png'},
    {id: 'p2g_gateway', name: i18n.t('proloquo2go_gateway', "Proloquo2Go Gateway"), buttons: 60, img: 'proloquo2go.png'},
    {id: 'p4text', name: i18n.t('proloquo4text', "Proloquo4Text"), buttons: 70, img: 'proloquo4text.png'},
  ]},
  {id: 'sfy', name: i18n.t('speak_for_yourself', "Speak for Yourself"), img: 'speak-for-yourself.png', vocabs: [
    {id: 'default', name: i18n.t('default_vocabulary', "Default Vocabulary"), buttons: 120},
    {id: 'custom', name: i18n.t('custom_vocabulary', "Custom Vocabulary"), buttons: 120},
    // sfy (120)
  ]},
  {id: 'td_snap', name: i18n.t('td_snap', "TD Snap"), img: 'td-snap.png', vocabs: [
    {id: 'core_first', name: i18n.t('core_first', "Core First"), buttons: 30},
    {id: 'text', name: i18n.t('td_snap_text', "TD Snap Text"), buttons: 35},
    {id: 'scanning', name: i18n.t('scanning_page_set', "Scanning Page Set"), buttons: 30},
    {id: 'podd_15', name: i18n.t('td_podd_15', "TD PODD 15"), buttons: 15},
    {id: 'podd_60', name: i18n.t('td_podd_60', "TD PODD 60"), buttons: 60},
    {id: 'gateway', name: i18n.t('gateway', "Gateway"), buttons: 56},
    {id: 'aphasia', name: i18n.t('aphasia_page_set', "Aphasia Page Set"), buttons: 16},
    // core first, text, scanning, podd, gateway, aphasia
    // https://us.tobiidynavox.com/pages/td-snap
  ]},
  {id: 'tobii_i', name: i18n.t('tobii_i_series', "Tobii i-Series"), img: 'tobii-i.png', vocabs: [
    {id: 'snap_core', name: i18n.t('snap_core', "Snap Core"), buttons: 30, img: 'td-snap-core.png'},
    {id: 'sono_flex', name: i18n.t('sono_flex', "Sono Flex"), buttons: 28, img: 'sono-flex.png'},
    {id: 'snap_scene', name: i18n.t('snap_scene', "Snap Scene")},
    {id: 'communicator', name: i18n.t('communicator', "Communicator"), img: 'tobii-communicator.png'},
    // snap core, sono flex, snap scene, communicator
  ]},
  {id: 'go_talk', name: i18n.t('go_talk', "GoTalk Device"), img: 'go-talk.png', vocabs: [
    {id: 'gotalk_4', name: i18n.t('gotalk_4', "GoTalk 4 (+)"), buttons: 4},
    {id: 'gotalk_9', name: i18n.t('gotalk_9', "GoTalk 9 (+)"), buttons: 9},
    {id: 'gotalk_20', name: i18n.t('gotalk_20', "GoTalk 20 (+)"), buttons: 20},
    {id: 'gotalk_32', name: i18n.t('gotalk_32', "GoTalk 32"), buttons: 32},
    // 4+, 9+, 20+, 32
  ]},
  {id: 'single_switch', name: i18n.t('single_button_message', "Single-Button Switch (eg. BIGmack)"), img: 'bigmack.png', vocabs: [
    {id: 'single_message', name: i18n.t('single_message', "Single-Message"), buttons: 1},
    {id: 'multi_message', name: i18n.t('multiple_message_sequence', "Multiple-Message (Seqence)"), buttons: 1},
  ]},
  {id: 'e_tran', name: i18n.t('clear_plastic_board_e_tran', "Clear Plastic Board (eg. E-Tran)"), img: 'e-tran.png', vocabs: [
    {id: 'default', name: i18n.t('default_layout', "Default Layout"), buttons: 8},
    {id: 'custom', name: i18n.t('custom_layout', "Custom Layout")},
    // default (8)
  ]}
  // avaz, gotalknow, predictable, clicker communicator, 
];


export default LingoLinq.User;
