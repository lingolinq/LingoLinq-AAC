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
export const WORKBOOK_SECTIONS = {
  medical: [
    { id: 'non_sgd_ruled_out', type: 'textarea' },
    { id: 'least_costly', type: 'rows', columns: ['option', 'trial_length', 'training', 'reason'] },
    { id: 'daily_needs_by_environment', type: 'rows', columns: ['environment', 'partner', 'needs'] },
    { id: 'functional_goals', type: 'textarea' },
    { id: 'implementation_plan', type: 'textarea' },
    { id: 'product_line', type: 'fields', fields: ['manufacturer', 'product_name', 'model_number', 'hcpcs', 'accessories'] },
    { id: 'attestations', type: 'fields', fields: ['slp_name', 'license_number', 'asha_ccc', 'npi', 'physician'] }
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

export default {
  WORKBOOK_SECTIONS: WORKBOOK_SECTIONS,
  sectionsFor: sectionsFor,
  blankRow: blankRow,
  blankWorkbook: blankWorkbook,
  hydrate: hydrate,
  sectionStarted: sectionStarted,
  startedCount: startedCount,
  isEmpty: isEmpty
};
