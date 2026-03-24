function getBufferLineText(buffer, row) {
  if (!buffer || typeof buffer.getLine !== "function") {
    return "";
  }
  const line = buffer.getLine(row);
  if (!line || typeof line.translateToString !== "function") {
    return "";
  }
  return String(line.translateToString(true) || "");
}

export function normalizeTerminalSearchQuery(value) {
  return String(value || "").trim();
}

export function collectTerminalSearchMatches(terminal, rawQuery, options = {}) {
  const query = normalizeTerminalSearchQuery(rawQuery);
  if (!query) {
    return [];
  }

  const buffer = terminal?.buffer?.active;
  const rows = Number.isInteger(terminal?.rows) ? terminal.rows : 0;
  const inferredLength = Number.isInteger(buffer?.length)
    ? buffer.length
    : Math.max(Number(buffer?.baseY || 0) + rows, 0);
  const caseSensitive = options.caseSensitive === true;
  const needle = caseSensitive ? query : query.toLowerCase();
  const matches = [];

  for (let row = 0; row < inferredLength; row += 1) {
    const text = getBufferLineText(buffer, row);
    if (!text) {
      continue;
    }
    const haystack = caseSensitive ? text : text.toLowerCase();
    let startIndex = 0;
    while (startIndex <= haystack.length - needle.length) {
      const matchIndex = haystack.indexOf(needle, startIndex);
      if (matchIndex < 0) {
        break;
      }
      matches.push({
        row,
        column: matchIndex,
        length: query.length,
        text
      });
      startIndex = matchIndex + Math.max(query.length, 1);
    }
  }

  return matches;
}

export function applyTerminalSearchMatch(terminal, match) {
  if (!terminal || !match) {
    return false;
  }
  const row = Number.isInteger(match.row) ? match.row : 0;
  const column = Number.isInteger(match.column) ? match.column : 0;
  const length = Number.isInteger(match.length) ? match.length : 0;
  const rows = Number.isInteger(terminal.rows) ? terminal.rows : 0;

  if (typeof terminal.scrollToLine === "function") {
    terminal.scrollToLine(Math.max(row - Math.floor(rows / 2), 0));
  }
  if (typeof terminal.clearSelection === "function") {
    terminal.clearSelection();
  }
  if (typeof terminal.select === "function") {
    terminal.select(column, row, length);
  }
  return true;
}

export function formatTerminalSearchStatus({
  query,
  matches = [],
  activeIndex = -1,
  wrapped = false,
  direction = "next",
  missingActiveSession = false
} = {}) {
  const normalizedQuery = normalizeTerminalSearchQuery(query);
  if (!normalizedQuery) {
    return "";
  }
  if (missingActiveSession) {
    return "Search needs an active terminal.";
  }
  if (!Array.isArray(matches) || matches.length === 0 || activeIndex < 0) {
    return "No matches in active terminal.";
  }
  const base = `Match ${activeIndex + 1}/${matches.length}`;
  if (!wrapped) {
    return base;
  }
  return direction === "previous" ? `Wrapped to previous match (${base}).` : `Wrapped to next match (${base}).`;
}
