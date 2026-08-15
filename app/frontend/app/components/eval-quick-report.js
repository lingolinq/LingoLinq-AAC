import Component from '@ember/component';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';
import i18n from '../utils/i18n';
import modal from '../utils/modal';
import editManager from '../utils/edit_manager';
import persistence from '../utils/persistence';
import eval_board_builder from '../utils/eval_board_builder';
import goals_grid from '../utils/eval_goals_grid';
import openRecommendedHomeBoard, { vocalFlairButtonsForGrid } from '../utils/recommended_home_board';

/*
 * eval-quick-report — final summary card.
 *
 * Reads the recommendation off the session and surfaces it in an SLP-friendly
 * card with action buttons for "Save", "Build starter board", and
 * "Promote to Targeted Eval". Build-starter-board posts the
 * recommendation-derived payload to /api/v1/boards (same endpoint the
 * generate-board flow uses) so the SLP gets a working board on day 1.
 */
export default Component.extend({
  appState: service('app-state'),
  router: service('router'),
  classNames: ['evq__report'],
  tagName: 'div',
  session: null,
  user: null,
  buildingBoard: false,
  buildError: null,

  recommendation: computed('session.recommendation', function() {
    return this.get('session.recommendation') || {};
  }),

  durationLabel: computed('session', function() {
    const seconds = this.get('session') ? this.get('session').durationSeconds() : 0;
    const minutes = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return i18n.t('report_duration', "%{m}m %{s}s", { m: minutes, s: sec });
  }),

  confidencePct: computed('recommendation.confidence', function() {
    return Math.round((this.get('recommendation.confidence') || 0) * 100);
  }),

  shouldPromote: computed('recommendation.next_action', function() {
    return this.get('recommendation.next_action') === 'promote_to_targeted';
  }),
  shouldPromoteToComprehensive: computed('recommendation.next_action', function() {
    return this.get('recommendation.next_action') === 'promote_to_comprehensive';
  }),

  promoteReasonsLabel: computed('recommendation.promote_reasons', function() {
    const reasons = this.get('recommendation.promote_reasons') || [];
    if (!reasons.length) { return null; }
    return reasons.map(function(r) {
      switch (r) {
        case 'low_event_count':   return i18n.t('promote_reason_low_count', "Limited data captured");
        case 'access_ambiguous':  return i18n.t('promote_reason_access', "Two access methods scored close");
        case 'library_tie':       return i18n.t('promote_reason_library', "Symbol libraries scored evenly");
        case 'stage_borderline':  return i18n.t('promote_reason_stage', "Communicator stage borderline");
        default:                  return r;
      }
    }).join(' · ');
  }),

  // Targeted-eval extras — surface the per-subtest data when this
  // session has been promoted (recommendation.eval_mode = 'targeted'
  // or 'comprehensive', since comprehensive merges targeted data).
  isTargetedReport: computed('recommendation.eval_mode', function() {
    const mode = this.get('recommendation.eval_mode');
    return mode === 'targeted' || mode === 'comprehensive';
  }),
  isComprehensiveReport: computed('recommendation.eval_mode', function() {
    return this.get('recommendation.eval_mode') === 'comprehensive';
  }),
  comprehensiveReport: computed('recommendation.comprehensive_report', function() {
    return this.get('recommendation.comprehensive_report') || {};
  }),
  daSummary: computed('comprehensiveReport.dynamic_assessment', function() {
    return this.get('comprehensiveReport.dynamic_assessment') || null;
  }),
  literacySummary: computed('comprehensiveReport.literacy_probe', function() {
    return this.get('comprehensiveReport.literacy_probe') || null;
  }),
  literacyAccuracyPct: computed('literacySummary.accuracy', function() {
    const a = this.get('literacySummary.accuracy');
    return a == null ? null : Math.round(a * 100);
  }),
  comprehensiveSett: computed('comprehensiveReport.sett', function() {
    return this.get('comprehensiveReport.sett') || null;
  }),

  // DAGG-style goals grid — derived from the recommendation across
  // Light's four communicative competencies. Always available;
  // SLPs can drop the comprehensive eval's goals straight into an
  // IEP draft. The grid lists four categories with 1–2 goals each.
  goalsGrid: computed('recommendation', function() {
    const rec = this.get('recommendation');
    if (!rec) { return []; }
    return goals_grid.generateGoalsGrid(rec);
  }),
  targetedReport: computed('recommendation.targeted_report', function() {
    return this.get('recommendation.targeted_report') || {};
  }),
  adaptiveGridReport: computed('targetedReport.adaptive_grid', function() {
    return this.get('targetedReport.adaptive_grid') || null;
  }),
  library3wayReport: computed('targetedReport.library_3way', function() {
    return this.get('targetedReport.library_3way') || null;
  }),
  accessCoTrialReport: computed('targetedReport.access_co_trial', function() {
    return this.get('targetedReport.access_co_trial') || null;
  }),
  syntaxProbeReport: computed('targetedReport.syntax_probe', function() {
    return this.get('targetedReport.syntax_probe') || null;
  }),
  motorMapReport: computed('targetedReport.motor_map', function() {
    return this.get('targetedReport.motor_map') || null;
  }),
  motorMapHits: computed('motorMapReport.hit_locations', function() {
    return this.get('motorMapReport.hit_locations') || [];
  }),
  motorMapAccuracyPct: computed('motorMapReport.accuracy', function() {
    const a = this.get('motorMapReport.accuracy');
    return a == null ? null : Math.round(a * 100);
  }),
  syntaxReceptivePct: computed('syntaxProbeReport.receptive_accuracy', function() {
    const a = this.get('syntaxProbeReport.receptive_accuracy');
    return a == null ? null : Math.round(a * 100);
  }),
  syntaxExpressivePct: computed('syntaxProbeReport.expressive_accuracy', function() {
    const a = this.get('syntaxProbeReport.expressive_accuracy');
    return a == null ? null : Math.round(a * 100);
  }),
  libraryPicksList: computed('library3wayReport.picks', function() {
    const picks = this.get('library3wayReport.picks') || {};
    return Object.keys(picks).map(function(k) {
      return { id: k, count: picks[k] };
    });
  }),
  accessSummaryList: computed('accessCoTrialReport.tallies', function() {
    const tallies = this.get('accessCoTrialReport.tallies') || {};
    return Object.keys(tallies).map(function(k) {
      const t = tallies[k];
      const attempts = (t.hits || 0) + (t.misses || 0);
      const accuracy = attempts ? Math.round((t.hits / attempts) * 100) : null;
      return { method: k, attempts: attempts, accuracy: accuracy, hits: t.hits || 0 };
    });
  }),

  // Symbol-library card is hidden on single-library deployments — there is no
  // choice to report. Mirrors the subtest filtering in eval_session.
  librarySelectionActive: computed('appState.feature_flags.eval_single_library', function() {
    return !this.get('appState.feature_flags.eval_single_library');
  }),

  // The Vocal Flair set matching the recommended grid. The five published sets
  // (24/40/60/84/112) line up 1:1 with GRID_BANDS, so this is a direct read.
  vocalFlairButtons: computed('recommendation.grid_size', function() {
    var grid = this.get('recommendation.grid_size');
    if (!grid) { return null; }
    return vocalFlairButtonsForGrid(grid);
  }),

  // routes/eval/quick resolves `user` from params.user_id, and leaves it NULL when
  // the eval is run unattached to a communicator. Assigning in that state would
  // silently copy the board onto the signed-in SLP's own account — the exact
  // failure this feature exists to avoid — so the action is gated, not defaulted.
  canAssignVocalFlair: computed('user', function() {
    var u = this.get('user');
    return !!(u && u.get && u.get('user_name'));
  }),

  vocalFlairForLabel: computed('user', function() {
    var u = this.get('user');
    return (u && u.get) ? (u.get('user_name') || '') : '';
  }),

  vocalFlairLabel: computed('vocalFlairButtons', function() {
    var n = this.get('vocalFlairButtons');
    if (!n) { return ''; }
    return i18n.t('report_vocal_flair_name', "Vocal Flair %{n}", { n: n });
  }),

  gridLabel: computed('recommendation.grid_size', function() {
    const grid = this.get('recommendation.grid_size');
    if (!grid) { return ''; }
    return i18n.t('report_grid_label', "%{rows} × %{cols} (%{band})", { rows: grid.rows, cols: grid.cols, band: grid.band });
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
  },


  // Clear the setup_user override set by openVocalFlair so it cannot leak into
  // an unrelated flow if the SLP closes the preview without picking.
  willDestroyElement() {
    this._super(...arguments);
    if (this.get('_priorSetupUser') !== undefined) {
      this.set('appState.setup_user', this.get('_priorSetupUser'));
    }
  },

  actions: {
    // Open the recommended Vocal Flair set in the shared board-preview modal
    // (recommend:true header + "Pick this Board"), so the SLP chooses the board
    // for the communicator being evaluated through the same flow the standalone
    // board picker uses. Reuses recommended_home_board rather than duplicating
    // the query/preview logic.
    openVocalFlair: function() {
      var n = this.get('vocalFlairButtons');
      if (!n) { return; }
      var _this = this;

      // The board must become the COMMUNICATOR'S home board, not the SLP's.
      // board-preview-overlay#pick_for_home resolves its target as
      // `app_state.setup_user || app_state.currentUser` — setup_user is the same
      // lever the standalone picker uses to act on a supervisee
      // (controllers/board-picker#_resolve_setup_user). Point it at the person
      // this eval is for; without this the copy lands on whoever is signed in,
      // which for a school SLP is their own account.
      var evaluatee = this.get('user');
      if (evaluatee && evaluatee.get) {
        this.set('_priorSetupUser', this.get('appState.setup_user') || null);
        this.set('appState.setup_user', evaluatee);
      }

      // NOTE: setup_user is deliberately NOT restored when the query settles —
      // the SLP picks a board from the modal later, and pick_for_home reads
      // setup_user at THAT moment. It is cleared in willDestroyElement instead,
      // so it cannot leak past this report.
      _this.set('loadingVocalFlair', true);
      var done = function() { _this.set('loadingVocalFlair', false); };
      openRecommendedHomeBoard(n).then(done, done);
    },

    notesChanged(value) {
      const session = this.get('session');
      if (session && session.set) {
        session.set('slpNotes', value || '');
      }
    },
    save() {
      const onSave = this.get('onSave');
      if (onSave) { onSave(); }
    },
    promote() {
      const onPromote = this.get('onPromote');
      if (onPromote) { onPromote(); }
    },
    promoteComprehensive() {
      const onPromoteComprehensive = this.get('onPromoteComprehensive');
      if (onPromoteComprehensive) { onPromoteComprehensive(); }
    },
    buildStarterBoard() {
      const _this = this;
      if (this.get('buildingBoard')) { return; }
      if (!persistence.get('online')) {
        this.set('buildError', i18n.t('eval_build_board_offline', "Board creation requires an Internet connection."));
        return;
      }
      const spec = this.get('recommendation.starter_board_spec');
      if (!spec) {
        this.set('buildError', i18n.t('eval_build_board_no_spec', "No starter-board spec on this evaluation."));
        return;
      }
      const user = this.get('user');
      const forUserId = (user && user.get) ? user.get('user_name') : 'self';
      const payload = eval_board_builder.fromSpec(spec, {
        for_user_id: forUserId || 'self',
        locale: (user && user.get && user.get('preferences.locale')) || 'en'
      });
      this.set('buildingBoard', true);
      this.set('buildError', null);
      persistence.ajax('/api/v1/boards', {
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ board: payload })
      }).then(function(res) {
        _this.set('buildingBoard', false);
        const board = res && res.board;
        if (!board || !board.key) {
          _this.set('buildError', i18n.t('eval_build_board_unknown', "Board was created but couldn't be opened. Check My Boards."));
          return;
        }
        editManager.auto_edit(board.id);
        _this.get('appState').set('referenced_board', { id: board.id, key: board.key });
        const parts = String(board.key).split('/');
        if (parts.length >= 2) {
          _this.get('router').transitionTo('user.board-detail', parts[0], parts.slice(1).join('/'));
        } else {
          _this.get('router').transitionTo('board', board.key);
        }
      }, function(err) {
        _this.set('buildingBoard', false);
        const msg = (err && err.error) || i18n.t('eval_build_board_failed', "Could not build the starter board. Please try again.");
        _this.set('buildError', msg);
      });
    }
  }
});
