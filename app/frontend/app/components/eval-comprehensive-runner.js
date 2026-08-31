import Component from '@ember/component';
import { computed, observer } from '@ember/object';
import { inject as service } from '@ember/service';
import i18n from '../utils/i18n';
import prompt_hierarchy from '../utils/eval_prompt_hierarchy';
import persistence from '../utils/persistence';
import article50Gate from '../utils/article50_gate';

/*
 * eval-comprehensive-runner — Phase 3 scaffold. Comprehensive Eval
 * (15 min) layers four subtests onto everything captured in
 * screening + targeted:
 *   dynamic_assessment — every item escalates through 6 prompt levels
 *   literacy_probe     — receptive literacy items (reuses legacy
 *                        eval.js level-9 word lists; placeholder)
 *   sett_form          — Student / Environment / Task companion form
 *   ai_narration       — Claude-drafted SLP narrative (flagged)
 *
 * This iteration implements the dynamic_assessment subtest fully —
 * the canonical AAC research best-practice piece nobody else in
 * the market has shipped — plus placeholder cards for the other
 * three subtests so the flow runs end-to-end.
 */

// Items used for the dynamic_assessment subtest. Each item walks
// through the 6 prompt levels until the communicator succeeds or
// the SLP exhausts the hierarchy.
const DA_ITEMS = [
  { id: 'da_01', target: 'more',      prompt: 'Ask the communicator to request "more".' },
  { id: 'da_02', target: 'go',        prompt: 'Ask the communicator to say "go".' },
  { id: 'da_03', target: 'help',      prompt: 'Set up a need-help scenario.' },
  { id: 'da_04', target: 'finished',  prompt: 'Ask the communicator to indicate they are finished.' },
  { id: 'da_05', target: 'I want X',  prompt: 'Prompt a two-word request (pronoun + object).' }
];

// Literacy probe items — simple receptive literacy task. SLP shows
// the printed word and asks the communicator to point to the
// matching picture (or vice versa). Lightweight port of legacy
// eval.js level 9 for the in-comprehensive flow; the full
// orthographic / phonological battery is out of scope for Phase 3.
const LITERACY_ITEMS = [
  { id: 'lit_01', word: 'cat',   prompt: 'Match the printed word "cat" with the picture.' },
  { id: 'lit_02', word: 'dog',   prompt: 'Match the printed word "dog" with the picture.' },
  { id: 'lit_03', word: 'apple', prompt: 'Match the printed word "apple" with the picture.' },
  { id: 'lit_04', word: 'jump',  prompt: 'Match the printed word "jump" with the action.' }
];

export default Component.extend({
  appState: service('app-state'),
  classNames: ['evq-comprehensive'],
  tagName: 'section',
  session: null,
  user: null,

  // dynamic_assessment per-item state.
  daItems: null,        // array of itemState objects (one per item)
  daItemIndex: 0,
  daLevelStartedAt: null,

  // literacy_probe per-trial state.
  literacyTrialIndex: 0,
  literacyTrialStartedAt: null,
  literacyResults: null, // array of bool

  // ai_narration state.
  aiBusy: false,
  aiError: null,
  aiFlagEnabled: computed('appState.feature_flags.comprehensive_eval_ai', function() {
    return !!this.get('appState').get('feature_flags.comprehensive_eval_ai');
  }),
  aiNarrative: computed('session.aiNarrative', function() {
    return this.get('session.aiNarrative');
  }),
  // EU AI Act Article 50(2) marker for the current aiNarrative, or null when there
  // isn't one (no AI narration run yet, or the template fallback was used). Not
  // rendered directly -- carried through to EvalSession#toLogPayload so it persists
  // alongside the narrative it attests to.
  aiGenerated: computed('session.aiGenerated', function() {
    return this.get('session.aiGenerated');
  }),

  currentSubtest: computed('session.subtestIndex', 'session.state', function() {
    const session = this.get('session');
    return session ? session.currentSubtest() : null;
  }),
  isDynamicAssessment: computed('currentSubtest', function() { return this.get('currentSubtest') === 'dynamic_assessment'; }),
  isLiteracyProbe:    computed('currentSubtest', function() { return this.get('currentSubtest') === 'literacy_probe'; }),
  isSettForm:         computed('currentSubtest', function() { return this.get('currentSubtest') === 'sett_form'; }),
  isAiNarration:      computed('currentSubtest', function() { return this.get('currentSubtest') === 'ai_narration'; }),
  isWrap:             computed('currentSubtest', function() { return this.get('currentSubtest') === 'wrap'; }),

  promptLevels: computed(function() {
    return prompt_hierarchy.PROMPT_LEVELS;
  }),
  currentDaItem: computed('daItems.[]', 'daItemIndex', function() {
    const items = this.get('daItems') || [];
    return items[this.get('daItemIndex')] || null;
  }),
  currentItemSpec: computed('daItemIndex', function() {
    return DA_ITEMS[this.get('daItemIndex')] || null;
  }),
  currentLevel: computed('currentDaItem.level_index', function() {
    const item = this.get('currentDaItem');
    if (!item) { return null; }
    return prompt_hierarchy.PROMPT_LEVELS[item.level_index] || null;
  }),
  daItemNumber: computed('daItemIndex', function() {
    return this.get('daItemIndex') + 1;
  }),
  daItemTotal: computed(function() {
    return DA_ITEMS.length;
  }),

  currentLiteracyItem: computed('literacyTrialIndex', function() {
    return LITERACY_ITEMS[this.get('literacyTrialIndex')] || null;
  }),
  literacyTrialNumber: computed('literacyTrialIndex', function() {
    return this.get('literacyTrialIndex') + 1;
  }),
  literacyTrialTotal: computed(function() {
    return LITERACY_ITEMS.length;
  }),

  didInsertElement() {
    this._super(...arguments);
    this._initActiveSubtest();
  },
  subtestObserver: observer('currentSubtest', function() {
    this._initActiveSubtest();
  }),

  _initActiveSubtest() {
    if (this.get('isDynamicAssessment')) {
      this._resetDa();
    } else if (this.get('isLiteracyProbe')) {
      this._resetLiteracy();
    }
  },

  _resetLiteracy() {
    this.set('literacyTrialIndex', 0);
    this.set('literacyTrialStartedAt', Date.now());
    this.set('literacyResults', []);
  },

  _recordLiteracyAttempt(correct) {
    const item = this.get('currentLiteracyItem');
    if (!item) { return; }
    const latency_ms = this.get('literacyTrialStartedAt')
      ? Date.now() - this.get('literacyTrialStartedAt')
      : null;
    const results = (this.get('literacyResults') || []).slice();
    results.push(!!correct);
    this.set('literacyResults', results);

    const onEvent = this.get('onEvent');
    if (onEvent) {
      onEvent({
        subtest: 'literacy_probe',
        trial: item.id,
        word: item.word,
        correct: !!correct,
        latency_ms: latency_ms
      });
    }

    const nextIndex = this.get('literacyTrialIndex') + 1;
    if (nextIndex >= LITERACY_ITEMS.length) {
      const hits = results.filter(function(v) { return v === true; }).length;
      const accuracy = results.length ? Math.round((hits / results.length) * 100) / 100 : null;
      if (onEvent) {
        onEvent({
          subtest: 'literacy_probe',
          converged: true,
          summary: {
            accuracy: accuracy,
            hits: hits,
            trials: results.length
          }
        });
      }
      const onAdvance = this.get('onAdvance');
      if (onAdvance) { onAdvance(); }
      return;
    }
    this.set('literacyTrialIndex', nextIndex);
    this.set('literacyTrialStartedAt', Date.now());
  },

  _resetDa() {
    const items = DA_ITEMS.map(function(spec) {
      return prompt_hierarchy.initialItemState(spec.id);
    });
    this.set('daItems', items);
    this.set('daItemIndex', 0);
    this.set('daLevelStartedAt', Date.now());
  },

  _recordDaAttempt(succeeded) {
    const item = this.get('currentDaItem');
    if (!item) { return; }
    const spec = this.get('currentItemSpec');
    const levelObj = this.get('currentLevel');
    const timestamp_ms = Date.now();
    const nextItem = prompt_hierarchy.advanceItem(item, {
      succeeded: succeeded,
      timestamp_ms: timestamp_ms
    });

    // Update the items array immutably.
    const items = (this.get('daItems') || []).slice();
    items[this.get('daItemIndex')] = nextItem;
    this.set('daItems', items);

    // Stream a per-attempt event so the recommendation engine can
    // see every prompt level the SLP escalated through.
    const onEvent = this.get('onEvent');
    if (onEvent) {
      onEvent({
        subtest: 'dynamic_assessment',
        item_id: spec ? spec.id : item.item_id,
        target: spec ? spec.target : null,
        level: levelObj ? levelObj.id : null,
        level_index: levelObj ? levelObj.index : null,
        succeeded: !!succeeded,
        timestamp_ms: timestamp_ms
      });
    }

    if (nextItem.resolved) {
      // Advance to the next item or, if exhausted, converge and
      // continue to the next subtest.
      const nextItemIndex = this.get('daItemIndex') + 1;
      if (nextItemIndex >= DA_ITEMS.length) {
        const summary = prompt_hierarchy.summarizeDynamicAssessment(items);
        if (onEvent) {
          onEvent({
            subtest: 'dynamic_assessment',
            converged: true,
            summary: summary,
            items: items
          });
        }
        const onAdvance = this.get('onAdvance');
        if (onAdvance) { onAdvance(); }
        return;
      }
      this.set('daItemIndex', nextItemIndex);
    }
    this.set('daLevelStartedAt', Date.now());
  },

  subtestTitle: computed('currentSubtest', function() {
    switch (this.get('currentSubtest')) {
      case 'dynamic_assessment': return i18n.t('comp_dynamic_assessment_title', "Dynamic Assessment");
      case 'literacy_probe':     return i18n.t('comp_literacy_probe_title',     "Literacy Probe");
      case 'sett_form':          return i18n.t('comp_sett_form_title',          "SETT Companion");
      case 'ai_narration':       return i18n.t('comp_ai_narration_title',       "AI-Drafted Narrative");
      case 'wrap':               return i18n.t('comp_wrap_title',               "Wrap-Up");
      default:                   return i18n.t('comp_default_title',            "Comprehensive Subtest");
    }
  }),
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
    this.ctrlActionNoBubble = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.stopPropagation) { event.stopPropagation(); }
        if (event && event.preventDefault) { event.preventDefault(); }
        self.send.apply(self, [actionName].concat(bound));
      };
    };
    this.ctrlActionEventValue = function(actionName, targetProp) {
      return function(event) {
        var value = event && event.target ? event.target[targetProp] : undefined;
        self.send(actionName, value);
      };
    };
    this.ctrlActionEventValueBound = function(actionName, boundArg, targetProp) {
      return function(event) {
        var value = event && event.target ? event.target[targetProp] : undefined;
        self.send(actionName, boundArg, value);
      };
    };
  },


  actions: {
    daSucceeded() {
      this._recordDaAttempt(true);
    },
    daFailed() {
      this._recordDaAttempt(false);
    },
    literacyCorrect() {
      this._recordLiteracyAttempt(true);
    },
    literacyIncorrect() {
      this._recordLiteracyAttempt(false);
    },
    settChange(field, value) {
      const session = this.get('session');
      if (!session || !session.get) { return; }
      const sett = Object.assign({}, session.get('sett') || {});
      sett[field] = value || '';
      session.set('sett', sett);
    },
    settNext() {
      const session = this.get('session');
      const sett = session && session.get ? session.get('sett') : null;
      const onEvent = this.get('onEvent');
      if (onEvent) {
        onEvent({
          subtest: 'sett_form',
          converged: true,
          sett: sett
        });
      }
      const onAdvance = this.get('onAdvance');
      if (onAdvance) { onAdvance(); }
    },
    generateAiNarrative() {
      const _this = this;
      if (this.get('aiBusy')) { return; }
      if (!persistence.get('online')) {
        this.set('aiError', i18n.t('comp_ai_offline', "AI narration requires an Internet connection."));
        return;
      }
      const session = this.get('session');
      const payload = session && session.toLogPayload ? session.toLogPayload() : null;
      if (!payload) {
        this.set('aiError', i18n.t('comp_ai_no_payload', "Could not assemble the eval payload."));
        return;
      }
      // EU AI Act Article 50(1): first-AI-use gate. BLOCK mode (D-03) -- clinician
      // initiated, not mid-communication, so blocking here is safe. Resolves
      // immediately when no acknowledgement is needed. Safe to open from here:
      // eval-comprehensive-runner renders inside eval-quick-screen, a ROUTE page
      // (templates/eval/quick.hbs), not a modal -- so the disclosure does not
      // replace its own host the way it would in generate-board.
      //
      // GATE SUBJECT: the CLINICIAN (article50_gate.js#art50Subject, i.e. the
      // authenticated sessionUser), deliberately NOT the
      // evaluated student, even though `user_id` below correctly carries the
      // student for the COPPA / org-opt-out gate. Two different questions:
      //   - "may this student's data be processed by AI at all?" -> the student.
      //     Enforced server-side (EvalNarrator.ai_allowed_for?).
      //   - "has the human interacting with this AI been told it is an AI?"
      //     -> Article 50(1) informs the person INTERACTING. That is the SLP
      //     sitting at the keyboard, who clicks Generate and reads the draft.
      // The student is also not identifiable in the egress: payload_for_prompt
      // (lib/eval_narrator.rb) drops the student name and the etiology/diagnosis
      // outright, and PiiScrubber runs with the resolved student's name
      // blocklisted. Recording an acknowledgement against a student who never saw
      // the notice would need a new ARTICLE_50_DISCLOSURE_SOURCES entry and would
      // make the audit trail less truthful, not more. Reviewed and settled
      // 2026-07-21; see docs/task-management/2026-07-21-art50-phase3-review-fixes.md.
      article50Gate.presentBlockingGate(this.get('appState')).then(function() {
        if (_this.isDestroyed || _this.isDestroying) { return; }
        _this.set('aiBusy', true);
        _this.set('aiError', null);
        // Send the evaluated student's id so the server can apply the same
        // COPPA consent + org AI opt-out gate as every other AI call site
        // before any eval data leaves for the AI provider.
        const user = _this.get('user');
        const userId = user && user.get ? user.get('id') : null;
        // use_anthropic: true is the SLP's explicit opt-in for external-model
        // narration. This action only runs when they click "Generate AI
        // Narrative"; the server defaults to the local template and sends no
        // eval data to the AI provider unless this flag is present.
        persistence.ajax('/api/v1/eval_sessions/narrate', {
          type: 'POST',
          contentType: 'application/json',
          data: JSON.stringify({ eval_session: payload.data, user_id: userId, use_anthropic: true })
        }).then(function(res) {
          if (_this.isDestroyed || _this.isDestroying) { return; }
          _this.set('aiBusy', false);
          const narrative = res && res.narrative;
          if (!narrative) {
            _this.set('aiError', i18n.t('comp_ai_empty', "The AI did not return a narrative."));
            return;
          }
          session.set('aiNarrative', narrative);
          // EU AI Act Article 50(2): carry the marker the server minted for this
          // narrative (null for the deterministic template path) so it saves with
          // the log. See EvalSession#toLogPayload.
          session.set('aiGenerated', res.ai_generated || null);
          const onEvent = _this.get('onEvent');
          if (onEvent) {
            onEvent({
              subtest: 'ai_narration',
              converged: true,
              narrative_length: narrative.length
            });
          }
        }, function(err) {
          if (_this.isDestroyed || _this.isDestroying) { return; }
          _this.set('aiBusy', false);
          _this.set('aiError', (err && err.error) || i18n.t('comp_ai_failed', "AI narration failed. Please try again."));
        });
      }, function() {
        // Art.50 gate not acknowledged. Fail-closed: no narration request fires.
        // Surface a reason rather than leaving the button looking broken.
        if (_this.isDestroyed || _this.isDestroying) { return; }
        _this.set('aiBusy', false);
        _this.set('aiError', i18n.t('comp_ai_disclosure_required', "Please review the AI transparency notice before generating an AI narrative."));
      });
    },
    editAiNarrative(value) {
      const session = this.get('session');
      if (session && session.set) { session.set('aiNarrative', value || ''); }
    },
    aiNext() {
      const onAdvance = this.get('onAdvance');
      if (onAdvance) { onAdvance(); }
    },
    skipSubtest() {
      const onAdvance = this.get('onAdvance');
      if (onAdvance) { onAdvance(); }
    },
    finishComprehensive() {
      const onFinish = this.get('onFinish');
      if (onFinish) { onFinish(); }
    }
  }
});
