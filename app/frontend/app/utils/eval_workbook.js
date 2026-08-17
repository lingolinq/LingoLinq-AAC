/*
 * eval_workbook — the STRUCTURE of the report sections an eval cannot measure
 * but a submission still requires: non-SGD rule-outs, less-costly trials, daily
 * needs, attestations (medical) / SETT, PLAAFP, backup plan (school).
 *
 * Sourced from docs/AAC_EVALUATION_STANDARDS.md §3 (section spine), §5 (trial
 * documentation — "the section most often thin, most often denied") and §11
 * (non-SGD rule-outs). The two repeating sections are repeating on purpose:
 * §5 requires PER-ALTERNATIVE trial length, training given and reason ruled
 * out, and daily needs are required per environment AND partner. A single free
 *-text box is exactly the shape that gets denied.
 *
 * This module holds structure ONLY — ids, field types, column keys. Labels are
 * built in the component with literal i18n.t() calls, because i18n_generator.rb
 * is a static parser and cannot see strings that live in a data table
 * (docs/task-management/LEARNINGS.md, "i18n_generator.rb is a static parser").
 *
 * Pure data + pure functions. No Ember, no DOM, no i18n.
 */

// Field types:
//   'textarea' — one long free-text answer            → value: { notes: '' }
//   'fields'   — a set of short labelled inputs       → value: { <field>: '' }
//   'rows'     — a repeating table of short inputs    → value: { rows: [ {<col>: ''} ] }
/*
 * `lcd` cites the clause of Medicare LCD L33739 a section exists to satisfy, so
 * coverage is checkable rather than asserted. Verbatim criteria are quoted in
 * docs/AAC_EVALUATION_STANDARDS.md §4a (retrieved from CMS 2026-08-17).
 *   'c1.<n>' — criterion 1, nth required element of the written evaluation
 *   'c2'..'c7' — the standalone criteria
 * `prefill: true` means derive_prefill() can draft it from the eval itself.
 * `conditional: true` means it is required only when it applies (upgrades).
 *
 * NOT modelled here, deliberately: criteria 6 and 7 are not data entry. They are
 * statutory SENTENCES the report must PRINT above a signature — see
 * LCD_STATEMENTS below. Collecting them as free text would let an SLP paraphrase
 * a clause a reviewer checks for literally.
 */
export const WORKBOOK_SECTIONS = {
  medical: [
    { id: 'communication_status', type: 'fields', lcd: 'c1.1',
      fields: ['impairment_type', 'severity', 'language_skills', 'cognitive_ability', 'anticipated_course'] },
    { id: 'medical_condition', type: 'fields', lcd: 'c2',
      fields: ['diagnosis', 'onset', 'speech_diagnosis', 'speech_onset', 'treating_practitioner', 'payer_id'] },
    { id: 'natural_modes', type: 'textarea', lcd: 'c1.2' },
    { id: 'non_sgd_ruled_out', type: 'textarea', lcd: 'c4' },
    { id: 'least_costly', type: 'rows', columns: ['option', 'trial_length', 'training', 'reason'] },
    { id: 'daily_needs_by_environment', type: 'rows', columns: ['environment', 'partner', 'needs'] },
    { id: 'functional_goals', type: 'textarea', lcd: 'c1.3' },
    { id: 'selection_rationale', type: 'textarea', lcd: 'c1.4', prefill: true },
    { id: 'device_ability', type: 'textarea', lcd: 'c1.6', prefill: true },
    { id: 'benefit_statement', type: 'textarea', lcd: 'c5' },
    { id: 'implementation_plan', type: 'textarea', lcd: 'c1.5' },
    { id: 'upgrade_justification', type: 'textarea', lcd: 'c1.7', conditional: true },
    { id: 'product_line', type: 'fields', fields: ['manufacturer', 'product_name', 'model_number', 'hcpcs', 'accessories'] },
    { id: 'attestations', type: 'fields', lcd: 'c6,c7',
      fields: ['slp_name', 'license_number', 'asha_ccc', 'npi', 'physician', 'forwarded_date'] }
  ],
  school: [
    { id: 'sett', type: 'fields', fields: ['student', 'environment', 'task'] },
    { id: 'customary_environments', type: 'textarea' },
    { id: 'plaafp', type: 'textarea' },
    { id: 'standards_aligned_goals', type: 'textarea' },
    { id: 'backup_plan', type: 'textarea' },
    { id: 'ownership_transition', type: 'textarea' }
  ]
};

/*
 * Criteria 6 and 7 verbatim (docs/AAC_EVALUATION_STANDARDS.md §4a). The report
 * PRINTS these above a signature line; the SLP affirms by signing and dating.
 *
 * Kept as constants rather than translated strings on purpose: these are the
 * literal words of a US federal coverage determination, and a reviewer checks
 * for them. Translating or rewording them would defeat the point. The
 * surrounding UI chrome is localised; the clause is not.
 */
export const LCD_STATEMENTS = {
  c6: "A copy of the SLP's written evaluation and recommendation have been forwarded to the beneficiary's treating practitioner prior to ordering the device.",
  c7: "The SLP performing the beneficiary evaluation may not be an employee of or have a financial relationship with the supplier of the SGD."
};

/*
 * Draft the sections the evaluation can actually evidence, so the SLP edits
 * rather than composes.
 *
 * Deliberately FACTUAL, never concluding. It reports what was measured — grid
 * mastered, accuracy, access method, response time — and stops there. It does
 * not assert that the person "requires" a device or "will benefit", because the
 * eval does not measure either, and our own research (§6) is explicit that
 * feature matching is not empirically validated. Those stay SLP-authored.
 *
 * Returns { <sectionId>: { notes: <draft> } } for prefillable sections only,
 * omitting any the analysis cannot support. Pure: no Ember, no i18n, no DOM.
 */
export function derivePrefill(analysis, recommendation) {
  const a = analysis || {};
  const out = {};
  const num = function(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; };

  const rows = num(a.grid_height), cols = num(a.grid_width);
  const acc = num(a.avg_accuracy), hits = num(a.hits);
  const rt = num(a.avg_response_time);
  const w = num(a.button_width), h = num(a.button_height);
  const method = a.access_method || null;

  // c1.6 — demonstrated ability to use THE SELECTED device.
  const ability = [];
  if (rows && cols) {
    ability.push('Mastered a ' + rows + '×' + cols + ' grid (' + (rows * cols) + ' buttons) during direct assessment.');
  }
  if (acc !== null && hits) {
    ability.push('Accuracy ' + acc + '% across ' + hits + ' recorded selections.');
  }
  if (method) { ability.push('Access method used: ' + method + '.'); }
  if (rt !== null) { ability.push('Average response time ' + rt + 's.'); }
  if (w && h) { ability.push('Button size at the mastered grid: ' + w + '×' + h + ' in.'); }
  if (ability.length) {
    out.device_ability = { notes: ability.join(' ') + '\n\n[Auto-drafted from this evaluation — review, and add any observation the trial data does not capture.]' };
  }

  // c1.4 — rationale for selecting this device and accessories.
  const rat = [];
  const set = recommendation && (recommendation.page_set || recommendation.board_name);
  if (set) { rat.push('Recommended page set: ' + set + '.'); }
  if (rows && cols) {
    rat.push('Grid size follows the largest grid mastered in direct testing (' + rows + '×' + cols + '), not an extrapolation from smaller probes.');
  }
  if (w && h) { rat.push('Target size of ' + w + '×' + h + ' in was measured at that grid.'); }
  if (method) { rat.push('Access method reflects the method used throughout the assessment (' + method + ').'); }
  if (rat.length) {
    out.selection_rationale = { notes: rat.join(' ') + '\n\n[Auto-drafted. Add per-accessory justification — each accessory needs its own reason, not one blanket paragraph.]' };
  }

  return out;
}

/* Which LCD clauses a mode's schema can satisfy — lets a caller prove coverage
 * instead of trusting it. Returns { covered: [...], sections: {clause: id} }. */
export function lcdCoverage(mode) {
  const covered = [], map = {};
  sectionsFor(mode).forEach(function(s) {
    (s.lcd ? String(s.lcd).split(',') : []).forEach(function(c) {
      const key = c.trim();
      if (key) { covered.push(key); map[key] = s.id; }
    });
  });
  return { covered: covered, sections: map };
}

// Rows sections start with one blank row so the table is usable without an
// "add" click first.
const INITIAL_ROWS = 1;

export function sectionsFor(mode) {
  return WORKBOOK_SECTIONS[mode === 'school' ? 'school' : 'medical'];
}

export function blankRow(section) {
  const row = {};
  (section.columns || []).forEach(function(col) { row[col] = ''; });
  return row;
}

function blankSectionValue(section) {
  if (section.type === 'rows') {
    const rows = [];
    for (let i = 0; i < INITIAL_ROWS; i++) { rows.push(blankRow(section)); }
    return { rows: rows };
  }
  if (section.type === 'fields') {
    const value = {};
    (section.fields || []).forEach(function(f) { value[f] = ''; });
    return value;
  }
  return { notes: '' };
}

// A workbook holds BOTH modes side by side, keyed by mode, so switching the
// report between Medical and School never discards what was already typed —
// an eval is often written up for funding and for the IEP team from the same
// session.
export function blankWorkbook() {
  const wb = {};
  Object.keys(WORKBOOK_SECTIONS).forEach(function(mode) {
    wb[mode] = {};
    WORKBOOK_SECTIONS[mode].forEach(function(section) {
      wb[mode][section.id] = blankSectionValue(section);
    });
  });
  return wb;
}

// Merge a stored workbook over a blank one, so a workbook saved before a
// section (or column) existed still opens, and an unknown stored key can never
// crash the form. Stored values win; missing ones fall back to blank.
export function hydrate(stored) {
  const base = blankWorkbook();
  if (!stored || typeof stored !== 'object') { return base; }
  Object.keys(WORKBOOK_SECTIONS).forEach(function(mode) {
    const storedMode = stored[mode];
    if (!storedMode || typeof storedMode !== 'object') { return; }
    WORKBOOK_SECTIONS[mode].forEach(function(section) {
      const value = storedMode[section.id];
      if (!value || typeof value !== 'object') { return; }
      if (section.type === 'rows') {
        const rows = Array.isArray(value.rows) ? value.rows : [];
        base[mode][section.id].rows = rows.length ? rows.map(function(row) {
          const merged = blankRow(section);
          (section.columns || []).forEach(function(col) {
            if (typeof row[col] === 'string') { merged[col] = row[col]; }
          });
          return merged;
        }) : base[mode][section.id].rows;
      } else {
        Object.keys(base[mode][section.id]).forEach(function(key) {
          if (typeof value[key] === 'string') { base[mode][section.id][key] = value[key]; }
        });
      }
    });
  });
  return base;
}

// "Started" = any field in the section has content. Used for the per-section
// badge and the "n of m sections started" progress line. Deliberately NOT
// called "complete": whether a section says enough is a clinical judgement, and
// a green tick on a one-word answer would be a lie the SLP relies on.
export function sectionStarted(section, value) {
  if (!value) { return false; }
  if (section.type === 'rows') {
    return (value.rows || []).some(function(row) {
      return Object.keys(row).some(function(col) { return String(row[col] || '').trim().length > 0; });
    });
  }
  return Object.keys(value).some(function(key) { return String(value[key] || '').trim().length > 0; });
}

export function startedCount(mode, workbook) {
  const sections = sectionsFor(mode);
  const modeValues = (workbook || {})[mode === 'school' ? 'school' : 'medical'] || {};
  return sections.filter(function(section) {
    return sectionStarted(section, modeValues[section.id]);
  }).length;
}

// True when the workbook holds nothing at all, in either mode — used to skip
// saving an untouched workbook onto the eval.
export function isEmpty(workbook) {
  if (!workbook) { return true; }
  return !Object.keys(WORKBOOK_SECTIONS).some(function(mode) {
    return startedCount(mode, workbook) > 0;
  });
}

// Build the workbook to SEND, given the newest stored copy and this session's
// local one.
//
// A save replaces `data['eval']` wholesale (log_session.rb:1875), so sending the
// local copy alone discards any section another session wrote while this one was
// open. Start from `stored` and lay only the sections this session actually
// edited over the top.
//
// `dirtyKeys` are "<mode>:<sectionId>" strings. Keying on EDITED rather than
// on non-empty is what makes this safe both ways: a section the SLP deliberately
// cleared is dirty, so the empty value wins and the clear sticks; a section they
// never opened is not dirty, so the stored text survives. Two sessions editing
// DIFFERENT sections both keep their work; the same section is last-write-wins,
// which is the honest limit of a fire-and-forget save path.
export function mergeForSend(stored, local, dirtyKeys) {
  const merged = hydrate(stored);
  if (!local) { return merged; }
  (dirtyKeys || []).forEach(function(entry) {
    const split = String(entry).indexOf(':');
    if (split === -1) { return; }
    const mode = entry.slice(0, split);
    const id = entry.slice(split + 1);
    if (!merged[mode] || !local[mode]) { return; }
    if (local[mode][id] === undefined) { return; }
    merged[mode][id] = local[mode][id];
  });
  return merged;
}

export default {
  WORKBOOK_SECTIONS: WORKBOOK_SECTIONS,
  LCD_STATEMENTS: LCD_STATEMENTS,
  derivePrefill: derivePrefill,
  lcdCoverage: lcdCoverage,
  sectionsFor: sectionsFor,
  blankRow: blankRow,
  blankWorkbook: blankWorkbook,
  hydrate: hydrate,
  mergeForSend: mergeForSend,
  sectionStarted: sectionStarted,
  startedCount: startedCount,
  isEmpty: isEmpty
};
