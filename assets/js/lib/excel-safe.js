/**
 * excel-safe.js — Prevent Excel/CSV/TSV formula injection
 *
 * When a cell value starts with =, +, -, or @, Excel/Sheets interprets it
 * as a formula. Prefixing with a single quote (') disarms it.
 *
 * Usage:
 *   excelSafe(value)                    → returns the safe string
 *   excelSafeCsvCell(value)             → for CSV cells (with quoting)
 *   excelSafeTsvCell(value)             → for TSV cells
 */

/**
 * Neutralize formula injection for any spreadsheet cell value.
 * If the value starts with = + - @, prefix with '.
 */
window.excelSafe = function excelSafe(v) {
  var s = String(v ?? '');
  var trimmed = s.replace(/^[\s\x00-\x1F]+/, '');
  if (/^[=+\-@]/.test(trimmed)) return "'" + s;
  return s;
};

/**
 * CSV-safe cell: neutralizes formula injection AND applies CSV quoting.
 */
window.excelSafeCsvCell = function excelSafeCsvCell(v) {
  var s = excelSafe(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
};

/**
 * TSV-safe cell: neutralizes formula injection and strips tabs/newlines.
 */
window.excelSafeTsvCell = function excelSafeTsvCell(v) {
  return excelSafe(String(v ?? '').replace(/\t/g, ' ').replace(/\r?\n/g, ' '));
};
