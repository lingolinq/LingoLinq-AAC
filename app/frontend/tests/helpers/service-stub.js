import LingoLinq from '../../app';
import persistence from 'frontend/utils/persistence';
import sessionUtil from '../../utils/session';
import appStateUtil from '../../utils/app_state';
import stashesUtil from '../../utils/_stashes';
import contentGrabbersUtil from '../../utils/content_grabbers';
import speecher from '../../utils/speecher';
import editManager from '../../utils/edit_manager';
import Subscription from '../../utils/subscription';
import ttsVoices from '../../utils/tts_voices';
import modalUtil from '../../utils/modal';

export function persistenceTarget() {
  if (typeof window !== 'undefined' && window.persistence) {
    return window.persistence;
  }
  return persistence;
}

export function sessionTarget() {
  if (typeof LingoLinq !== 'undefined' && LingoLinq.session) {
    return LingoLinq.session;
  }
  return sessionUtil;
}

export function appStateTarget() {
  if (typeof LingoLinq !== 'undefined' && LingoLinq.appState) {
    return LingoLinq.appState;
  }
  if (typeof window !== 'undefined' && window.LingoLinq && window.LingoLinq.appState) {
    return window.LingoLinq.appState;
  }
  return appStateUtil;
}

export function stashesTarget() {
  if (typeof window !== 'undefined' && window.stashes) {
    return window.stashes;
  }
  return stashesUtil;
}

export function contentGrabbersTarget() {
  if (typeof window !== 'undefined' && window.cg) {
    return window.cg;
  }
  return contentGrabbersUtil;
}

export function primePersistenceService(owner) {
  if (!owner) {
    return persistenceTarget();
  }
  var svc = owner.lookup('service:persistence');
  if (svc) {
    if (typeof window !== 'undefined') {
      window.persistence = svc;
    }
    if (typeof LingoLinq !== 'undefined') {
      LingoLinq.persistenceService = svc;
    }
    if (typeof svc.set === 'function') {
      svc.set('online', true);
    }
  }
  return svc;
}

export function primeSessionService(owner) {
  if (!owner) {
    return sessionTarget();
  }
  var svc = owner.lookup('service:session');
  if (svc) {
    if (typeof LingoLinq !== 'undefined') {
      LingoLinq.session = svc;
    }
    if (typeof window !== 'undefined') {
      if (!window.LingoLinq) {
        window.LingoLinq = LingoLinq;
      }
      window.LingoLinq.session = svc;
    }
  }
  return svc;
}

export function primeAppStateService(owner) {
  if (!owner) {
    return appStateTarget();
  }
  var svc = owner.lookup('service:app-state');
  if (svc) {
    if (typeof LingoLinq !== 'undefined') {
      LingoLinq.appState = svc;
    }
    if (typeof window !== 'undefined') {
      if (!window.LingoLinq) {
        window.LingoLinq = LingoLinq;
      }
      window.LingoLinq.appState = svc;
    }
  }
  return svc;
}

export function primeStashesService(owner) {
  if (!owner) {
    return stashesTarget();
  }
  var svc = owner.lookup('service:stashes');
  if (svc) {
    if (typeof window !== 'undefined') {
      window.stashes = svc;
    }
  }
  return svc;
}

export function primeContentGrabbersService(owner) {
  if (!owner) {
    return contentGrabbersTarget();
  }
  var svc = owner.lookup('service:content-grabbers');
  if (svc) {
    if (typeof window !== 'undefined') {
      window.cg = svc;
    }
  }
  return svc;
}

export function primeUtilSingletons(owner) {
  var appState = primeAppStateService(owner);
  var persistenceSvc = primePersistenceService(owner);
  var stashesSvc = primeStashesService(owner);

  if (typeof window !== 'undefined') {
    window.appState = appState || appStateTarget();
    window.tts_voices = ttsVoices;
  }

  if (speecher) {
    if (typeof speecher.setup === 'function') {
      speecher.setup(appState, persistenceSvc, stashesSvc, ttsVoices);
    }
    if (typeof speecher.register_services === 'function') {
      speecher.register_services(appState, persistenceSvc, stashesSvc, ttsVoices);
    }
  }
  if (editManager && typeof editManager.register_services === 'function') {
    editManager.register_services(appState, persistenceSvc, stashesSvc);
  }
  if (Subscription && typeof Subscription.register_services === 'function') {
    Subscription.register_services(appState, persistenceSvc, stashesSvc);
  }
}

export function primeAllServices(owner) {
  primePersistenceService(owner);
  primeSessionService(owner);
  primeAppStateService(owner);
  primeStashesService(owner);
  primeContentGrabbersService(owner);
  primeUtilSingletons(owner);
}

/** Service mirror rules used by tests/helpers/jasmine.js stub(). */
export var SERVICE_MIRROR_RULES = [
  {
    serviceName: 'persistence',
    moduleRef: persistence,
    detect: function(object) {
      return !!(object && typeof object.find === 'function' && typeof object.sync === 'function' && typeof object.store === 'function');
    },
    methods: {
      ajax: true,
      get: true,
      set: true,
      find: true,
      find_json: true,
      find_url: true,
      find_urls: true,
      find_content_locally: true,
      store: true,
      store_json: true,
      sync: true,
      remove: true,
      push_records: true,
      time_promise: true,
      url_cache: true,
      url_uncache: true,
      meta: true
    }
  },
  {
    serviceName: 'session',
    moduleRef: sessionUtil,
    detect: function(object) {
      return object === sessionUtil;
    },
    methods: {
      persist: true,
      clear: true,
      restore: true,
      check_token: true,
      reload: true,
      invalidate: true,
      alert: true,
      setup: true
    }
  },
  {
    serviceName: 'app-state',
    moduleRef: appStateUtil,
    detect: function(object) {
      return object === appStateUtil;
    },
    methods: null
  },
  {
    serviceName: 'stashes',
    moduleRef: stashesUtil,
    detect: function(object) {
      return object === stashesUtil;
    },
    methods: {
      get: true,
      set: true,
      persist_object: true,
      setup: true,
      clear: true,
      remember: true
    }
  },
  {
    serviceName: 'content-grabbers',
    moduleRef: contentGrabbersUtil,
    detect: function(object) {
      return object === contentGrabbersUtil;
    },
    methods: null
  },
  {
    serviceName: 'modal',
    moduleRef: modalUtil,
    detect: function(object) {
      return object === modalUtil;
    },
    methods: {
      open: true,
      close: true,
      flash: true,
      warning: true,
      error: true,
      notice: true,
      success: true
    }
  }
];
