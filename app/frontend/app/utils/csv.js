/**
 * RFC 4180 CSV cells plus spreadsheet formula neutralization.
 *
 * Org user-report downloads (controllers/organization/reports.js download_list)
 * used to `columns.join(',')`. A cell starting with = + - @, tab, CR, LF, or a
 * full-width = + - @ (the OWASP CSV Injection list) can be read as a formula
 * by a spreadsheet; a comma or quote in a name shifts columns.
 * See GitHub #383 / KAN-124.
 */

var FORMULA_STARTERS = ['=', '+', '-', '@', '\t', '\r', '\n', '＝', '＋', '－', '＠'];

function needsFormulaGuard(text) {
  return FORMULA_STARTERS.indexOf(text.charAt(0)) !== -1;
}

export function csvCell(value) {
  var text = value == null ? '' : String(value);
  if(needsFormulaGuard(text)) {
    text = '\'' + text;
  }
  return '"' + text.replace(/"/g, '""') + '"';
}

export function csvRow(columns) {
  return columns.map(csvCell).join(',');
}
