import { set as emberSet } from '@ember/object';
import RSVP from 'rsvp';
import persistence from 'frontend/utils/persistence';
import {
  persistenceTarget,
  primePersistenceService,
  primeAllServices,
  primeUtilSingletons
} from './service-stub';
import { stub } from './jasmine';

export { persistenceTarget, primePersistenceService, primeAllServices, primeUtilSingletons };

export function stubOnPersistence(method, replacement) {
  stub(persistence, method, replacement);
  var target = persistenceTarget();
  if (target && target !== persistence && typeof target[method] !== 'undefined') {
    stub(target, method, replacement);
  }
}

export function chainPersistenceAjax(overrideFn) {
  var target = persistenceTarget();
  var priorAjax = (target && typeof target.ajax === 'function') ? target.ajax : persistence.ajax;
  var chained = function(url, opts) {
    if (typeof url !== 'string') {
      return priorAjax.apply(this, arguments);
    }
    var custom = overrideFn.apply(this, arguments);
    if (custom !== undefined) {
      return custom;
    }
    return priorAjax.apply(this, arguments);
  };
  stubOnPersistence('ajax', chained);
}

export function installDefaultPersistenceAjaxStub(opts) {
  opts = opts || {};
  var target = persistenceTarget();
  var priorAjax = (target && typeof target.ajax === 'function') ? target.ajax : persistence.ajax;
  var handler = function(url, opts) {
    if (typeof url !== 'string') {
      return priorAjax.apply(this, arguments);
    }
    if (url.match(/board_revisions$/)) {
      if (opts.boardRevisionsResolve) {
        return RSVP.resolve({});
      }
      var rej = RSVP.reject({});
      rej.then(null, function() { });
      return rej;
    }
    if (url.match(/\/boards\?/)) {
      return RSVP.resolve([]);
    }
    if (url.match(/token_check/)) {
      return RSVP.resolve({});
    }
    if (url.match(/search\/proxy/)) {
      var proxyUrl = url.match(/url=([^&]+)/);
      var decoded = proxyUrl ? decodeURIComponent(proxyUrl[1]) : url;
      if (decoded.match(/buttons\.json/)) {
        return RSVP.resolve({
          url: decoded,
          content_type: 'text/json',
          data_uri: 'data:text/json;base64,' + btoa('{"buttons":[]}')
        });
      }
      return RSVP.resolve({
        url: decoded,
        content_type: 'image/png',
        data_uri: 'data:image/png;base64,abc'
      });
    }
    return priorAjax.apply(this, arguments);
  };
  stubOnPersistence('ajax', handler);
  return handler;
}

export function stubPersistence(overrides) {
  var target = persistenceTarget();
  var saved = {};
  Object.keys(overrides).forEach(function(key) {
    saved[key] = target[key];
    try {
      target[key] = overrides[key];
    } catch (e) {
      emberSet(target, key, overrides[key]);
    }
  });
  return function restore() {
    Object.keys(saved).forEach(function(key) {
      try {
        target[key] = saved[key];
      } catch (e) {
        emberSet(target, key, saved[key]);
      }
    });
  };
}

export function stubPersistenceAjax(fn) {
  return stubPersistence({ ajax: fn });
}

export function stubPersistenceGet(fn) {
  return stubPersistence({ get: fn });
}
