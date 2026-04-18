import RSVP from 'rsvp';
import $ from 'jquery';
import { later as runLater, cancel as runCancel } from '@ember/runloop';

// AI-powered word prediction service.
// Optimized for Gemini free tier (20 requests/minute).
//
// Budget strategy:
//  - Client-side rate limiter: max 15 req/min (leaves headroom)
//  - Aggressive caching: 10-min TTL, 300 entries
//  - Debounce: 300ms to collapse rapid observer fires into one request
//  - 429 backoff: pauses requests for 30s when rate-limited
//  - No pre-fetching: every request counts

var RATE_LIMIT = 15;       // max requests per minute
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

  predict: function(sentence, options) {
    var _this = this;
    options = options || {};
    var locale = options.locale || 'en';
    var count = options.count || 4;

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

    var key = sentence.trim().toLowerCase();

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
      return _this._fetch(key, locale, count);
    }

    // Debounce for board-button taps
    return new RSVP.Promise(function(resolve) {
      _this._pending_reject = function() { resolve([]); };
      _this._pending_timer = runLater(function() {
        _this._pending_timer = null;
        _this._pending_reject = null;
        _this._fetch(key, locale, count).then(resolve, function() { resolve([]); });
      }, _this._debounce_ms);
    });
  },

  _has_budget: function() {
    var now = Date.now();
    // Prune old timestamps outside the window
    this._request_times = this._request_times.filter(function(t) {
      return (now - t) < RATE_WINDOW;
    });
    return this._request_times.length < RATE_LIMIT;
  },

  _fetch: function(sentence, locale, count) {
    var _this = this;
    _this._request_times.push(Date.now());
    return new RSVP.Promise(function(resolve) {
      $.ajax({
        url: '/api/v1/words/predict',
        type: 'POST',
        dataType: 'json',
        data: { sentence: sentence, locale: locale, count: count }
      }).then(function(result) {
        var words = (result && result.words) || [];
        _this._cache_put(sentence, words);
        resolve(words);
      }, function(xhr) {
        if(xhr && xhr.status === 429) {
          // Back off — stop sending requests for a while
          _this._backoff_until = Date.now() + BACKOFF_MS;
        }
        resolve([]);
      });
    });
  },

  _cache_put: function(key, words) {
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
  }
};

export default ai_word_predictor;
