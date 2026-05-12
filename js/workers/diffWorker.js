/* global diff_match_patch */

importScripts('https://unpkg.com/diff-match-patch@1.0.5/index.js');

function normalizeSql(sql) {
  if (!sql) return '';
  return sql
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.replace(/\s+$/, ''))
    .join('\n');
}

function normalize(text, options) {
  let result = normalizeSql(text || '');
  if (options.ignoreWs) result = result.replace(/\s+/g, ' ');
  if (options.ignoreCase) result = result.toLowerCase();
  return result;
}

function calculateStats(lineDiffs) {
  let linesAdded = 0;
  let linesRemoved = 0;
  let linesUnchanged = 0;

  for (const [op] of lineDiffs) {
    if (op === 1) linesAdded++;
    else if (op === -1) linesRemoved++;
    else if (op === 0) linesUnchanged++;
  }

  return {
    linesAdded,
    linesRemoved,
    linesUnchanged,
    totalLines: linesAdded + linesUnchanged,
    diffSize: JSON.stringify(lineDiffs).length
  };
}

function computeDiff(oldSQL, newSQL) {
  const dmp = new diff_match_patch();
  dmp.Diff_Timeout = 1.0;

  const { chars1, chars2, lineArray } = dmp.diff_linesToChars_(oldSQL, newSQL);
  const diffs = dmp.diff_main(chars1, chars2, false);
  dmp.diff_charsToLines_(diffs, lineArray);
  dmp.diff_cleanupSemantic(diffs);

  const lineDiffs = [];
  for (const [op, text] of diffs) {
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (i === lines.length - 1 && lines[i] === '') continue;
      lineDiffs.push([op, lines[i]]);
    }
  }

  return { lineDiffs, stats: calculateStats(lineDiffs) };
}

self.onmessage = (event) => {
  try {
    const { contentFrom, contentTo, options } = event.data;
    const normalizedFrom = normalize(contentFrom, options || {});
    const normalizedTo = normalize(contentTo, options || {});
    self.postMessage({
      ok: true,
      comparison: computeDiff(normalizedFrom, normalizedTo)
    });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error.message || String(error)
    });
  }
};
