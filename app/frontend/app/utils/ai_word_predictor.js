import RSVP from 'rsvp';
import $ from 'jquery';
import { later as runLater, cancel as runCancel } from '@ember/runloop';
import app_state from './app_state';
import aiFeatureGate from './ai_feature_gate';
import { needsAcknowledgement } from './article50_gate';

// AI-powered word prediction service.
// Runtime AI is Claude on Amazon Bedrock, reached through /api/v1/words/predict.
//
// Budget strategy:
//  - Client-side cap: 60 req/min, the only brake on a runaway loop (no per-user server limit yet)
//  - Aggressive caching: 10-min TTL, 300 entries
//  - Debounce: 300ms, and callers asking for the same sentence share one request
//  - Refusal backoff: pauses requests for 30s after a 429, a 403 or an "AI is off" 400
//  - 2 second limit, sent once: a prediction that arrives later than that is no use

var RATE_LIMIT = 60;       // max requests per minute
var RATE_WINDOW = 60000;   // 1 minute in ms
var BACKOFF_MS = 30000;    // pause after a 429

var ai_word_predictor = {
  _pending_timer: null,
  _pending_reject: null,

  // Client-side cache
  _cache: {},
  _cache_max: 300,
  _cache_ttl: 10 * 60 * 1000, // 10 minutes

  // Rate tracking
  _request_times: [],  // timestamps of recent requests
  _backoff_until: 0,   // timestamp — don't send requests before this

  _debounce_ms: 300,

  _cache_key: function(sentence, locale) {
    return (locale || 'en') + ':' + (sentence || '').toString().trim().toLowerCase();
  },

  is_enabled: function(appStateService) {
    var state = appStateService || app_state;
    // EU AI Act Article 50(1) DEGRADE mode (D-03): word prediction fires inline
    // on keystrokes in the speak path, so it must NEVER block and NEVER prompt.
    // When acknowledgement is still needed, silently report disabled here --
    // predict() below already turns a false is_enabled() into a silent
    // RSVP.resolve([]) with no AJAX call, so the caller falls back to the
    // existing non-AI prediction path with no dialog, error, or indicator of
    // any kind. Acknowledging at any other gated surface (or at session
    // entry) flips article_50_disclosure_shown, re-evaluated per call (after any pause).
    // Both must allow AI: the current user (whose taps are sent; their own block too, #1063) and the signed-in person (words_controller.rb).
    if(needsAcknowledgement(state)) { return false; }
    return aiFeatureGate.aiFeatureEnabled(state, 'ai_word_prediction') && aiFeatureGate.authoringFeatureEnabled(state, 'ai_word_prediction') && !aiFeatureGate.communicatorAiBlocked(state);
  },

  _predict_unshared: function(sentence, options) {
    var _this = this;
    options = options || {};
    var locale = options.locale || 'en';
    var count = options.count || 4;

    if(!_this.is_enabled(options.appState)) {
      return RSVP.resolve([]);
    }

    // Cancel any pending debounced request
    if(_this._pending_timer) {
      runCancel(_this._pending_timer);
      _this._pending_timer = null;
    }
    if(_this._pending_reject) {
      _this._pending_reject();
      _this._pending_reject = null;
    }

    if(!sentence || !sentence.trim()) {
      return RSVP.resolve([]);
    }

    var key = _this._cache_key(sentence, locale);

    // Check cache first — free, no API call
    var cached = _this._cache[key];
    if(cached && (Date.now() - cached.ts) < _this._cache_ttl) {
      return RSVP.resolve(cached.words);
    }

    // If in backoff period, don't call API
    if(Date.now() < _this._backoff_until) {
      return RSVP.resolve([]);
    }

    // Check rate budget
    if(!_this._has_budget()) {
      return RSVP.resolve([]);
    }

    // Skip debounce for prediction taps (immediate)
    if(options.immediate) {
      return _this._fetch(sentence.trim().toLowerCase(), locale, count, options.appState);
    }

    // Debounce for board-button taps
    return new RSVP.Promise(function(resolve) {
      _this._pending_reject = function() { resolve([]); };
      _this._pending_timer = runLater(function() {
        _this._pending_timer = null;
        _this._pending_reject = null;
        _this._fetch(sentence.trim().toLowerCase(), locale, count, options.appState).then(resolve, function() { resolve([]); });
      }, _this._debounce_ms);
    });
  },

  // Callers asking for the same sentence and language share ONE request. The body above has a
  // single waiting slot and resolves whoever was in it with [] when the next call arrives, even
  // a call for the very same sentence; several lookups per tap (the Modern rail's, and the
  // classic board controller's) therefore cancelled each other and no caller got the AI words.
  // A DIFFERENT sentence still replaces one that has not been sent, and a cleared sentence still
  // cancels: both go through the body above unchanged.
  _shared: {},        // cache key -> { promise, at }, while it is waiting or on the wire
  _pending_key: null, // the key the waiting slot (_pending_timer) belongs to
  _shared_max_ms: 5000, // a request that has not answered by then is no longer joined

  predict: function(sentence, options) {
    var _this = this;
    options = options || {};
    // The AI check runs for EVERY caller, before any shared answer is handed out: a request
    // started while AI was allowed must not answer a caller for whom it is off.
    if(!_this.is_enabled(options.appState)) {
      return _this._predict_unshared(sentence, options);
    }
    var key = _this._cache_key(sentence, options.locale || 'en');
    var shared = _this._shared[key];
    if(shared && (Date.now() - shared.at) < _this._shared_max_ms) {
      // Joining a request does not go through the body, so do its cancelling here: a DIFFERENT
      // sentence still waiting has been moved on from. An empty ask is the body's own cancel.
      if(_this._pending_timer && _this._pending_key !== key) {
        delete _this._shared[_this._pending_key];
        _this._pending_key = null;
        _this._predict_unshared('', options);
      }
      return shared.promise;
    }
    // The body is about to resolve the waiting sentence with []. Forget it first, so a repeat
    // ask for that sentence starts again instead of being handed the cancelled empty answer.
    if(_this._pending_timer && _this._pending_key !== null) {
      delete _this._shared[_this._pending_key];
    }
    var promise = _this._predict_unshared(sentence, options);
    _this._pending_key = _this._pending_timer ? key : null;
    _this._shared[key] = { promise: promise, at: Date.now() };
    var forget = function() {
      if(_this._shared[key] && _this._shared[key].promise === promise) { delete _this._shared[key]; }
    };
    promise.then(forget, forget);
    return promise;
  },

  _has_budget: function() {
    var now = Date.now();
    // Prune old timestamps outside the window
    this._request_times = this._request_times.filter(function(t) {
      return (now - t) < RATE_WINDOW;
    });
    return this._request_times.length < RATE_LIMIT;
  },

  // The predict request body. Speaking as someone, it names them (user_id) so the server applies
  // their own AI block as well as the signed-in person's (#1063, words_controller.rb#predict).
  _request_data: function(sentence, locale, count, appStateService) {
    var data = { sentence: sentence, locale: locale, count: count };
    var communicatorId = aiFeatureGate.predictionCommunicatorId(appStateService || app_state);
    if(communicatorId) { data.user_id = communicatorId; }
    return data;
  },

  _fetch: function(sentence, locale, count, appStateService) {
    var _this = this;
    _this._request_times.push(Date.now());
    return new RSVP.Promise(function(resolve) {
      $.ajax({
        url: '/api/v1/words/predict',
        type: 'POST',
        dataType: 'json',
        // Its own limit, and marked as already on its last attempt: the app's $.ajax wrapper
        // (utils/extras.js) otherwise gives a POST 20 seconds and sends a timed-out one again.
        timeout: 2000,
        attempt: 2,
        data: _this._request_data(sentence, locale, count, appStateService)
      }).then(function(result) {
        var words = (result && result.words) || [];
        _this._cache_put(sentence, words, locale);
        resolve(words);
      }, function(xhr) {
        if(_this._should_pause(xhr)) {
          _this._backoff_until = Date.now() + BACKOFF_MS;
        }
        resolve([]);
      });
    });
  },

  // Pause after a rate limit (429), a 403, or the 400 words_controller.rb
  // sends when AI word prediction is off for the signed-in person. Reads the
  // shapes the app's $.ajax wrapper (utils/extras.js) rejects with: { fakeXHR,
  // result: message }, or, for ApplicationCache clients the server answers
  // with 200, { fakeXHR: { status: 200 }, result: { error, status } }.
  _should_pause: function(err) {
    if(!err) { return false; }
    var body = (err.result && typeof err.result === 'object') ? err.result : null;
    var status = (body && body.status) || (err.fakeXHR && err.fakeXHR.status) || err.status;
    var message = body ? body.error : err.result;
    if(status === 429 || status === 403) { return true; }
    return status === 400 && message === 'ai_word_prediction is not enabled for this user';
  },

  _cache_put: function(sentence, words, locale) {
    var key = this._cache_key(sentence, locale);
    if(Object.keys(this._cache).length >= this._cache_max) {
      var oldest_key = null;
      var oldest_ts = Infinity;
      for(var k in this._cache) {
        if(this._cache[k].ts < oldest_ts) {
          oldest_ts = this._cache[k].ts;
          oldest_key = k;
        }
      }
      if(oldest_key) { delete this._cache[oldest_key]; }
    }
    this._cache[key] = { words: words, ts: Date.now() };
  },

  clear_cache: function() {
    this._cache = {};
    this._shared = {};
  }
};

export default ai_word_predictor;
