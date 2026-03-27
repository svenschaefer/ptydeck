function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function tokenizeQuery(query) {
  return normalizeLower(query).split(/\s+/).filter(Boolean);
}

function isWordChar(char) {
  return /^[a-z0-9]$/i.test(String(char || ""));
}

function compareNumeric(left, right) {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function compareTokenScores(left, right) {
  if (!left && !right) {
    return 0;
  }
  if (!left) {
    return 1;
  }
  if (!right) {
    return -1;
  }
  return (
    compareNumeric(left.tier, right.tier) ||
    compareNumeric(left.fieldIndex, right.fieldIndex) ||
    compareNumeric(left.start, right.start) ||
    compareNumeric(left.gaps, right.gaps) ||
    compareNumeric(left.span, right.span) ||
    compareNumeric(left.lengthDelta, right.lengthDelta)
  );
}

function findWordPrefixStart(text, token) {
  if (!text || !token) {
    return -1;
  }
  for (let index = 0; index <= text.length - token.length; index += 1) {
    if (index > 0 && isWordChar(text[index - 1])) {
      continue;
    }
    if (text.slice(index, index + token.length) === token) {
      return index;
    }
  }
  return -1;
}

function findSubsequenceMetrics(text, token) {
  if (!text || !token || token.length < 2) {
    return null;
  }
  let tokenIndex = 0;
  let firstIndex = -1;
  let lastIndex = -1;
  for (let index = 0; index < text.length && tokenIndex < token.length; index += 1) {
    if (text[index] !== token[tokenIndex]) {
      continue;
    }
    if (firstIndex < 0) {
      firstIndex = index;
    }
    lastIndex = index;
    tokenIndex += 1;
  }
  if (tokenIndex !== token.length || firstIndex < 0 || lastIndex < 0) {
    return null;
  }
  const span = (lastIndex - firstIndex) + 1;
  return {
    start: firstIndex,
    span,
    gaps: span - token.length
  };
}

function scoreTextForToken(text, token, fieldIndex) {
  const normalizedText = normalizeLower(text);
  if (!normalizedText || !token) {
    return null;
  }
  if (normalizedText.startsWith(token)) {
    return {
      tier: 0,
      fieldIndex,
      start: 0,
      span: token.length,
      gaps: 0,
      lengthDelta: normalizedText.length - token.length
    };
  }
  const wordPrefixStart = findWordPrefixStart(normalizedText, token);
  if (wordPrefixStart >= 0) {
    return {
      tier: 1,
      fieldIndex,
      start: wordPrefixStart,
      span: token.length,
      gaps: 0,
      lengthDelta: normalizedText.length - token.length
    };
  }
  const substringStart = normalizedText.indexOf(token);
  if (substringStart >= 0) {
    return {
      tier: 2,
      fieldIndex,
      start: substringStart,
      span: token.length,
      gaps: 0,
      lengthDelta: normalizedText.length - token.length
    };
  }
  const subsequenceMetrics = findSubsequenceMetrics(normalizedText, token);
  if (subsequenceMetrics) {
    return {
      tier: 3,
      fieldIndex,
      start: subsequenceMetrics.start,
      span: subsequenceMetrics.span,
      gaps: subsequenceMetrics.gaps,
      lengthDelta: normalizedText.length - token.length
    };
  }
  return null;
}

function normalizeSearchTexts(value) {
  if (typeof value === "function") {
    return [];
  }
  if (!Array.isArray(value)) {
    const normalized = normalizeText(value);
    return normalized ? [normalized] : [];
  }
  const normalized = [];
  const seen = new Set();
  for (const entry of value) {
    const token = normalizeText(entry);
    if (!token) {
      continue;
    }
    const lowered = token.toLowerCase();
    if (seen.has(lowered)) {
      continue;
    }
    seen.add(lowered);
    normalized.push(token);
  }
  return normalized;
}

function buildRankedEntry(item, stableIndex, queryTokens, options) {
  const getKey = typeof options.getKey === "function" ? options.getKey : (entry) => entry?.key;
  const getTexts = typeof options.getTexts === "function" ? options.getTexts : (entry) => [entry?.label, entry?.title, entry?.searchText];
  const getUsageScore = typeof options.getUsageScore === "function" ? options.getUsageScore : () => 0;
  const key = normalizeText(getKey(item));
  const fields = normalizeSearchTexts(getTexts(item));
  if (fields.length === 0) {
    return null;
  }

  if (queryTokens.length === 0) {
    return {
      item,
      stableIndex,
      usageScore: Number(getUsageScore(key)) || 0,
      worstTier: 99,
      sumTier: 0,
      sumFieldIndex: 0,
      sumStart: 0,
      sumGaps: 0,
      sumSpan: 0,
      key
    };
  }

  const tokenScores = [];
  for (const token of queryTokens) {
    let bestScore = null;
    for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex += 1) {
      const candidateScore = scoreTextForToken(fields[fieldIndex], token, fieldIndex);
      if (compareTokenScores(candidateScore, bestScore) < 0) {
        bestScore = candidateScore;
      }
    }
    if (!bestScore) {
      return null;
    }
    tokenScores.push(bestScore);
  }

  return {
    item,
    stableIndex,
    usageScore: Number(getUsageScore(key)) || 0,
    worstTier: Math.max(...tokenScores.map((entry) => entry.tier)),
    sumTier: tokenScores.reduce((sum, entry) => sum + entry.tier, 0),
    sumFieldIndex: tokenScores.reduce((sum, entry) => sum + entry.fieldIndex, 0),
    sumStart: tokenScores.reduce((sum, entry) => sum + entry.start, 0),
    sumGaps: tokenScores.reduce((sum, entry) => sum + entry.gaps, 0),
    sumSpan: tokenScores.reduce((sum, entry) => sum + entry.span, 0),
    key
  };
}

function compareRankedEntries(left, right) {
  return (
    compareNumeric(left.worstTier, right.worstTier) ||
    compareNumeric(left.sumTier, right.sumTier) ||
    compareNumeric(left.sumFieldIndex, right.sumFieldIndex) ||
    compareNumeric(left.sumStart, right.sumStart) ||
    compareNumeric(left.sumGaps, right.sumGaps) ||
    compareNumeric(left.sumSpan, right.sumSpan) ||
    compareNumeric(right.usageScore, left.usageScore) ||
    compareNumeric(left.stableIndex, right.stableIndex)
  );
}

export function rankDiscoveryItems(items, query = "", options = {}) {
  const normalizedItems = Array.isArray(items) ? items.slice() : [];
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : normalizedItems.length || 0;
  const queryTokens = tokenizeQuery(query);
  if (queryTokens.length === 0 && options.personalizeEmptyQuery !== true) {
    return normalizedItems.slice(0, limit || normalizedItems.length);
  }

  const rankedEntries = normalizedItems
    .map((item, stableIndex) => buildRankedEntry(item, stableIndex, queryTokens, options))
    .filter(Boolean)
    .sort(compareRankedEntries);

  return rankedEntries.slice(0, limit || rankedEntries.length).map((entry) => entry.item);
}

function normalizeUsageEntries(rawEntries, limit) {
  const normalized = [];
  const seen = new Set();
  for (const entry of Array.isArray(rawEntries) ? rawEntries : []) {
    const key = normalizeText(entry);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(key);
    if (normalized.length >= limit) {
      break;
    }
  }
  return normalized;
}

function readUsageEntries(storageRef, storageKey, limit) {
  if (!storageRef || typeof storageRef.getItem !== "function") {
    return [];
  }
  try {
    const raw = storageRef.getItem(storageKey);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return normalizeUsageEntries(parsed?.entries, limit);
  } catch {
    return [];
  }
}

function writeUsageEntries(storageRef, storageKey, entries) {
  if (!storageRef || typeof storageRef.setItem !== "function") {
    return;
  }
  try {
    storageRef.setItem(storageKey, JSON.stringify({ entries }));
  } catch {
    // Ignore storage write failures; keep the in-memory ranking path alive.
  }
}

export function createCommandDiscoveryUsageStore(options = {}) {
  const storageRef = options.storageRef || null;
  const storageKey = normalizeText(options.storageKey) || "ptydeck.command-discovery-usage.v1";
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 200;
  let entries = readUsageEntries(storageRef, storageKey, limit);

  function persist() {
    writeUsageEntries(storageRef, storageKey, entries);
  }

  function getUsageScore(key) {
    const normalizedKey = normalizeText(key);
    if (!normalizedKey) {
      return 0;
    }
    const index = entries.indexOf(normalizedKey);
    return index < 0 ? 0 : entries.length - index;
  }

  function record(key) {
    const normalizedKey = normalizeText(key);
    if (!normalizedKey) {
      return false;
    }
    entries = [normalizedKey, ...entries.filter((entry) => entry !== normalizedKey)].slice(0, limit);
    persist();
    return true;
  }

  function clear() {
    entries = [];
    if (storageRef && typeof storageRef.removeItem === "function") {
      try {
        storageRef.removeItem(storageKey);
      } catch {
        persist();
      }
      return;
    }
    persist();
  }

  function snapshot() {
    return entries.slice();
  }

  return {
    getUsageScore,
    record,
    clear,
    snapshot
  };
}
