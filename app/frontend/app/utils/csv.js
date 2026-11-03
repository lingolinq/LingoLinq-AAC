/**
 * RFC 4180 CSV cells plus spreadsheet formula neutralization.
 *
 * Org user-report downloads (controllers/organization/reports.js download_list)
 * used to `columns.join(',')`. A cell starting with = + - @, tab, or CR is a
 * live formula in Excel/Sheets; a comma or quote in a name shifts columns.
 * See GitHub #383 / KAN-124.
 */

function needsFormulaGuard(text) {
  var first = text.charAt(0);
  return first === '=' || first === '+' || first === '-' || first === '@' || first === '\t' || first === '\r';
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
