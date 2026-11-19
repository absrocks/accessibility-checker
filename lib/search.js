const FIELDS = { html: 'html', selector: 'selector', url: 'url', title: 'page_title' };
const OPS = ['contains', 'not_contains', 'starts_with', 'ends_with', 'regex'];
const MAX_CLAUSES = 10;
const MAX_VALUE = 500;

export class SearchError extends Error {}

/**
 * Compile advanced-search clauses into a predicate over finding rows.
 * `raw` is a JSON string or array of { field, op, value }. All clauses must
 * match. Text comparisons ignore case.
 */
export function compileSearch(raw) {
  if (raw == null || raw === '') return () => true;
  let clauses = raw;
  if (typeof raw === 'string') {
    try {
      clauses = JSON.parse(raw);
    } catch {
      throw new SearchError('search must be valid JSON');
    }
  }
  if (!Array.isArray(clauses)) throw new SearchError('search must be a list of clauses');
  if (clauses.length > MAX_CLAUSES) throw new SearchError(`at most ${MAX_CLAUSES} search clauses`);

  const tests = clauses.map((c, i) => {
    const column = FIELDS[c?.field];
    if (!column) throw new SearchError(`clause ${i + 1}: unknown field`);
    if (!OPS.includes(c.op)) throw new SearchError(`clause ${i + 1}: unknown operation`);
    const value = String(c.value ?? '');
    if (!value) throw new SearchError(`clause ${i + 1}: search text is empty`);
    if (value.length > MAX_VALUE) throw new SearchError(`clause ${i + 1}: search text is too long`);

    if (c.op === 'regex') {
      let re;
      try {
        re = new RegExp(value, 'i');
      } catch (e) {
        throw new SearchError(`clause ${i + 1}: invalid regular expression (${e.message})`);
      }
      return (row) => re.test(row[column] || '');
    }
    const needle = value.toLowerCase();
    const get = (row) => String(row[column] || '').toLowerCase();
    if (c.op === 'contains') return (row) => get(row).includes(needle);
    if (c.op === 'not_contains') return (row) => !get(row).includes(needle);
    if (c.op === 'starts_with') return (row) => get(row).startsWith(needle);
    return (row) => get(row).endsWith(needle);
  });
  return (row) => tests.every((t) => t(row));
}
