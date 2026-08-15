import Component from '@ember/component';
import { computed, set as emberSet } from '@ember/object';
import { inject as service } from '@ember/service';
import i18n from '../utils/i18n';
import evaluation from '../utils/eval';
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
    this.fieldWriter = function(target, key) {
      return function(event) {
        var el = event && event.target;
        if (!el || !target || !key) { return; }
        self.writeField(target, key, el.value);
      };
    };
    this.set('workbook', workbook_schema.hydrate(this.get('analysis.report_workbook')));
    this.set('_hydratedFor', this.evalIdentity());
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

  startedCount: computed('workbook', 'mode', function() {
    return workbook_schema.startedCount(this.get('mode'), this.get('workbook'));
  }),

  sectionCount: computed('sections', function() {
    return (this.get('sections') || []).length;
  }),

  progressLabel: computed('startedCount', 'sectionCount', function() {
    return i18n.t('workbook_progress', "%{n} of %{t} sections started", {
      n: this.get('startedCount'), t: this.get('sectionCount')
    });
  }),

  // The schema decorated with its labels and current values — everything the
  // template needs, resolved in JS.
  //
  // Labels are looked up HERE rather than in the template on purpose: the label
  // map is keyed "sec.<id>" / "<id>.<field>", and Ember's `{{get}}` helper reads
  // a dot as a PATH separator, so `{{get this.labels "sec.least_costly"}}` asks
  // for labels.sec.least_costly and silently renders nothing. Plain JS lookup
  // treats the same string as one literal key.
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
        value: value,
        started: workbook_schema.sectionStarted(section, value)
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
  isAuthor: computed('log.author.id', 'appState.sessionUser.id', 'log.eval_in_memory', function() {
    if (this.get('log.eval_in_memory')) { return true; }
    var author = this.get('log.author.id');
    if (!author) { return false; }
    return String(author) === String(this.get('appState.sessionUser.id'));
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
      case 'offline': return i18n.t('workbook_saved_offline', "Saved on this device. It will sync when you reconnect.");
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

  writeField(target, key, value) {
    emberSet(target, key, value);
    // Plain-object writes don't invalidate computeds watching `workbook`, so the
    // badges and progress line have to be told.
    this.notifyPropertyChange('workbook');
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

  // The actual write. Kept free of component state so it can also run while the
  // component is tearing down.
  sendWorkbook() {
    return evaluation.save_workbook({
      assessment: this.get('assessment'),
      log_id: this.get('logId'),
      workbook: this.get('workbook'),
      // No record to attach to yet -> hold it locally. Sending would file a
      // duplicate evaluation rather than update this one.
      local_only: !this.get('hasSaveTarget')
    });
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
      if (this.savable()) { this.sendWorkbook(); }
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
      this.notifyPropertyChange('workbook');
      this.scheduleSave();
    },
    save: function() {
      this.persistWorkbook();
    }
  }
});
