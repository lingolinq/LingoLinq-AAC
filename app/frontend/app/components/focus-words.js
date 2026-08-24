/**
 * Focus Words Modal Component
 *
 * Converted from modals/focus-words template/controller to component.
 */
import Component from '@ember/component';
import { inject as service } from '@ember/service';
import { computed, observer } from '@ember/object';
import { set as emberSet } from '@ember/object';
import { htmlSafe } from '@ember/template';
import LingoLinq from '../app';
import app_state from '../utils/app_state';
import modal from '../utils/modal';
import Button from '../utils/button';
import RSVP from 'rsvp';
import $ from 'jquery';
import stashes from '../utils/_stashes';
import utterance from '../utils/utterance';
import i18n from '../utils/i18n';
import persistence from '../utils/persistence';
import editManager from '../utils/edit_manager';
import sync from '../utils/sync';
import aiFeatureGate from '../utils/ai_feature_gate';
import article50Gate from '../utils/article50_gate';

export default Component.extend({
  modal: service('modal'),
  router: service('router'),
  appState: service('app-state'),
  tagName: '',
  ai_word_count: 20,
  // Upper bound on the post-403 user refresh. Matches login-form.js:693's 6s
  // fallback for a hanging user fetch. A property so specs can shorten it.
  art50_reload_timeout_ms: 6000,
  ai_generating: false,

  init() {
    this._super(...arguments);
    var self = this;
    this.ctrlAction = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function() {
        var args = bound.concat(Array.prototype.slice.call(arguments));
        var evt = args[args.length - 1];
        if (evt && typeof evt.preventDefault === 'function' && (evt.type || evt.target)) {
          if (evt.preventDefault) { evt.preventDefault(); }
          args.pop();
        }
        self.send.apply(self, [actionName].concat(args));
      };
    };
    const modalService = this.get('modal');
    const template = 'modals/focus-words';
    const options = (modalService && modalService.getSettingsFor && modalService.getSettingsFor(template)) ||
                    (modalService && modalService.settingsFor && modalService.settingsFor[template]) ||
                    this.get('model') || {};
    this.set('model', options);
  },

  analysis_subset: computed('analysis.found', function() {
    return (this.get('analysis.found') || []).slice(0, 3);
  }),

  analysis_extras: computed('analysis.found', function() {
    return (this.get('analysis.found') || []).slice(3);
  }),

  user_list: computed('model', 'model.user.focus_words', function() {
    const list = [];
    const _this = this;
    let hash = _this.get('model.user.focus_words') || {};
    const found_words = {};
    for (const name in hash) {
      if (hash[name] && hash[name].updated && !hash[name].deleted) {
        if (!found_words[hash[name].words]) {
          found_words[hash[name].words] = true;
          list.push({ title: name, words: hash[name].words, user_name: _this.get('model.user.user_name'), updated: hash[name].updated });
        }
      }
    }
    if (this.get('model.user.id') !== app_state.get('referenced_user.id')) {
      hash = app_state.get('referenced_user.focus_words') || {};
      for (const name in hash) {
        if (hash[name] && hash[name].updated && !hash[name].deleted) {
          if (!found_words[hash[name].words]) {
            found_words[hash[name].words] = true;
            list.push({ title: name, words: hash[name].words, user_name: app_state.get('currentUser.user_name'), updated: hash[name].updated });
          }
        }
      }
    }
    return (list || []).slice().sort(function(a, b) { return (b.updated || 0) - (a.updated || 0); });
  }),

  recent_list: computed('model', 'user_list', function() {
    let res = [];
    const last = stashes.get('last_focus_words');
    if (last && last.user_id === app_state.get('sessionUser.id')) {
      res.push({ title: last.title || i18n.t('last_focus_word_set', "Last Focus Word Set"), words: last.words, tmp: true });
    }
    const more = this.get('user_list').slice(0, 2);
    more.forEach(function(item) {
      if (res[0] && item.words === res[0].words) {
        res.shift();
      }
    });
    res = res.concat(more);
    if (stashes.get('working_vocalization.length') > 0) {
      const str = utterance.sentence(stashes.get('working_vocalization') || []) || "";
      res.unshift({ title: i18n.t('current_vocalization', "Current Vocalization Box Contents"), words: str, tmp: true });
    }
    return res;
  }),

  update_category_items: observer('model', 'browse', 'browse.category', 'user_list', function() {
    const _this = this;
    const cat = _this.get('browse.category.id');
    if (!cat) { return; }
    if (cat === 'saved') {
      _this.set('browse.items', _this.get('user_list'));
    } else {
      _this.set('browse', _this.get('browse') || {});
      _this.set('browse.pending', true);
      const opts = { sort: 'popularity' };
      if (cat === 'shared_reading') {
        opts.type = 'core_focus';
        opts.category = 'books';
        opts.valid = true;
      } else if (cat === 'activities') {
        opts.type = 'core_focus';
        opts.category = 'activities';
        opts.valid = true;
      } else if (cat === 'books') {
        opts.type = 'core_book';
        opts.valid = true;
      } else if (cat === 'other_focus') {
        opts.type = 'core_focus';
        opts.category = 'other';
        opts.valid = true;
      } else if (cat.match(/^tarheel_/)) {
        opts.type = 'tarheel_book';
        opts.category = cat.replace(/^tarheel_/, '');
        opts.valid = true;
      }
      if (opts.valid) {
        persistence.ajax('/api/v1/search/focus?q=&locale=' + (app_state.get('label_locale') || 'en').split(/-|_/)[0] + '&type=' + opts.type + '&category=' + opts.category + '&sort=' + opts.sort, { type: 'GET' }).then(function(list) {
          _this.set('browse.pending', false);
          _this.set('browse.items', list);
        }, function() {
          _this.set('browse.pending', false);
          _this.set('browse.error', true);
        });
      } else if (this.get('browse')) {
        _this.set('browse.pending', false);
        _this.set('browse.error', false);
        _this.set('browse.items', null);
      }
    }
  }),

  update_search_items: observer('search.term', 'user_list', function() {
    const _this = this;
    if (_this.get('search.term')) {
      const term = _this.get('search.term').toLowerCase();
      _this.set('search.loading', true);
      _this.set('search.error', false);
      let res = [];
      (_this.get('user_list') || []).forEach(function(item) {
        if (item.title.toLowerCase().includes(term) || item.words.toLowerCase().includes(term)) {
          res.push(item);
        }
      });
      persistence.ajax('/api/v1/search/focus?locale=' + (app_state.get('label_locale') || 'en').split(/-|_/)[0] + '&q=' + encodeURIComponent(_this.get('search.term') || ''), { type: 'GET' }).then(function(list) {
        _this.set('search.loading', false);
        res = res.concat(list);
        _this.set('search.results', res.slice(0, 20));
      }, function() {
        _this.set('search.loading', false);
        _this.set('search.results', res);
      });
    }
  }),

  reuse_or_existing: computed('reuse', 'existing', function() {
    return this.get('reuse') || this.get('existing');
  }),

  stash_set() {
    stashes.persist('last_focus_words', {
      user_id: app_state.get('sessionUser.id'),
      words: this.get('words'),
      title: this.get('title')
    });
  },

  not_ready: computed('words_list', function() {
    return (this.get('words_list') || []).length === 0;
  }),

  search_or_browse: computed('search', 'browse', function() {
    return this.get('search') || this.get('browse');
  }),

  ai_focus_generation_enabled: computed(
    'appState.feature_flags.focus_word_highlighting',
    'appState.feature_flags.ai_board_generation',
    'appState.currentUser.preferences.ai_features_enabled',
    'appState.currentUser.preferences.ai_board_generation',
    function() {
      return !!(this.get('appState.feature_flags.focus_word_highlighting') &&
        aiFeatureGate.aiFeatureEnabled(this.get('appState'), 'ai_board_generation'));
    }
  ),

  /**
   * EU AI Act Article 50(1) hand-off for the AI focus-word generator.
   *
   * Opening ai-disclosure REPLACES this modal, so this component is destroyed
   * partway through. Everything the continuation needs is therefore captured
   * BEFORE the gate opens (`settings`, `resume`), and nothing after it reads
   * component state -- the same discipline new-board.js#generateWithAi uses when
   * it captures `standalone` up front. `modal` here is the module import, not the
   * component-bound service, so it still resolves after this component is gone.
   *
   * On acknowledgement the focus-words modal is re-opened with the typed
   * description and word count restored (see the art50_resume branch in
   * `opening`). It deliberately does NOT auto-submit: acknowledging a
   * transparency notice must never itself dispatch an AI request. The user
   * presses Generate again, which is one click and keeps the AI call explicitly
   * user-initiated.
   */
  _presentArticle50Gate(prompt, count) {
    const settings = this.get('model') || {};
    // Capture the WHOLE authored draft, not just the two AI fields. `opening()`
    // also clears words/existing/reuse/title/focus_id, and the "Save for Re-Use"
    // checkbox (with the "Word List Name" input it reveals) sits on the same view
    // as the AI panel, so a user can legitimately have all of them filled in when
    // the gate fires. Restoring only the AI fields silently unchecked the box and
    // discarded the typed list name, which then changed downstream behavior:
    // set_focus_words bails early when `reuse` is set without a `title`, and the
    // saved-set usage ping is keyed on `focus_id`.
    const resume = {
      ai_prompt: prompt,
      ai_word_count: count,
      words: this.get('words'),
      existing: this.get('existing'),
      reuse: this.get('reuse'),
      title: this.get('title'),
      focus_id: this.get('focus_id'),
      // Typed into the search box at focus-words.hbs:130. Note this is the
      // {{else}} arm of the reuse_or_existing conditional at :121 -- the
      // MUTUALLY EXCLUSIVE counterpart to the "Word List Name" input at :124,
      // not a sibling of it. So exactly one of `title` / `search_term` is
      // rendered at any moment, and carrying both is how the payload stays
      // correct whichever arm the user was in. This is authored text, NOT the
      // derived `search` results object find_source() builds from it (:390),
      // which is correctly discarded.
      search_term: this.get('search_term'),
      // pick_set sets navigated and existing TOGETHER (:471-477). Carrying
      // `existing` without this produced existing=true / navigated=false, a
      // combination no user action can reach: the modal showed a picked set with
      // its list name AND the "get started by pasting text" explainer that
      // focus-words.hbs:87 gates on {{#unless this.navigated}}.
      navigated: this.get('navigated'),
      // Attribution for words a PREVIOUS generation produced. Restoring `words`
      // without this leaves AI-generated words with no AiFocusWordSet id, so
      // record_ai_focus_usage() returns early (:316-317) and applying or
      // analyzing the retained list silently records nothing. Reachable when the
      // disclosure requirement appears BETWEEN two generations in one session,
      // which is what a flag enable or a CURRENT_VERSION bump does.
      ai_focus_word_set_id: this.get('ai_focus_word_set_id')
    };
    article50Gate.presentBlockingGate(this.get('appState')).then(function() {
      modal.open('modals/focus-words', Object.assign({}, settings, { art50_resume: resume }));
    }, function() {
      // Bumped by another modal, so no acknowledgement was recorded and the AI
      // call must not proceed. The user is looking at whatever replaced the
      // disclosure; fail-closed with no extra error surface, matching
      // new-board.js#generateWithAi's rejection branch.
    });
  },

  ai_generate_disabled: computed('ai_generating', 'ai_prompt', 'ai_word_count', function() {
    const count = parseInt(this.get('ai_word_count'), 10);
    return !!this.get('ai_generating') ||
      !(this.get('ai_prompt') || '').trim() ||
      count < 5 ||
      count > 50 ||
      (persistence && persistence.get && !persistence.get('online'));
  }),

  // Split on whitespace, strip punctuation per token. Use \p{L}\p{N} so non-ASCII words count
  // (ASCII-only \w left "Set Focus Words" permanently disabled for many locales).
  words_list: computed('words', function() {
    return (this.get('words') || '')
      .split(/[,\n\s]+/)
      .map(function(s) { return s.replace(/[^\p{L}\p{N}_]/gu, ''); })
      .filter(function(s) { return s.length > 0; });
  }),

  browse_categories: computed('model', function() {
    const res = [];
    if (this.get('model.user')) {
      res.push({ id: 'saved', title: i18n.t('saved_focus_word_sets', "Saved Focus Word Sets"), saved: true });
    }
    res.push({ id: 'shared_reading', title: i18n.t('shared_reading_books', "Shared-Reading Books") });
    res.push({ id: 'books', title: i18n.t('core_books', "Popular Core Workshop Books") });
    res.push({ id: 'activities', title: i18n.t('context_activities', "Context-Specific Activities") });
    res.push({ id: 'tarheel_Alph', title: i18n.t('tarheel_alphabet', "Tarheel Reader Alphabet Books") });
    res.push({ id: 'tarheel_Anim', title: i18n.t('tarheel_animals', "Tarheel Reader Animals & Nature Books") });
    res.push({ id: 'tarheel_ArtM', title: i18n.t('tarheel_art', "Tarheel Reader Art & Music Books") });
    res.push({ id: 'tarheel_Biog', title: i18n.t('tarheel_biography', "Tarheel Reader Biography Books") });
    res.push({ id: 'tarheel_Fair', title: i18n.t('tarheel_tales', "Tarheel Reader Fairy & Folk Tale Books") });
    res.push({ id: 'tarheel_Fict', title: i18n.t('tarheel_fiction', "Tarheel Reader Fiction Books") });
    res.push({ id: 'tarheel_Food', title: i18n.t('tarheel_food', "Tarheel Reader Food Books") });
    res.push({ id: 'tarheel_Heal', title: i18n.t('tarheel_health', "Tarheel Reader Health Books") });
    res.push({ id: 'tarheel_Hist', title: i18n.t('tarheel_history', "Tarheel Reader History Books") });
    res.push({ id: 'tarheel_Holi', title: i18n.t('tarheel_holiday', "Tarheel Reader Holiday Books") });
    res.push({ id: 'tarheel_Math', title: i18n.t('tarheel_math', "Tarheel Reader Math Books") });
    res.push({ id: 'tarheel_Nurs', title: i18n.t('tarheel_nursery', "Tarheel Reader Nursery Rhyme Books") });
    res.push({ id: 'tarheel_Peop', title: i18n.t('tarheel_people', "Tarheel Reader People & Places Books") });
    res.push({ id: 'tarheel_Poet', title: i18n.t('tarheel_poetry', "Tarheel Reader Poetry Books") });
    res.push({ id: 'tarheel_Recr', title: i18n.t('tarheel_recreation', "Tarheel Reader Recreation Books") });
    res.push({ id: 'tarheel_Spor', title: i18n.t('tarheel_sports', "Tarheel Reader Sports Books") });
    res.push({ id: 'other_focus', title: i18n.t('other_focus_sets', "Other Focus Word Sets") });
    return res;
  }),

  save_set() {
    const _this = this;
    const focus = _this.get('model.user.focus_words') || {};
    if (!_this.get('title')) { return; }
    const item = { words: _this.get('words'), updated: Math.round((new Date()).getTime() / 1000) };
    focus[_this.get('title')] = item;
    _this.set('model.user.focus_words', focus);
    _this.get('model.user').save().then(function() {}, function() {
      modal.error(i18n.t('error_saving_user', "Focus words failed to save"));
    });
  },

  record_ai_focus_usage(action) {
    const libraryId = this.get('ai_focus_word_set_id');
    if (!libraryId) { return; }
    persistence.ajax('/api/v1/focus/generated_words_usage', {
      type: 'POST',
      contentType: 'application/json',
      dataType: 'json',
      data: JSON.stringify({
        library_id: libraryId,
        words: this.get('words') || '',
        action: action
      })
    }).then(function() {}, function() {});
  },

  actions: {
    close() {
      this.get('modal').close();
    },
    opening() {
      this.get('modal').setComponent(this);
      this.set('analysis', null);
      this.set('search', null);
      this.set('search_term', null);
      this.set('words', null);
      this.set('focus_id', null);
      this.set('ideas', null);
      this.set('navigated', null);
      this.set('browse', null);
      this.set('existing', null);
      this.set('reuse', null);
      this.set('title', null);
      this.set('ai_prompt', null);
      this.set('ai_word_count', 20);
      this.set('ai_generating', false);
      this.set('ai_generate_error', null);
      this.set('ai_focus_word_set_id', null);
      // Restore the authored draft after an Article 50(1) disclosure round-trip.
      // _presentArticle50Gate re-opens this modal with art50_resume because
      // acknowledging destroys and replaces the component mid-flow; without this
      // the user silently loses everything they had already entered. Runs after
      // the resets above so it wins over them.
      //
      // The invariant, stated because getting it wrong has caused four separate
      // defects on this branch: opening() clears 16 fields; this payload carries
      // the 10 the user AUTHORED or that pair with authored state. The 6 it does
      // not carry are `search` (results object built from search_term by
      // find_source), `browse`, `analysis`, `ideas`, plus `ai_generating` and
      // `ai_generate_error` which must start clean on any open.
      //
      // The first four are provably unreachable at gate time rather than merely
      // judged discardable: focus-words.hbs:17 is {{#if this.analysis}} with the
      // AI panel in its {{else}}, and within that, :152 {{#if this.browse}} /
      // :200 {{else if this.search}} / :229 {{else}} holds the AI panel. So the
      // Generate button cannot be reached while any of them is set, and `ideas`
      // renders only inside {{#if this.analysis.missing}}.
      //
      // Note `search_term` is authored and IS carried while `search` is derived
      // and is not; they are easy to conflate and were conflated once already.
      // If you add a field to the resets above, decide explicitly which side of
      // that line it falls on. Partial preservation is worse than none.
      const art50Resume = this.get('model.art50_resume');
      if (art50Resume) {
        this.set('ai_prompt', art50Resume.ai_prompt);
        this.set('ai_word_count', art50Resume.ai_word_count);
        this.set('words', art50Resume.words);
        this.set('existing', art50Resume.existing);
        this.set('reuse', art50Resume.reuse);
        this.set('title', art50Resume.title);
        this.set('focus_id', art50Resume.focus_id);
        this.set('ai_focus_word_set_id', art50Resume.ai_focus_word_set_id);
        this.set('search_term', art50Resume.search_term);
        this.set('navigated', art50Resume.navigated);
      }
      if (window.webkitSpeechRecognition) {
        const speech = new window.webkitSpeechRecognition();
        if (speech) {
          speech.continuous = true;
          this.set('speech', { engine: speech });
        }
      }
    },
    closing() {},
    find_source() {
      this.set('navigated', true);
      this.set('browse', null);
      this.set('search', { term: this.get('search_term') });
    },
    clear_search() {
      this.set('search', null);
    },
    browse(category) {
      this.set('navigated', true);
      this.set('search', null);
      this.set('browse', { ready: true });
      if (category) {
        this.set('browse.category', category);
      }
    },
    back(category) {
      if (category) {
        this.set('browse.category', null);
      } else {
        this.set('browse', null);
      }
    },
    remove_set(set) {
      const _this = this;
      const focus = _this.get('model.user.focus_words') || {};
      const found = focus[set.title];
      if (found) {
        emberSet(found, 'deleted', Math.round((new Date()).getTime() / 1000));
      }
      _this.set('model.user.focus_words', $.extend({}, focus));
      _this.get('model.user').save().then(function() {}, function() {
        emberSet(found, 'deleted', null);
      });
    },
    save_missing() {
      const _this = this;
      const user = _this.get('model.user');
      if (user) {
        let list = user.get('preferences.requested_phrase_changes') || [];
        (_this.get('analysis.missing') || []).forEach(function(str) {
          list = list.filter(function(p) { return p !== 'add:' + str && p !== 'remove:' + str; });
          list.push('add:' + str);
        });
        user.set('preferences.requested_phrase_changes', list);
        _this.set('ideas', { saving: true });
        user.save().then(function() {
          _this.set('ideas', { saved: true });
        }, function() {
          _this.set('ideas', { error: true });
          modal.error(i18n.t('error_saving_ideas', "Requested Ideas failed to save"));
        });
      }
    },
    record() {
      this.set('speech.ready', true);
    },
    speech_content(str) {
      let words = this.get('words') || "";
      if (words.length > 0) { words = words + "\n"; }
      words = words + str;
      this.set('words', words);
    },
    speech_error() {
      this.set('speech.ready', false);
    },
    speech_stop() {
      this.set('speech.ready', false);
    },
    pick_set(set) {
      this.set('navigated', true);
      this.set('words', set.words);
      this.set('focus_id', set.id);
      this.set('title', set.tmp ? null : set.title);
      this.set('ai_focus_word_set_id', null);
      this.set('existing', true);
      this.set('browse', null);
      this.set('search', null);
      this.set('analysis', null);
    },
    generate_focus_words_with_ai() {
      const _this = this;
      if (this.get('ai_generating')) { return; }
      if (persistence && persistence.get && !persistence.get('online')) {
        this.set('ai_generate_error', i18n.t('ai_focus_words_requires_online', "AI focus word generation requires an Internet connection."));
        return;
      }
      const prompt = (this.get('ai_prompt') || '').trim();
      if (!prompt) {
        this.set('ai_generate_error', i18n.t('ai_focus_description_required', "Add a description so AI can generate focus words."));
        return;
      }
      const count = parseInt(this.get('ai_word_count'), 10) || 20;
      if (count < 5 || count > 50) {
        this.set('ai_generate_error', i18n.t('ai_focus_word_count_invalid', "Choose between 5 and 50 focus words."));
        return;
      }

      this.set('ai_generate_error', null);

      // EU AI Act Article 50(1) first-AI-use gate, BLOCK mode (D-03). Placed
      // AFTER the prompt/count validation so acknowledging a disclosure is never
      // immediately followed by a "add a description" error, and BEFORE the
      // request so no prompt reaches a model provider unacknowledged.
      //
      // Unlike new-board.js#generateWithAi there is no pre-typing gate point to
      // move this to: the description and word count are typed directly into THIS
      // modal, and modal.open() REPLACES the current modal, so opening
      // ai-disclosure destroys this component and everything the user entered.
      // _presentArticle50Gate therefore captures the form state up front and
      // re-opens focus-words with it restored.
      if (article50Gate.needsAcknowledgement(this.get('appState'))) {
        this._presentArticle50Gate(prompt, count);
        return;
      }

      this.set('ai_generating', true);
      persistence.ajax('/api/v1/focus/generate_words', {
        type: 'POST',
        contentType: 'application/json',
        dataType: 'json',
        data: JSON.stringify({
          prompt: prompt,
          word_count: count,
          include_core_words: true,
          locale: app_state.get('label_locale') || 'en'
        })
      }).then(function(res) {
        if (_this.isDestroyed || _this.isDestroying) { return; }
        _this.set('ai_generating', false);
        _this.set('words', (res && res.words) || '');
        _this.set('ai_focus_word_set_id', res && res.library_id);
        if (res && res.title && !(_this.get('title') || '').trim()) {
          _this.set('title', res.title);
        }
      }, function(err) {
        if (_this.isDestroyed || _this.isDestroying) { return; }
        let msg = i18n.t('generate_failed', "Generation failed");
        const resp = (err && err.fakeXHR && err.fakeXHR.responseJSON) || (err && err.responseJSON) || null;
        if (resp && resp.error === 'article_50_disclosure_required') {
          // The server-side Article 50(1) backstop refused this call
          // (ApplicationController#require_article_50_disclosure!). Reaching here
          // means the client gate above did NOT fire, which happens when the local
          // user record is stale: the flag was enabled, or CURRENT_VERSION was
          // bumped, after this record was cached. That is the NORMAL state of every
          // already-signed-in user at the moment the flag is enabled, so this path
          // has to be reliable rather than best-effort.
          //
          // Do NOT tell the user to press Generate again. Until the reload lands,
          // needsAcknowledgement() still reads the stale record and returns false,
          // so a retry re-sends the request and collects the same 403 -- and if the
          // reload fails, every retry does, with the message still promising a
          // notice that never opens. Instead hold the action pending across the
          // reload and open the notice here. `ai_generating` stays true for that
          // window, so the button is disabled and the retry race cannot be entered.
          // The button reads "Generating Focus Words..." meanwhile, which is a
          // slight overstatement of a sub-second window that ends with the
          // disclosure replacing this modal outright.
          const user = _this.get('appState.currentUser');
          if (user && typeof user.reload === 'function') {
            // BOUND the refresh. Unbounded, a promise that never settles (network
            // dropped after the 403, a cold-start stall) latches ai_generating
            // true: the primary button is permanently disabled and still reads
            // "Generating Focus Words...". Recovery exists but is destructive --
            // reopening the modal REPLACES settingsFor, so art50_resume is gone
            // and opening() clears the draft, costing the user exactly what this
            // gate was built to protect. Timing out falls through to the
            // refresh_failed branch, which already says the honest thing.
            //
            // runLater is the house idiom (login-form.js:693), but focus-words.js
            // carries no grandfathered ember/no-runloop entry and .eslint-todo is
            // not for baselining suppressions on new code.
            const bounded = RSVP.race([
              user.reload(),
              new RSVP.Promise(function(resolve, reject) {
                setTimeout(function() { reject('art50_reload_timeout'); }, _this.get('art50_reload_timeout_ms'));
              })
            ]);
            bounded.then(function() {
              if (_this.isDestroyed || _this.isDestroying) { return; }
              _this.set('ai_generating', false);
              if (article50Gate.needsAcknowledgement(_this.get('appState'))) {
                // Record is accurate now, so present the gate directly. This is
                // the draft-preserving path, so nothing the user typed is lost.
                _this._presentArticle50Gate(prompt, count);
              } else {
                // Refreshed cleanly and the record still does not ask for an
                // acknowledgement, so the gate cannot be opened from here. Surface
                // the refusal rather than swallowing it and appearing to hang.
                _this.set('ai_generate_error', i18n.t('ai_focus_words_disclosure_unavailable', "AI focus words need the AI transparency notice acknowledged first. You can review it in your Preferences."));
              }
            }, function() {
              // The refresh itself failed, so the record is still stale and a retry
              // would loop on the same 403. Say what actually happened instead of
              // promising a retry that cannot work.
              if (_this.isDestroyed || _this.isDestroying) { return; }
              _this.set('ai_generating', false);
              _this.set('ai_generate_error', i18n.t('ai_focus_words_disclosure_refresh_failed', "We could not check your AI transparency settings. Check your connection, then try again."));
            });
            return;
          }
          // No refreshable user record, so there is no way to reach an accurate
          // gate state from here. Never render the raw error code either -- it is
          // an untranslated machine token that tells the user nothing actionable.
          msg = i18n.t('ai_focus_words_disclosure_unavailable', "AI focus words need the AI transparency notice acknowledged first. You can review it in your Preferences.");
        } else if (resp && resp.error) {
          msg = resp.error;
          if (resp.error_detail) { msg += ' - ' + resp.error_detail; }
        }
        _this.set('ai_generating', false);
        _this.set('ai_generate_error', msg);
      });
    },
    set_focus_words() {
      const _this = this;
      const words = _this.get('words_list');
      if (_this.get('reuse')) {
        if (!_this.get('title')) { return; }
        _this.save_set();
      } else {
        _this.stash_set();
      }
      if (_this.get('focus_id') && app_state.get('currentUser')) {
        persistence.ajax('/api/v1/focus/usage', { type: 'POST', data: { focus_id: _this.get('focus_id') } }).then(function() {}, function() {});
      }
      _this.record_ai_focus_usage('set_focus_words');
      // Same focus_id on app_state and board so contextualized_buttons / fast_html caches invalidate.
      // A constant 'force_refresh' on the board matched fast_html.focus_id and caused process_for_displaying
      // to return early without refreshing board-detail's ordered_buttons or focus dim/highlight.
      const focusRevision = Math.random();
      app_state.set('focus_words', { list: words, focus_id: focusRevision });
      const boardController = editManager.controller;
      if (boardController && boardController.get && boardController.get('model')) {
        boardController.get('model').set('focus_id', focusRevision);
      }
      this.get('modal').close();
      editManager.process_for_displaying();
      if (app_state.get('pairing') || app_state.get('followers.allowed')) {
        sync.send_update(app_state.get('referenced_user.id') || app_state.get('currentUser.id'), { assertion: { focus_words: words } });
      }
    },
    analyze_focus_words() {
      const _this = this;
      const words = _this.get('words_list');
      const model = _this.get('model');
      if (!model) {
        modal.error(i18n.t('focus_words_analyze_needs_user', "User information is not available. Try opening this screen again or signing in."));
        return;
      }
      const rootBoardId = _this.get('model.root_board_id');
      if (!rootBoardId) {
        modal.error(i18n.t('focus_words_analyze_needs_home_board', "Set or open a home board first. Analysis looks up each word on that board."));
        return;
      }
      if (_this.get('reuse')) {
        if (!_this.get('title')) { return; }
        _this.save_set();
      } else {
        _this.stash_set();
      }
      _this.record_ai_focus_usage('analyze_focus_words');
      const locale = app_state.get('label_locale');
      _this.set('analysis', { loading: true });
      let board = null;
      const find_board = LingoLinq.store.findRecord('board', rootBoardId);
      const load_buttons = find_board.then(function(brd) {
        board = brd;
        return board.load_button_set();
      });
      const find_routes = load_buttons.then(function(set) {
        return set.find_routes(words, locale, board.get('id'), _this.get('model.user'));
      });
      find_routes.then(function(res) {
        res.found.forEach(function(btn) {
          const last_button = btn;
          [btn].concat(btn.sequence.buttons || []).forEach(function(b) {
            const last = (last_button === b);
            let style = "position: relative; display: inline-block; border-radius: 5px; height: 70px; text-align: center; min-width: 75px; max-width: 100px; overflow: hidden; font-size: 14px;";
            let big_style = "vertical-align: middle; position: relative; display: inline-block; border-radius: 5px; height: 100px; text-align: center; min-width: 100px; max-width: 120px; overflow: hidden; font-size: 16px;";
            let mini_style = "display: inline-block; padding: 5px 10px; border: 1px solid #888; border-radius: 5px; font-weight: bold; margin-right: 5px; min-width: 30px; text-align: center;";
            let print_style = "position: absolute; top: 0; left: 0; width: 100%;";
            style = style + "background: " + Button.clean_text(b.background_color || '#fff') + "; ";
            style = style + "border: 2px solid " + Button.clean_text(b.border_color || '#ccc') + "; ";
            big_style = big_style + "background: " + Button.clean_text(b.background_color || '#fff') + "; ";
            big_style = big_style + "border: " + (last ? 4 : 2) + "px solid " + Button.clean_text(b.border_color || '#ccc') + "; ";
            if (!last) { big_style = big_style + "opacity: 0.9; "; }
            print_style = print_style + " border-bottom: 100px solid " + Button.clean_text(b.background_color || '#fff') + ";";
            mini_style = mini_style + "background: " + Button.clean_text(b.background_color || '#fff') + "; ";
            mini_style = mini_style + "border: 1px solid " + Button.clean_text(b.border_color || '#ccc') + "; ";
            if (window.tinycolor) {
              const fill = window.tinycolor(b.background_color || '#fff');
              const text_color = window.tinycolor.mostReadable(fill, ['#fff', '#000']);
              style = style + 'color: ' + text_color + ';';
              big_style = big_style + 'color: ' + text_color + ';';
              mini_style = mini_style + 'color: ' + text_color + ';';
            }
            emberSet(b, 'more_sequence', !last);
            emberSet(b, 'style', htmlSafe(style));
            emberSet(b, 'big_style', htmlSafe(big_style));
            emberSet(b, 'mini_style', htmlSafe(mini_style));
            emberSet(b, 'print_style', htmlSafe(print_style));
          });
        });
        _this.set('analysis', res);
      }, function() {
        _this.set('analysis', { error: true });
      });
    },
    report() {
      const _this = this;
      let ready = RSVP.resolve({ correct_pin: true });
      if (app_state.get('speak_mode') && app_state.get('currentUser.preferences.require_speak_mode_pin') && app_state.get('currentUser.preferences.speak_mode_pin')) {
        ready = modal.open('speak-mode-pin', { actual_pin: app_state.get('currentUser.preferences.speak_mode_pin'), action: 'none', hide_hint: app_state.get('currentUser.preferences.hide_pin_hint') });
      }
      ready.then(function(res) {
        if (res && res.correct_pin) {
          _this.set('model.analysis', _this.get('analysis'));
          _this.set('model.words', _this.get('words'));
          _this.set('model.title', _this.get('title'));
          app_state.set('focus_route', _this.get('model'));
          _this.get('router').transitionTo('user.focus', _this.get('model.user.user_name'));
        }
      });
    }
  },

  didInsertElement() {
  this._super(...arguments);
  var self = this;
    this.onClose = function() { self.send('close'); };
    this.onOpening = function() { self.send('opening'); };
    this.onClosing = function() { self.send('closing'); };
    // Ember 5.12 modal migration: the service-based modal system does not
    // auto-invoke opening() (this.onOpening is vestigial), so build modal state
    // here on insert. Without this, opening() never runs. See assessment-settings.
    self.send('opening');
},

});
