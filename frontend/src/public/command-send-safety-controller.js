import { normalizeSessionInputSafetyProfile } from "./input-safety-profile.js";

const NATURAL_LANGUAGE_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "can",
  "could",
  "find",
  "fix",
  "for",
  "how",
  "i",
  "in",
  "inspect",
  "is",
  "it",
  "look",
  "need",
  "of",
  "please",
  "should",
  "that",
  "the",
  "this",
  "to",
  "update",
  "what",
  "why",
  "write",
  "you"
]);

const NON_COMMAND_NATURAL_LANGUAGE_HEADS = new Set([
  "please",
  "can",
  "could",
  "would",
  "should",
  "how",
  "what",
  "why",
  "when",
  "where",
  "who",
  "inspect",
  "fix",
  "review",
  "explain",
  "summarize",
  "summarise",
  "analyze",
  "analyse",
  "look",
  "update",
  "write",
  "tell"
]);

const COMMON_SHELL_COMMAND_HEADS = new Set([
  "awk",
  "bash",
  "brew",
  "bun",
  "cargo",
  "cat",
  "cd",
  "chmod",
  "chown",
  "cp",
  "curl",
  "cut",
  "dd",
  "docker",
  "echo",
  "env",
  "export",
  "find",
  "fish",
  "git",
  "go",
  "grep",
  "head",
  "jq",
  "kill",
  "kubectl",
  "less",
  "ls",
  "make",
  "mkdir",
  "more",
  "mv",
  "node",
  "npm",
  "perl",
  "pnpm",
  "printf",
  "ps",
  "pwd",
  "pytest",
  "python",
  "read",
  "rm",
  "rsync",
  "scp",
  "sed",
  "sh",
  "sleep",
  "sort",
  "source",
  "ssh",
  "sudo",
  "tail",
  "tar",
  "tee",
  "test",
  "touch",
  "tr",
  "uname",
  "uniq",
  "unset",
  "wc",
  "wget",
  "xargs",
  "yarn",
  "zsh"
]);

const DANGEROUS_COMMAND_MATCHERS = [
  {
    code: "dangerous_shell_command",
    label: "Command looks destructive for a shell session.",
    pattern: /(^|\s)rm\s+-rf(\s|$)/i
  },
  {
    code: "dangerous_shell_command",
    label: "Command resets git state destructively.",
    pattern: /git\s+reset\s+--hard/i
  },
  {
    code: "dangerous_shell_command",
    label: "Command cleans untracked files destructively.",
    pattern: /git\s+clean\s+-f/i
  },
  {
    code: "dangerous_shell_command",
    label: "Command pipes remote content into a shell.",
    pattern: /(curl|wget)[^\n|]*\|\s*(bash|sh)\b/i
  },
  {
    code: "dangerous_shell_command",
    label: "Command writes raw disk data.",
    pattern: /\bdd\s+if=/i
  },
  {
    code: "dangerous_shell_command",
    label: "Command formats a filesystem device.",
    pattern: /\bmkfs(\.[a-z0-9_+-]+)?\b/i
  },
  {
    code: "dangerous_shell_command",
    label: "Command shuts down or reboots the machine.",
    pattern: /\b(shutdown|reboot|poweroff|halt)\b/i
  },
  {
    code: "dangerous_shell_command",
    label: "Command changes ownership recursively.",
    pattern: /\bchown\b[^\n]*\s-R\b|\bchown\s+-R\b/i
  }
];

function trimLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function hasShellSignal(text) {
  return /[|&;<>$`{}()[\]=]|\b(git|npm|pnpm|yarn|node|bash|sh|cd|ls|pwd|cat|echo|export|docker|kubectl|make|python|pytest|go|cargo)\b/i.test(
    text
  );
}

function extractWordTokens(text) {
  return String(text || "")
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/^[^a-z0-9._/+:-]+|[^a-z0-9._/+:-]+$/g, ""))
    .filter(Boolean);
}

function isShellAssignmentToken(token) {
  return /^[A-Za-z_][A-Za-z0-9_]*=.*/.test(String(token || ""));
}

function looksLikePathCommand(token) {
  return /^(~?\/|\.{1,2}\/)/.test(String(token || ""));
}

function looksLikeShellCommandHead(token) {
  const normalized = String(token || "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (COMMON_SHELL_COMMAND_HEADS.has(normalized)) {
    return true;
  }
  if (looksLikePathCommand(normalized)) {
    return true;
  }
  if (normalized.includes("/") || normalized.includes("\\")) {
    return true;
  }
  return isShellAssignmentToken(token);
}

export function isLikelyNaturalLanguageInput(text) {
  const normalized = String(text || "").trim();
  if (!normalized) {
    return false;
  }
  if (hasShellSignal(normalized)) {
    return false;
  }
  const words = extractWordTokens(normalized);
  if (words.length === 0) {
    return false;
  }
  if (looksLikeShellCommandHead(words[0])) {
    return false;
  }
  if (/^(can|could|would|should)\s+you\b/i.test(normalized)) {
    return true;
  }
  if (/^(i|we)\s+(need|want)\b/i.test(normalized)) {
    return true;
  }
  if (NON_COMMAND_NATURAL_LANGUAGE_HEADS.has(words[0])) {
    return true;
  }
  const stopwordCount = words.filter((word) => NATURAL_LANGUAGE_STOPWORDS.has(word)).length;
  return words.length >= 5 && stopwordCount / words.length >= 0.5;
}

export function classifyDangerousShellCommand(text) {
  const normalized = String(text || "");
  for (const matcher of DANGEROUS_COMMAND_MATCHERS) {
    if (matcher.pattern.test(normalized)) {
      return {
        matched: true,
        code: matcher.code,
        label: matcher.label
      };
    }
  }
  return { matched: false, code: "", label: "" };
}

export function analyzeShellSyntax(text) {
  const source = String(text || "");
  const trimmed = source.trim();
  if (!trimmed) {
    return { valid: false, incomplete: false, code: "empty", label: "" };
  }

  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let escape = false;
  let commandSubDepth = 0;
  let trailingBackslash = false;
  let currentToken = "";
  const tokens = [];
  const blocks = [];

  function pushToken(token) {
    if (!token) {
      return;
    }
    tokens.push(token);
  }

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1] || "";

    if (inSingle) {
      if (char === "'") {
        inSingle = false;
      }
      trailingBackslash = false;
      continue;
    }

    if (escape) {
      escape = false;
      trailingBackslash = false;
      continue;
    }

    if (inDouble) {
      if (char === "\\") {
        escape = true;
        trailingBackslash = index === source.length - 1;
        continue;
      }
      if (char === '"') {
        inDouble = false;
        continue;
      }
      if (char === "$" && next === "(") {
        commandSubDepth += 1;
        index += 1;
      } else if (char === ")" && commandSubDepth > 0) {
        commandSubDepth -= 1;
      }
      trailingBackslash = false;
      continue;
    }

    if (inBacktick) {
      if (char === "`") {
        inBacktick = false;
      }
      trailingBackslash = false;
      continue;
    }

    if (char === "#" && !currentToken) {
      while (index < source.length && source[index] !== "\n") {
        index += 1;
      }
      trailingBackslash = false;
      continue;
    }

    if (char === "'") {
      pushToken(currentToken);
      currentToken = "";
      inSingle = true;
      trailingBackslash = false;
      continue;
    }
    if (char === '"') {
      pushToken(currentToken);
      currentToken = "";
      inDouble = true;
      trailingBackslash = false;
      continue;
    }
    if (char === "`") {
      pushToken(currentToken);
      currentToken = "";
      inBacktick = true;
      trailingBackslash = false;
      continue;
    }
    if (char === "\\") {
      trailingBackslash = index === source.length - 1;
      escape = true;
      continue;
    }
    if (char === "$" && next === "(") {
      pushToken(currentToken);
      currentToken = "";
      commandSubDepth += 1;
      index += 1;
      trailingBackslash = false;
      continue;
    }
    if (char === ")" && commandSubDepth > 0) {
      pushToken(currentToken);
      currentToken = "";
      commandSubDepth -= 1;
      trailingBackslash = false;
      continue;
    }
    if (/\s/.test(char)) {
      pushToken(currentToken);
      currentToken = "";
      if (char === "\n") {
        tokens.push("\n");
      }
      trailingBackslash = false;
      continue;
    }
    if ((char === "&" && next === "&") || (char === "|" && next === "|")) {
      pushToken(currentToken);
      currentToken = "";
      tokens.push(`${char}${next}`);
      index += 1;
      trailingBackslash = false;
      continue;
    }
    if ("|;{}".includes(char)) {
      pushToken(currentToken);
      currentToken = "";
      tokens.push(char);
      trailingBackslash = false;
      continue;
    }
    currentToken += char;
    trailingBackslash = false;
  }
  pushToken(currentToken);

  if (inSingle || inDouble || inBacktick || commandSubDepth > 0 || trailingBackslash) {
    return {
      valid: false,
      incomplete: true,
      code: "incomplete_shell_construct",
      label: "Input looks like an incomplete shell construct."
    };
  }

  let atCommandStart = true;
  const setCommandStart = () => {
    atCommandStart = true;
  };
  const leaveCommandStart = () => {
    atCommandStart = false;
  };

  for (const token of tokens) {
    if (token === "\n" || token === ";" || token === "&&" || token === "||" || token === "|") {
      setCommandStart();
      continue;
    }
    const normalized = token.toLowerCase();
    if (atCommandStart && normalized === "if") {
      blocks.push({ type: "if", thenSeen: false });
      continue;
    }
    if (atCommandStart && normalized === "then") {
      const target = [...blocks].reverse().find((entry) => entry.type === "if" && entry.thenSeen === false);
      if (target) {
        target.thenSeen = true;
        continue;
      }
    }
    if (atCommandStart && normalized === "fi") {
      const targetIndex = [...blocks].map((entry) => entry.type).lastIndexOf("if");
      if (targetIndex >= 0) {
        blocks.splice(targetIndex, 1);
        continue;
      }
    }
    if (atCommandStart && ["for", "while", "until", "select"].includes(normalized)) {
      blocks.push({ type: "loop", doSeen: false });
      continue;
    }
    if (atCommandStart && normalized === "do") {
      const target = [...blocks].reverse().find((entry) => entry.type === "loop" && entry.doSeen === false);
      if (target) {
        target.doSeen = true;
        continue;
      }
    }
    if (atCommandStart && normalized === "done") {
      const targetIndex = [...blocks].map((entry) => entry.type).lastIndexOf("loop");
      if (targetIndex >= 0) {
        blocks.splice(targetIndex, 1);
        continue;
      }
    }
    if (atCommandStart && normalized === "case") {
      blocks.push({ type: "case" });
      continue;
    }
    if (atCommandStart && normalized === "esac") {
      const targetIndex = [...blocks].map((entry) => entry.type).lastIndexOf("case");
      if (targetIndex >= 0) {
        blocks.splice(targetIndex, 1);
        continue;
      }
    }
    if (atCommandStart && token === "{") {
      blocks.push({ type: "brace" });
      continue;
    }
    if (atCommandStart && token === "}") {
      const targetIndex = [...blocks].map((entry) => entry.type).lastIndexOf("brace");
      if (targetIndex >= 0) {
        blocks.splice(targetIndex, 1);
        continue;
      }
    }
    leaveCommandStart();
  }

  if (blocks.length > 0) {
    return {
      valid: false,
      incomplete: true,
      code: "incomplete_shell_construct",
      label: "Input looks like an incomplete shell construct."
    };
  }

  if (/(\|\||&&|\||;|\\)\s*$/.test(trimmed) || /\b(then|do|else|elif)\s*$/i.test(trimmed)) {
    return {
      valid: false,
      incomplete: true,
      code: "incomplete_shell_construct",
      label: "Input looks like an incomplete shell construct."
    };
  }

  return {
    valid: true,
    incomplete: false,
    code: "valid_shell_syntax",
    label: ""
  };
}

function buildRecentTargetReason(profile) {
  const seconds = Math.max(0, Math.round((profile.targetSwitchGraceMs || 0) / 1000));
  return {
    code: "recent_target_switch",
    label:
      seconds > 0
        ? `Target changed recently; confirm before sending to this session (${seconds}s grace window).`
        : "Target changed recently; confirm before sending to this session."
  };
}

function buildMultilineReason(profile, text) {
  const lines = trimLines(text);
  const lineCount = lines.length;
  const length = String(text || "").length;
  const oversized =
    length >= Number(profile.pasteLengthConfirmThreshold || 0) || lineCount >= Number(profile.pasteLineConfirmThreshold || 0);
  return {
    code: oversized ? "oversized_input" : "multiline_input",
    label: oversized
      ? "Input is a large paste or multiline block for this session profile."
      : "Input spans multiple lines for this session profile."
  };
}

export function evaluateSessionSendSafety({
  session,
  text,
  directRoute = false,
  recentTargetSwitchAt = 0,
  nowMs = Date.now()
} = {}) {
  const profile = normalizeSessionInputSafetyProfile(session?.inputSafetyProfile);
  const reasons = [];
  const normalizedText = String(text || "");
  const trimmedText = normalizedText.trim();
  const syntaxAnalysis = analyzeShellSyntax(normalizedText);

  if (profile.confirmOnRecentTargetSwitch && !directRoute) {
    const ageMs = Math.max(0, Number(nowMs) - Number(recentTargetSwitchAt || 0));
    if (ageMs <= Number(profile.targetSwitchGraceMs || 0)) {
      reasons.push(buildRecentTargetReason(profile));
    }
  }

  if (profile.requireValidShellSyntax && trimmedText && !syntaxAnalysis.valid) {
    reasons.push({
      code: syntaxAnalysis.code || "invalid_shell_syntax",
      label:
        syntaxAnalysis.label || "Input is not valid shell syntax for the selected session profile."
    });
  }

  if (profile.confirmOnIncompleteShellConstruct && syntaxAnalysis.incomplete) {
    reasons.push({
      code: "incomplete_shell_construct",
      label: "Input looks like an incomplete shell construct."
    });
  }

  if (profile.confirmOnNaturalLanguageInput && isLikelyNaturalLanguageInput(trimmedText)) {
    reasons.push({
      code: "natural_language_input",
      label: "Input looks like natural-language text, not a shell command."
    });
  }

  if (profile.confirmOnDangerousShellCommand) {
    const dangerous = classifyDangerousShellCommand(trimmedText);
    if (dangerous.matched) {
      reasons.push({ code: dangerous.code, label: dangerous.label });
    }
  }

  const lines = trimLines(normalizedText);
  if (
    profile.confirmOnMultilineInput &&
    (lines.length > 1 ||
      normalizedText.length >= Number(profile.pasteLengthConfirmThreshold || 0) ||
      lines.length >= Number(profile.pasteLineConfirmThreshold || 0))
  ) {
    reasons.push(buildMultilineReason(profile, normalizedText));
  }

  const deduped = [];
  const seen = new Set();
  for (const reason of reasons) {
    if (!reason?.code || seen.has(reason.code)) {
      continue;
    }
    seen.add(reason.code);
    deduped.push(reason);
  }

  return {
    sessionId: session?.id || "",
    profile,
    syntaxAnalysis,
    reasons: deduped,
    requiresConfirmation: deduped.length > 0
  };
}

export function evaluateSendSafety({
  sessions = [],
  text = "",
  directRoute = false,
  recentTargetSwitchAt = 0,
  nowMs = Date.now(),
  formatSessionToken = (sessionId) => String(sessionId || ""),
  formatSessionDisplayName = (session) => String(session?.name || session?.id || "")
} = {}) {
  const targetEvaluations = sessions.map((session) => {
    const evaluation = evaluateSessionSendSafety({
      session,
      text,
      directRoute,
      recentTargetSwitchAt,
      nowMs
    });
    return {
      ...evaluation,
      targetLabel: `[${formatSessionToken(session.id)}] ${formatSessionDisplayName(session)}`
    };
  });

  const flaggedTargets = targetEvaluations.filter((entry) => entry.requiresConfirmation);
  const reasonMap = new Map();
  for (const entry of flaggedTargets) {
    for (const reason of entry.reasons) {
      if (!reasonMap.has(reason.code)) {
        reasonMap.set(reason.code, {
          code: reason.code,
          label: reason.label,
          targets: []
        });
      }
      reasonMap.get(reason.code).targets.push(entry.targetLabel);
    }
  }

  return {
    requiresConfirmation: flaggedTargets.length > 0,
    targetEvaluations,
    flaggedTargets,
    reasons: [...reasonMap.values()],
    summary:
      flaggedTargets.length === 0
        ? ""
        : flaggedTargets.length === 1
          ? `Confirmation required before sending to ${flaggedTargets[0].targetLabel}.`
          : `Confirmation required before sending to ${flaggedTargets.length} sessions.`
  };
}
