// CSV building with protection against spreadsheet formula injection (OWASP "CSV injection").
const FORMULA_START = /^[=+\-@\t\r]/;

/** Quotes one CSV cell. Text that could run as a formula gets a leading single quote; numbers are left alone. */
export function csvCell(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  let text = String(value ?? '');
  if (FORMULA_START.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export function toCsv(rows) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}
