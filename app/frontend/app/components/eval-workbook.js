import Component from '@ember/component';
import { computed, set as emberSet } from '@ember/object';
import { inject as service } from '@ember/service';
import RSVP from 'rsvp';
import i18n from '../utils/i18n';
import evaluation from '../utils/eval';
import persistence from '../utils/persistence';
import workbook_schema from '../utils/eval_workbook';

/*
 * eval-workbook — the fill-in half of the eval report.
 *
 * The report can measure access, display and symbol skills; it cannot measure
 * the sections a funding reviewer or an IEP team also requires (non-SGD
 * rule-outs, less-costly trials, daily needs, attestations / SETT, PLAAFP,
 * backup plan). Those are listed as expandable sections with real inputs, so
 * the SLP writes them here instead of rebuilding the report in a word processor.
 *
 * STRUCTURE comes from utils/eval_workbook (pure); LABELS are built here as
 * literal i18n.t() calls, because i18n_generator.rb is a static parser and
 * cannot see strings stored in a data table.
 *
 * SAVING — see evaluation.save_workbook for the full reasoning. In short: the
 * workbook rides inside the eval blob and is written by re-sending the whole
 * eval, because no endpoint merges into a saved eval. Two consequences shape
 * this component:
 *   1. Delivery is asynchronous (stash -> throttled push -> Resque), so the
 *      status says "saved, syncing", never a bare "saved".
 *   2. The server only updates in place when the author matches; otherwise it
 *      creates a DUPLICATE eval record. So a non-author gets a read-only
 *      workbook with the reason shown, rather than a save that forks the eval.
 */
export default Component.extend({
  appState: service('app-state'),
  tagName: 'section',
  classNames: ['evq-workbook'],
  classNameBindings: ['expanded:evq-workbook--open'],

  mode: 'medical',
  analysis: null,
  assessment: null,
  log: null,
  expanded: false,
  openSection: null,
  saveState: null,
  // Bumped on every keystroke. The workbook values are PLAIN objects mutated in
  // place, so nothing invalidates on its own; this counter is what the derived
  // status (started badges, progress line) watches.
  //
  // It exists specifically so keystrokes do NOT invalidate `workbook` and with
  // it `displaySections` — see the comment there.
  revision: 0,

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
    // Add/remove-row buttons sit inside an open section, not the toggle, but
    // keep this on the same footing as the rest of the eval components.
    this.ctrlActionNoBubble = function(actionName) {
      var bound = Array.prototype.slice.call(arguments, 1);
      return function(event) {
        if (event && event.stopPropagation) { event.stopPropagation(); }
        if (event && event.preventDefault) { event.preventDefault(); }
        self.send.apply(self, [actionName].concat(bound));
      };
    };
    // Writes one field, given the object that holds it and the key. Passing the
    // target object rather than a dotted path keeps repeating rows out of
    // Ember-path territory entirely (no "rows.0.option" index traversal) and
    // means one writer covers textareas, field sets and row cells alike.
    // sectionId is only used to record WHICH section this session edited, for
    // the concurrent-save merge (see mergedForSend). It is deliberately not part
    // of the write itself.
    this.fieldWriter = function(target, key, sectionId) {
      return function(event) {
        var el = event && event.target;
        if (!el || !target || !key) { return; }
        self.writeField(target, key, el.value, sectionId);
      };
    };
    this.set('workbook', workbook_schema.hydrate(this.get('analysis.report_workbook')));
    this.set('_hydratedFor', this.evalIdentity());
    this._dirtySections = {};
  },

  // Which eval is on screen. The log controller is a singleton reused across
  // communicators, so the workbook must re-hydrate when a DIFFERENT eval is
  // shown — otherwise it could display one eval's answers while saving them
  // onto another's.
  evalIdentity() {
    return this.get('log.id') || this.get('assessment.ref_id') || this.get('assessment.started') || null;
  },

  // Keyed on the eval's identity, NOT on the stored workbook object: saving
  // replaces that object, and re-hydrating from our own write would reset the
  // field the SLP is still typing in.
  didReceiveAttrs() {
    this._super(...arguments);
    var identity = this.evalIdentity();
    if (this.get('_hydratedFor') !== identity) {
      this.set('_hydratedFor', identity);
      this.set('workbook', workbook_schema.hydrate(this.get('analysis.report_workbook')));
      this.set('saveState', null);
      this.set('openSection', null);
      this.set('resolvedLogId', null);
      // A DIFFERENT eval is on screen now. Carrying the previous one's dirty
      // sections over would lay its answers onto this eval's stored workbook on
      // the next save — the same cross-eval bleed evalIdentity() exists to stop.
      this._dirtySections = {};
    }
    this.lookupSavedLog();
  },

  sections: computed('mode', function() {
    return workbook_schema.sectionsFor(this.get('mode'));
  }),

  isSchoolMode: computed('mode', function() {
    return this.get('mode') === 'school';
  }),

  // The workbook holds both modes at once so switching the report between
  // Medical and School never discards typed work; this is the slice on screen.
  activeValues: computed('workbook', 'mode', function() {
    var wb = this.get('workbook') || {};
    return wb[this.get('mode') === 'school' ? 'school' : 'medical'] || {};
  }),

  startedCount: computed('workbook', 'mode', 'revision', function() {
    return workbook_schema.startedCount(this.get('mode'), this.get('workbook'));
  }),

  // Per-section started/empty state, keyed by section id.
  //
  // Deliberately NOT a field on the `displaySections` objects: it is the only
  // part of a section that changes while the SLP types, and putting it there
  // would force the whole structure to recompute on every keystroke.
  startedMap: computed('workbook', 'mode', 'sections', 'activeValues', 'revision', function() {
    var values = this.get('activeValues') || {};
    var map = {};
    (this.get('sections') || []).forEach(function(section) {
      map[section.id] = workbook_schema.sectionStarted(section, values[section.id] || {});
    });
    return map;
  }),

  sectionCount: computed('sections', function() {
    return (this.get('sections') || []).length;
  }),

  progressLabel: computed('startedCount', 'sectionCount', function() {
    // One line — i18n_generator.rb needs the closing ")" on the same line as the
    // English string, or the key is reported MISSING and blocks generation.
    return i18n.t('workbook_progress', "%{n} of %{t} sections started", {n: this.get('startedCount'), t: this.get('sectionCount')});
  }),

  // The schema decorated with its labels and current values — everything the
  // template needs, resolved in JS.
  //
  // Labels are looked up HERE rather than in the template on purpose: the label
  // map is keyed "sec.<id>" / "<id>.<field>", and Ember's `{{get}}` helper reads
  // a dot as a PATH separator, so `{{get this.labels "sec.least_costly"}}` asks
  // for labels.sec.least_costly and silently renders nothing. Plain JS lookup
  // treats the same string as one literal key.
  //
  // THIS MUST NOT RECOMPUTE WHILE THE SLP IS TYPING. It returns fresh plain
  // objects every time, and `{{#each}}` keys on @identity, so a recompute tears
  // down and rebuilds every section body — including the focused input. When
  // keystrokes invalidated it, each field accepted exactly ONE character before
  // the element was destroyed and focus fell back to <body>: the workbook could
  // not be filled in at all.
  //
  // So the dependent keys here are structural only (which sections exist, in
  // which mode, with which labels and which value objects). Everything that
  // changes per keystroke — the started badges, the progress line — hangs off
  // `revision` instead, and the values themselves are mutated in place inside
  // the objects this already handed to the template.
  //
  // Row add/remove DOES change structure, so those actions still invalidate
  // `workbook` on purpose.
  displaySections: computed('mode', 'sections', 'workbook', 'activeValues', 'labels', function() {
    var labels = this.get('labels');
    var values = this.get('activeValues');
    return (this.get('sections') || []).map(function(section) {
      var value = values[section.id] || {};
      var out = {
        id: section.id,
        isTextarea: section.type === 'textarea',
        isFields: section.type === 'fields',
        isRows: section.type === 'rows',
        label: labels['sec.' + section.id],
        hint: labels['hint.' + section.id],
        value: value
        // No `started` here on purpose — it is the one per-section value that
        // changes as the SLP types, and it lives on `startedMap` instead so
        // this structure can stay cached. See the note above.
      };
      if (section.type === 'fields') {
        out.fields = (section.fields || []).map(function(field) {
          return { key: field, label: labels[section.id + '.' + field] };
        });
      } else if (section.type === 'rows') {
        out.columns = (section.columns || []).map(function(col) {
          return { key: col, label: labels[section.id + '.' + col] };
        });
        out.rows = value.rows || [];
      } else {
        out.notesLabel = labels[section.id + '.notes'];
      }
      return out;
    });
  }),

  // The eval this workbook belongs to must be one we can write back to.
  //
  // On a saved log page that's just `log.id`. On the in-memory last-eval page
  // there is no id — the eval was pushed as an event and its LogSession is
  // written later by a background job — so we look the record up (resolvedLogId,
  // below) and otherwise lean on the server's ref_id match.
  logId: computed('log.id', 'log.eval_in_memory', 'resolvedLogId', function() {
    if (this.get('log.eval_in_memory')) { return this.get('resolvedLogId') || null; }
    return this.get('log.id') || null;
  }),

  // Resolve the saved record for an in-memory eval, once per eval on screen.
  // Best-effort: a failure just leaves the ref_id path in play.
  lookupSavedLog() {
    var _this = this;
    if (!this.get('log.eval_in_memory')) { return; }
    var assessment = this.get('assessment');
    var userId = this.get('log.user_id') || (assessment && assessment.user_id);
    if (!assessment || !userId) { return; }
    var identity = this.evalIdentity();
    if (this.get('_lookupFor') === identity) { return; }
    this.set('_lookupFor', identity);
    this.set('lookupPending', true);
    var done = function(id) {
      if (_this.isDestroyed || _this.isDestroying) { return; }
      _this.set('lookupPending', false);
      if (id && _this.evalIdentity() === identity) { _this.set('resolvedLogId', id); }
    };
    evaluation.find_saved_log_id(userId, assessment).then(done, function() { done(null); });
  },

  // Author check mirrors the server's: it only updates in place when the eval's
  // author matches, and creates a duplicate record otherwise.
  isAuthor: computed('log.author.id', 'log.author.user_name', 'appState.sessionUser.id',
      'appState.sessionUser.global_id', 'appState.sessionUser.user_name',
      'log.eval_in_memory', 'assessment.author_id', function() {
    var me = this.get('appState.sessionUser.id');
    // An in-memory eval has no saved LogSession to read an author off, so it
    // carries its own: utils/eval stamps `author_id` when the eval starts, and
    // that survives into the IndexedDB snapshot the results page recovers from.
    //
    // This CANNOT fall back to `true`. The snapshot is keyed by communicator, not
    // by evaluator, so on a shared device a second SLP can open the first SLP's
    // unsaved eval for the same communicator. Saving a workbook from that account
    // re-sends the eval under the wrong author, and the server answers by filing a
    // DUPLICATE evaluation rather than updating (log_session.rb:1075).
    //
    // Fails closed when the stamp is missing — a snapshot from a build before this
    // existed reads as not-mine and the workbook goes read-only. That is the right
    // trade: those snapshots expire within EVAL_PROGRESS_MAX_AGE_S, and a
    // read-only workbook costs some retyping while a forked evaluation corrupts
    // the clinical record.
    if (this.get('log.eval_in_memory')) {
      var recorded = this.get('assessment.author_id');
      if (!recorded || !me) { return false; }
      return String(recorded) === String(me);
    }
    var author = this.get('log.author.id');
    // `global_id` (models/user.js) is the real backend id on BOTH load paths — the
    // record's own id when it came from local storage, and the `_actual_id` the
    // serializer parked when it came from the network as the 'self' alias. Compare
    // with that, never with `.id`, which is 'self' inside that window.
    var myGlobal = this.get('appState.sessionUser.global_id') || me;
    if (author && myGlobal && String(author) === String(myGlobal)) { return true; }
    // `sessionUser.id` is NOT reliably the user's global id. serializers/
    // application.js#normalizeResponse deliberately pins the session user's record
    // id to the literal string 'self' so Ember Data never re-keys the identifier,
    // and the real id it stashes alongside as `_actual_id` is dropped because the
    // user model never declares that attr. app-state.js:456 loads the session user
    // through exactly that path (`findRecord('user', 'self')`).
    //
    // Observed live: sessionUser.id === 'self' while log.author.id === '1_24', held
    // for 40s+. The comparison above then reads as a MISMATCH rather than as "not
    // known yet", so the eval's own author is shown the read-only banner and cannot
    // type in their own workbook until a reload. create-board-new.js:1361 guards
    // `ownerId !== 'self'` for the same reason, so the state is known elsewhere.
    //
    // Deliberately NOT falling back to matching user_name. `global_id` covers both
    // load paths exactly, so a second notion of identity on an authorship gate
    // would be redundant surface with no case left for it to catch.
    return false;
  }),

  hasSaveTarget: computed('assessment', 'logId', function() {
    var a = this.get('assessment');
    if (!a) { return false; }
    return !!(this.get('logId') || a.ref_id);
  }),

  // Typing is gated ONLY on authorship. Whether the eval already has a saved
  // record decides where the entries GO, not whether the SLP may write them —
  // blocking the form because a background job hasn't run yet would lose the
  // observations they are trying to record right now.
  canEdit: computed('isAuthor', function() {
    return this.get('isAuthor');
  }),

  canSave: computed('isAuthor', 'hasSaveTarget', function() {
    return this.get('isAuthor') && this.get('hasSaveTarget');
  }),

  readOnlyReason: computed('isAuthor', 'hasSaveTarget', 'lookupPending', function() {
    if (!this.get('isAuthor')) {
      return i18n.t('workbook_readonly_author', "Only the evaluator who recorded this eval can add to its workbook — saving from another account would file a duplicate evaluation.");
    }
    if (this.get('lookupPending')) {
      return i18n.t('workbook_locating', "Finding this evaluation's saved record…");
    }
    if (!this.get('hasSaveTarget')) {
      return i18n.t('workbook_not_attached', "This evaluation hasn't finished saving yet. You can still fill this in — entries are kept on this device and attach to the evaluation once it has saved.");
    }
    return null;
  }),

  saving: computed('saveState', function() {
    return this.get('saveState') === 'saving';
  }),

  saveMessage: computed('saveState', function() {
    switch (this.get('saveState')) {
      case 'saving':  return i18n.t('workbook_saving', "Saving…");
      // Honest wording: log_event queues the write and the server applies it in
      // a background job, so the data is safe locally but not yet on the server.
      case 'queued':  return i18n.t('workbook_saved_syncing', "Saved. Syncing to the evaluation…");
      // Deliberately does NOT promise sync-on-reconnect. Verified offline
      // end-to-end: reconnecting sets stashes.online but does not drain the queued
      // write — services/stashes.js:806 carries the TODO for the missing
      // persistence.online listener, so the push only happens on a sync or the next
      // logged event. The queue IS persisted (it survives reloads), so the entry is
      // retained, but "it will sync when you reconnect" was a promise the code does
      // not keep. Restore that wording only alongside the reconnect listener.
      case 'offline': return i18n.t('workbook_saved_offline', "Saved on this device — not uploaded yet. Reconnect and sync to add it to the evaluation.");
      case 'local':   return i18n.t('workbook_saved_local', "Kept on this device — not attached to the evaluation yet.");
      case 'error':   return i18n.t('workbook_save_failed', "Could not save the workbook. Your entries are still on screen — try again.");
      default:        return null;
    }
  }),

  saveStatusClass: computed('saveState', function() {
    var state = this.get('saveState');
    if (state === 'error') { return 'evq-workbook__status evq-workbook__status--error'; }
    if (state === 'saving') { return 'evq-workbook__status evq-workbook__status--saving'; }
    if (state) { return 'evq-workbook__status evq-workbook__status--saved'; }
    return 'evq-workbook__status';
  }),

  // One flat label map, built with literal i18n.t() calls so i18n_generator can
  // see every string. Keys: "sec.<id>", "hint.<id>", "<id>.<field-or-column>".
  labels: computed(function() {
    return {
      // --- Medical / funding -------------------------------------------------
      'sec.non_sgd_ruled_out': i18n.t('wb_sec_non_sgd', "Non-SGD options considered"),
      'hint.non_sgd_ruled_out': i18n.t('wb_hint_non_sgd', "Therapy, sign, writing, communication boards or PECS, low-tech options — and why each was ruled out."),
      'non_sgd_ruled_out.notes': i18n.t('wb_non_sgd_notes', "Options considered and reason ruled out"),

      'sec.least_costly': i18n.t('wb_sec_least_costly', "Less-costly alternatives trialled"),
      'hint.least_costly': i18n.t('wb_hint_least_costly', "One row per alternative. Trial length, the training given, and the specific reason it was ruled out are all required — this is the section most often found too thin."),
      'least_costly.option': i18n.t('wb_least_costly_option', "Alternative trialled"),
      'least_costly.trial_length': i18n.t('wb_least_costly_length', "Trial length"),
      'least_costly.training': i18n.t('wb_least_costly_training', "Training provided"),
      'least_costly.reason': i18n.t('wb_least_costly_reason', "Reason ruled out"),

      'sec.daily_needs_by_environment': i18n.t('wb_sec_daily_needs', "Daily communication needs"),
      'hint.daily_needs_by_environment': i18n.t('wb_hint_daily_needs', "One row per environment and partner, plus the needs over the next two years."),
      'daily_needs_by_environment.environment': i18n.t('wb_daily_needs_environment', "Environment"),
      'daily_needs_by_environment.partner': i18n.t('wb_daily_needs_partner', "Communication partner"),
      'daily_needs_by_environment.needs': i18n.t('wb_daily_needs_needs', "Needs in that setting"),

      'sec.functional_goals': i18n.t('wb_sec_functional_goals', "Functional communication goals"),
      'hint.functional_goals': i18n.t('wb_hint_functional_goals', "Measurable and time-framed, set before the trial, with the outcome at completion."),
      'functional_goals.notes': i18n.t('wb_functional_goals_notes', "Goals and outcomes"),

      'sec.implementation_plan': i18n.t('wb_sec_implementation', "Treatment and implementation plan"),
      'hint.implementation_plan': i18n.t('wb_hint_implementation', "Include the training schedule — who is trained, on what, and how often."),
      'implementation_plan.notes': i18n.t('wb_implementation_notes', "Plan and training schedule"),

      'sec.product_line': i18n.t('wb_sec_product', "Recommended system"),
      'hint.product_line': i18n.t('wb_hint_product', "A funding submission has to name the specific product; a browser or tablet AAC app is software-only under E2511."),
      'product_line.manufacturer': i18n.t('wb_product_manufacturer', "Manufacturer"),
      'product_line.product_name': i18n.t('wb_product_name', "Product name"),
      'product_line.model_number': i18n.t('wb_product_model', "Product number"),
      'product_line.hcpcs': i18n.t('wb_product_hcpcs', "HCPCS code"),
      'product_line.accessories': i18n.t('wb_product_accessories', "Accessories and justification for each"),

      'sec.attestations': i18n.t('wb_sec_attestations', "Signatures and attestations"),
      'hint.attestations': i18n.t('wb_hint_attestations', "Include the statement that you have no financial relationship with the supplier."),
      'attestations.slp_name': i18n.t('wb_attest_slp', "Evaluating SLP"),
      'attestations.license_number': i18n.t('wb_attest_license', "License number"),
      'attestations.asha_ccc': i18n.t('wb_attest_asha', "ASHA CCC number"),
      'attestations.npi': i18n.t('wb_attest_npi', "NPI"),
      'attestations.physician': i18n.t('wb_attest_physician', "Referring physician"),

      // --- School / IEP ------------------------------------------------------
      'sec.sett': i18n.t('wb_sec_sett', "SETT framework"),
      'hint.sett': i18n.t('wb_hint_sett', "Describe Student, Environment and Task before any Tool — the tool is chosen last."),
      'sett.student': i18n.t('wb_sett_student', "Student"),
      'sett.environment': i18n.t('wb_sett_environment', "Environment"),
      'sett.task': i18n.t('wb_sett_task', "Task"),

      'sec.customary_environments': i18n.t('wb_sec_environments', "Customary environments"),
      'hint.customary_environments': i18n.t('wb_hint_environments', "Where the evaluation took place, and what was observed in the settings the student actually uses."),
      'customary_environments.notes': i18n.t('wb_environments_notes', "Settings observed and what was seen"),

      'sec.plaafp': i18n.t('wb_sec_plaafp', "Present levels (PLAAFP)"),
      'hint.plaafp': i18n.t('wb_hint_plaafp', "Present levels of academic achievement and functional performance, in the team's language."),
      'plaafp.notes': i18n.t('wb_plaafp_notes', "Present levels statement"),

      'sec.standards_aligned_goals': i18n.t('wb_sec_goals_school', "IEP goals"),
      'hint.standards_aligned_goals': i18n.t('wb_hint_goals_school', "Measurable and standards-aligned, and state how each will be measured. The suggested goals above are a starting draft."),
      'standards_aligned_goals.notes': i18n.t('wb_goals_school_notes', "Goals and measurement method"),

      'sec.backup_plan': i18n.t('wb_sec_backup', "Device-failure backup plan"),
      'hint.backup_plan': i18n.t('wb_hint_backup', "How the student communicates when the device is unavailable, being repaired, or out of charge."),
      'backup_plan.notes': i18n.t('wb_backup_notes', "Backup communication plan"),

      'sec.ownership_transition': i18n.t('wb_sec_ownership', "Ownership and transition"),
      'hint.ownership_transition': i18n.t('wb_hint_ownership', "Who owns the system, what happens at transition, and the staff-training commitment."),
      'ownership_transition.notes': i18n.t('wb_ownership_notes', "Ownership, transition and training")
    };
  }),

  // Sections this session has edited, as a "<mode>:<sectionId>" Set. Not tracked
  // per field: the merge granularity is the section, and a Set of section keys
  // avoids the dotted Ember paths this component deliberately stays out of.
  markSectionDirty(sectionId) {
    if (!sectionId) { return; }
    if (!this._dirtySections) { this._dirtySections = {}; }
    this._dirtySections[(this.get('mode') === 'school' ? 'school' : 'medical') + ':' + sectionId] = true;
  },

  dirtyKeys() {
    return Object.keys(this._dirtySections || {});
  },

  writeField(target, key, value, sectionId) {
    emberSet(target, key, value);
    this.markSectionDirty(sectionId);
    // Plain-object writes don't invalidate computeds on their own, so the badges
    // and progress line have to be told. Bump `revision` rather than notifying
    // `workbook`: notifying `workbook` also invalidates `displaySections`, which
    // rebuilds the section DOM and destroys the input being typed into.
    this.incrementProperty('revision');
    this.set('saveState', null);
    this.scheduleSave();
  },

  // Hand-rolled rather than @ember/runloop's debounce: the lint rule bans
  // runloop functions in favour of ember-lifeline, which is not installed here,
  // and a raw timer is what the codebase's other autosaves use.
  //
  // Long enough that a sentence is one save rather than one per keystroke —
  // every save re-sends the whole eval blob.
  SAVE_DEBOUNCE_MS: 2500,

  scheduleSave() {
    if (!this.get('canEdit')) { return; }
    var _this = this;
    if (this._saveTimer) { clearTimeout(this._saveTimer); }
    this._saveTimer = setTimeout(function() {
      _this._saveTimer = null;
      _this.persistWorkbook();
    }, this.get('SAVE_DEBOUNCE_MS'));
  },

  // Read the newest stored workbook WITHOUT going through the store.
  //
  // Two traps this avoids. (1) `store.findRecord(..., {reload: true})` does NOT
  // reach the network in this app — persistence.js#findRecord is offline-first
  // and hard-codes start_with_local, so the flag never gets there (the same trap
  // documented at utils/board-copy.js:37). (2) `log.reload()` DOES reach the
  // server, but it mutates the record the report is bound to, so `analysis`
  // recomputes and the whole report re-renders — every few seconds, while the
  // SLP is typing. A plain GET answers the question and touches nothing.
  //
  // Resolves to null whenever there is nothing safe to merge against (offline,
  // no resolved id, request failed); callers then send the local copy as before.
  fetchStoredWorkbook() {
    var id = this.get('logId');
    if (!id) { return RSVP.resolve(null); }
    if (!persistence.get('online')) { return RSVP.resolve(null); }
    return new RSVP.Promise(function(resolve) {
      persistence.ajax('/api/v1/logs/' + id, { type: 'GET' }).then(function(data) {
        var evl = data && data.log && data.log.evaluation;
        resolve((evl && evl.report_workbook) || null);
      }, function() { resolve(null); });
    });
  },

  // What to actually send: this session's edited sections laid over the newest
  // stored copy, so a section another session wrote is not wiped by our save.
  mergedForSend(stored) {
    if (!stored) { return this.get('workbook'); }
    return workbook_schema.mergeForSend(stored, this.get('workbook'), this.dirtyKeys());
  },

  // The actual write. Kept free of component state so it can also run while the
  // component is tearing down.
  //
  // `skip_merge` is for the teardown path only: an async GET during
  // willDestroyElement is not reliably completed, and losing the paragraph just
  // typed is a worse failure than the rare clobber the merge prevents.
  sendWorkbook(skip_merge) {
    var _this = this;
    var send = function(stored) {
      return evaluation.save_workbook({
        assessment: _this.get('assessment'),
        log_id: _this.get('logId'),
        workbook: _this.mergedForSend(stored),
        // No record to attach to yet -> hold it locally. Sending would file a
        // duplicate evaluation rather than update this one.
        local_only: !_this.get('hasSaveTarget')
      });
    };
    if (skip_merge || !this.get('hasSaveTarget')) { return send(null); }
    return this.fetchStoredWorkbook().then(send, function() { return send(null); });
  },

  savable() {
    return this.get('canEdit') && !workbook_schema.isEmpty(this.get('workbook'));
  },

  persistWorkbook() {
    if (this.isDestroyed || this.isDestroying) { return; }
    if (!this.savable()) { return; }
    var _this = this;
    this.set('saveState', 'saving');
    this.sendWorkbook().then(function(res) {
      if (_this.isDestroyed || _this.isDestroying) { return; }
      if (res && res.local_only) { _this.set('saveState', 'local'); }
      else { _this.set('saveState', res && res.online ? 'queued' : 'offline'); }
    }, function() {
      if (_this.isDestroyed || _this.isDestroying) { return; }
      _this.set('saveState', 'error');
    });
  },

  // Navigating away inside the debounce window must not silently discard the
  // last thing typed — losing a paragraph of a funding report is not an
  // acceptable failure mode. save_workbook writes to the stash synchronously,
  // so a flush here still lands even though the component is going away.
  willDestroyElement() {
    this._super(...arguments);
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
      if (this.savable()) { this.sendWorkbook(true); }
    }
  },

  actions: {
    toggle: function() {
      this.toggleProperty('expanded');
    },
    toggleSection: function(id) {
      this.set('openSection', this.get('openSection') === id ? null : id);
    },
    addRow: function(sectionId) {
      var section = (this.get('sections') || []).find(function(s) { return s.id === sectionId; });
      if (!section) { return; }
      var rows = this.get('activeValues')[sectionId].rows;
      rows.push(workbook_schema.blankRow(section));
      this.markSectionDirty(sectionId);
      // Structural change — the row list itself is different — so this one DOES
      // have to rebuild the section. Nobody is mid-keystroke when they click it.
      this.notifyPropertyChange('workbook');
    },
    removeRow: function(sectionId, index) {
      var section = (this.get('sections') || []).find(function(s) { return s.id === sectionId; });
      if (!section) { return; }
      var value = this.get('activeValues')[sectionId];
      value.rows.splice(index, 1);
      // Never leave a rows section with no row — there would be nothing to type
      // into and no way back except re-opening the section.
      if (!value.rows.length) { value.rows.push(workbook_schema.blankRow(section)); }
      this.markSectionDirty(sectionId);
      this.notifyPropertyChange('workbook');
      this.scheduleSave();
    },
    save: function() {
      this.persistWorkbook();
    }
  }
});
