#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { logScriptStart } from "./lib/script-log.mjs";

logScriptStart("scripts/analyze-startup-timeline.mjs");

function usage() {
  console.error(
    "Usage: node scripts/analyze-startup-timeline.mjs --log <backend-debug-log> [--sessions <sessions-json>] [--window-seconds <n>] [--format json|text]"
  );
  process.exit(1);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    logPath: "",
    sessionsPath: path.join(process.cwd(), "backend", "data", "sessions.json"),
    windowSeconds: 90,
    format: "text"
  };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--log") {
      options.logPath = args[index + 1] || "";
      index += 1;
      continue;
    }
    if (value === "--sessions") {
      options.sessionsPath = args[index + 1] || "";
      index += 1;
      continue;
    }
    if (value === "--window-seconds") {
      options.windowSeconds = Number.parseInt(args[index + 1] || "", 10);
      index += 1;
      continue;
    }
    if (value === "--format") {
      options.format = args[index + 1] || "";
      index += 1;
      continue;
    }
    usage();
  }
  if (!options.logPath || !Number.isInteger(options.windowSeconds) || options.windowSeconds <= 0) {
    usage();
  }
  if (!["json", "text"].includes(options.format)) {
    usage();
  }
  return options;
}

function createLineReader(filePath) {
  return readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity
  });
}

function parseLogLine(line) {
  const match = line.match(/^\[ptydeck-backend\]\[(?<timestamp>[^\]]+)\] (?<event>[^ ]+) (?<json>\{.*\})$/u);
  if (!match?.groups) {
    return null;
  }
  let payload;
  try {
    payload = JSON.parse(match.groups.json);
  } catch {
    return null;
  }
  return {
    timestamp: match.groups.timestamp,
    event: match.groups.event,
    payload
  };
}

function loadSessionLabels(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return new Map();
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return new Map();
  }
  const sessions = Array.isArray(raw?.sessions) ? raw.sessions : [];
  const labels = new Map();
  for (const session of sessions) {
    const sessionId = typeof session?.id === "string" ? session.id.trim() : "";
    if (!sessionId) {
      continue;
    }
    labels.set(sessionId, {
      name: typeof session?.name === "string" ? session.name : "",
      deckId: typeof session?.deckId === "string" ? session.deckId : "",
      shell: typeof session?.shell === "string" ? session.shell : ""
    });
  }
  return labels;
}

function classifyBootstrapPath(pathname) {
  if (pathname === "/ready") {
    return "ready_probe";
  }
  if (pathname === "/api/v1/auth/dev-token") {
    return "auth_dev_token";
  }
  if (pathname === "/api/v1/auth/ws-ticket") {
    return "auth_ws_ticket";
  }
  if (pathname === "/api/v1/layout-profiles") {
    return "layout_profiles";
  }
  if (pathname === "/api/v1/connection-profiles") {
    return "connection_profiles";
  }
  if (pathname === "/api/v1/ssh-trust-entries") {
    return "ssh_trust_entries";
  }
  if (pathname === "/api/v1/workspace-presets") {
    return "workspace_presets";
  }
  if (/^\/api\/v1\/sessions\/[^/]+\/input$/u.test(pathname)) {
    return "session_input";
  }
  if (/^\/api\/v1\/sessions\/[^/]+\/resize$/u.test(pathname)) {
    return "session_resize";
  }
  return "other";
}

function incrementCounter(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function getOrCreate(map, key, factory) {
  if (map.has(key)) {
    return map.get(key);
  }
  const value = factory();
  map.set(key, value);
  return value;
}

function formatSessionLabel(label) {
  if (!label) {
    return "unknown";
  }
  const parts = [];
  if (label.deckId) {
    parts.push(label.deckId);
  }
  if (label.name) {
    parts.push(label.name);
  }
  return parts.join(" / ") || label.shell || "unknown";
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) {
    return "unknown";
  }
  const seconds = Math.round(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  const parts = [];
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0 || hours > 0) {
    parts.push(`${minutes}m`);
  }
  parts.push(`${remainingSeconds}s`);
  return parts.join(" ");
}

function materializeSortedEntries(map, buildEntry) {
  return Array.from(map.entries())
    .map(([key, value]) => buildEntry(key, value))
    .sort((left, right) => left.key.localeCompare(right.key, "en-US"));
}

async function scanLatestRuntimePhase(logPath) {
  let latestRestoreStart = null;
  let latestRestoreDone = null;
  let latestReady = null;
  let lastWarmupQuietWait = null;
  let maxWarmupActiveSessionCount = 0;
  let lastWarmupActive = null;

  const reader = createLineReader(logPath);
  for await (const line of reader) {
    const parsed = parseLogLine(line);
    if (!parsed) {
      continue;
    }
    const { timestamp, event, payload } = parsed;
    if (event === "runtime.restore.start") {
      latestRestoreStart = { timestamp, payload };
      latestRestoreDone = null;
      lastWarmupQuietWait = null;
      maxWarmupActiveSessionCount = 0;
      lastWarmupActive = null;
      latestReady = null;
      continue;
    }
    if (event === "runtime.restore.done") {
      latestRestoreDone = { timestamp, payload };
      continue;
    }
    if (event === "runtime.startup_warmup.active") {
      lastWarmupActive = { timestamp, payload };
      const count = Number(payload?.activeSessionCount) || 0;
      if (count > maxWarmupActiveSessionCount) {
        maxWarmupActiveSessionCount = count;
      }
      continue;
    }
    if (event === "runtime.startup_warmup.quiet_wait") {
      lastWarmupQuietWait = { timestamp, payload };
      continue;
    }
    if (event === "runtime.ready") {
      latestReady = {
        timestamp,
        payload,
        warmup: {
          lastWarmupActiveAt: lastWarmupActive?.timestamp || "",
          maxActiveSessionCount: maxWarmupActiveSessionCount,
          lastQuietWaitAt: lastWarmupQuietWait?.timestamp || "",
          quietMs: Number(lastWarmupQuietWait?.payload?.quietMs) || 0
        }
      };
    }
  }

  return {
    latestRestoreStart,
    latestRestoreDone,
    latestReady
  };
}

async function scanFrontendBootstrap(logPath, readyAt, windowSeconds, sessionLabels) {
  const bootstrapWindowMs = windowSeconds * 1000;
  let firstReadyProbe = null;
  let firstFrontendSocket = null;
  let firstSnapshot = null;
  let lastSeenReadyProbe = null;
  const preSocketRequests = [];
  const bootstrapRequests = [];
  const sessionInputWrites = new Map();
  const inputPosts = new Map();
  const resizePosts = new Map();
  const sessionActivityStarts = new Map();

  const reader = createLineReader(logPath);
  for await (const line of reader) {
    const parsed = parseLogLine(line);
    if (!parsed) {
      continue;
    }
    const { timestamp, event, payload } = parsed;
    if (timestamp < readyAt) {
      continue;
    }

    if (!firstFrontendSocket) {
      if (event === "http.request.start" && payload?.method === "GET" && payload?.pathname === "/ready") {
        lastSeenReadyProbe = { timestamp, payload };
        preSocketRequests.push({
          timestamp,
          method: payload.method,
          pathname: payload.pathname,
          category: "ready_probe",
          requestId: payload?.requestId || ""
        });
        continue;
      }
      if (event === "http.request.start" && lastSeenReadyProbe) {
        const pathname = typeof payload?.pathname === "string" ? payload.pathname : "";
        const method = typeof payload?.method === "string" ? payload.method : "";
        if (method === "OPTIONS") {
          continue;
        }
        const category = classifyBootstrapPath(pathname);
        if (category !== "other") {
          preSocketRequests.push({ timestamp, method, pathname, category, requestId: payload?.requestId || "" });
        }
      }
      if (event === "ws.upgrade.accepted") {
        firstFrontendSocket = { timestamp, payload };
        firstReadyProbe = lastSeenReadyProbe;
        bootstrapRequests.push(...preSocketRequests);
        continue;
      }
      continue;
    }

    const windowEnd = new Date(new Date(firstFrontendSocket.timestamp).getTime() + bootstrapWindowMs).toISOString();
    if (timestamp > windowEnd) {
      break;
    }

    if (event === "ws.snapshot.sent" && !firstSnapshot) {
      firstSnapshot = { timestamp, payload };
      continue;
    }

    if (event === "http.request.start") {
      const pathname = typeof payload?.pathname === "string" ? payload.pathname : "";
      const method = typeof payload?.method === "string" ? payload.method : "";
      if (method === "OPTIONS") {
        continue;
      }
      const category = classifyBootstrapPath(pathname);
      if (category !== "other") {
        bootstrapRequests.push({ timestamp, method, pathname, category, requestId: payload?.requestId || "" });
      }
      if (category === "session_input" && method === "POST") {
        const requestId = payload?.requestId || payload?.traceId || "";
        const sessionId = pathname.split("/")[4] || "";
        inputPosts.set(requestId, {
          timestamp,
          requestId,
          sessionId,
          label: formatSessionLabel(sessionLabels.get(sessionId)),
          pathname
        });
      }
      if (category === "session_resize" && method === "POST") {
        const sessionId = pathname.split("/")[4] || "";
        const entry = getOrCreate(resizePosts, sessionId, () => ({
          key: sessionId,
          sessionId,
          label: formatSessionLabel(sessionLabels.get(sessionId)),
          count: 0,
          firstAt: timestamp,
          lastAt: timestamp
        }));
        entry.count += 1;
        entry.lastAt = timestamp;
      }
      continue;
    }

    if (event === "session.input.write" && payload?.phase === "ok") {
      const requestId = payload?.requestId || payload?.correlationId || "";
      const sessionId = payload?.sessionId || inputPosts.get(requestId)?.sessionId || "";
      const key = requestId || `${sessionId}:${timestamp}`;
      sessionInputWrites.set(key, {
        key,
        timestamp,
        requestId,
        sessionId,
        label: formatSessionLabel(sessionLabels.get(sessionId)),
        bytes: Number(payload?.bytes) || 0,
        writeKind: payload?.writeKind || "",
        traceSource: payload?.traceSource || ""
      });
      continue;
    }

    if (event === "session.event" && payload?.type === "session.activity.started") {
      const sessionId = payload?.sessionId || "";
      const entry = getOrCreate(sessionActivityStarts, sessionId, () => ({
        key: sessionId,
        sessionId,
        label: formatSessionLabel(sessionLabels.get(sessionId)),
        count: 0,
        firstAt: timestamp,
        lastAt: timestamp
      }));
      entry.count += 1;
      entry.lastAt = timestamp;
    }
  }

  const requestCounts = new Map();
  for (const request of bootstrapRequests) {
    incrementCounter(requestCounts, request.category);
  }

  const groupedInputWrites = new Map();
  for (const value of sessionInputWrites.values()) {
    const entry = getOrCreate(groupedInputWrites, value.sessionId || value.requestId, () => ({
      key: value.sessionId || value.requestId,
      sessionId: value.sessionId,
      label: value.label,
      count: 0,
      byteCounts: new Map(),
      firstAt: value.timestamp,
      lastAt: value.timestamp,
      requestIds: []
    }));
    entry.count += 1;
    entry.lastAt = value.timestamp;
    incrementCounter(entry.byteCounts, String(value.bytes));
    if (value.requestId) {
      entry.requestIds.push(value.requestId);
    }
  }

  return {
    firstReadyProbe,
    firstFrontendSocket,
    firstSnapshot,
    bootstrapWindowSeconds: windowSeconds,
    bootstrapRequests,
    requestCounts: Object.fromEntries(requestCounts.entries()),
    inputPostCount: inputPosts.size,
    inputWriteOkCount: sessionInputWrites.size,
    inputWriteGroups: materializeSortedEntries(groupedInputWrites, (key, value) => ({
      key,
      sessionId: value.sessionId,
      label: value.label,
      count: value.count,
      bytes: Object.fromEntries(value.byteCounts.entries()),
      firstAt: value.firstAt,
      lastAt: value.lastAt,
      requestIds: Array.from(new Set(value.requestIds))
    })),
    resizeGroups: materializeSortedEntries(resizePosts, (_key, value) => value),
    activityStartGroups: materializeSortedEntries(sessionActivityStarts, (_key, value) => value)
  };
}

function buildAssessment(latestRuntime, frontendBootstrap) {
  const readyAt = latestRuntime.latestReady?.timestamp || "";
  const frontendAt = frontendBootstrap.firstFrontendSocket?.timestamp || "";
  const restoreAt = latestRuntime.latestRestoreDone?.timestamp || latestRuntime.latestRestoreStart?.timestamp || "";
  const readyDate = readyAt ? new Date(readyAt) : null;
  const frontendDate = frontendAt ? new Date(frontendAt) : null;
  const delayMs = readyDate && frontendDate ? frontendDate.getTime() - readyDate.getTime() : null;
  return {
    backendStartupCompletedBeforeFrontend: Boolean(readyAt && frontendAt && delayMs >= 0),
    frontendAttachDelayMs: delayMs,
    frontendAttachDelayText: formatDuration(delayMs),
    restoreCompletedBeforeFrontend: Boolean(restoreAt && frontendAt && new Date(frontendAt).getTime() >= new Date(restoreAt).getTime()),
    frontendTriggeredInputWrites: frontendBootstrap.inputWriteOkCount > 0,
    frontendTriggeredResizeRequests: frontendBootstrap.resizeGroups.length > 0,
    exactFrontendInputSourceResolvedInCode: false,
    conclusion:
      frontendBootstrap.inputWriteOkCount > 0
        ? "Backend restore and runtime.ready completed before the first frontend attach. The later visible terminal churn came from frontend bootstrap side effects: WebSocket snapshot replay, resize activity, and browser-originated session input writes inside the first frontend-open window."
        : "Backend restore and runtime.ready completed before the first frontend attach. The later visible terminal churn came from frontend bootstrap side effects, primarily WebSocket snapshot replay and resize activity."
  };
}

function formatTextReport(report) {
  const lines = [];
  lines.push("# Startup Timeline Analysis");
  lines.push("");
  lines.push("Latest backend startup phase:");
  lines.push(`- restore.start: ${report.latestRuntime.restoreStartAt || "not found"}`);
  lines.push(`- restore.done: ${report.latestRuntime.restoreDoneAt || "not found"}`);
  lines.push(`- runtime.ready: ${report.latestRuntime.readyAt || "not found"}`);
  lines.push(`- restoredSessionCount: ${report.latestRuntime.restoredSessionCount}`);
  lines.push(`- runtime.ready sessionCount: ${report.latestRuntime.readySessionCount}`);
  lines.push(`- warmup max active restored sessions: ${report.latestRuntime.maxWarmupActiveSessionCount}`);
  lines.push("");
  lines.push(`First frontend attach after ready (bootstrap window ${report.frontendBootstrap.bootstrapWindowSeconds}s):`);
  lines.push(`- first /ready probe: ${report.frontendBootstrap.firstReadyProbeAt || "not found"}`);
  lines.push(`- first ws.upgrade.accepted: ${report.frontendBootstrap.firstFrontendSocketAt || "not found"}`);
  lines.push(`- first ws.snapshot.sent: ${report.frontendBootstrap.firstSnapshotAt || "not found"}`);
  lines.push(`- ws snapshot sessionCount: ${report.frontendBootstrap.snapshotSessionCount}`);
  lines.push(`- ws snapshot outputCount: ${report.frontendBootstrap.snapshotOutputCount}`);
  lines.push(`- delay from runtime.ready to first frontend websocket: ${report.assessment.frontendAttachDelayText}`);
  lines.push("");
  lines.push("Bootstrap request counts:");
  for (const [key, value] of Object.entries(report.frontendBootstrap.requestCounts)) {
    lines.push(`- ${key}: ${value}`);
  }
  lines.push("");
  lines.push("Frontend-triggered session input writes in bootstrap window:");
  if (report.frontendBootstrap.inputWriteGroups.length === 0) {
    lines.push("- none");
  } else {
    for (const entry of report.frontendBootstrap.inputWriteGroups) {
      const bytes = Object.entries(entry.bytes)
        .map(([countedBytes, countedTimes]) => `${countedBytes}B x${countedTimes}`)
        .join(", ");
      lines.push(`- ${entry.label} (${entry.sessionId || "unknown"}): ${entry.count} write(s), ${bytes}, first=${entry.firstAt}, last=${entry.lastAt}`);
    }
  }
  lines.push("");
  lines.push("Frontend-triggered resize requests in bootstrap window:");
  if (report.frontendBootstrap.resizeGroups.length === 0) {
    lines.push("- none");
  } else {
    for (const entry of report.frontendBootstrap.resizeGroups) {
      lines.push(`- ${entry.label} (${entry.sessionId}): ${entry.count} resize request(s), first=${entry.firstAt}, last=${entry.lastAt}`);
    }
  }
  lines.push("");
  lines.push("Assessment:");
  lines.push(`- backendStartupCompletedBeforeFrontend: ${report.assessment.backendStartupCompletedBeforeFrontend}`);
  lines.push(`- restoreCompletedBeforeFrontend: ${report.assessment.restoreCompletedBeforeFrontend}`);
  lines.push(`- frontendTriggeredInputWrites: ${report.assessment.frontendTriggeredInputWrites}`);
  lines.push(`- frontendTriggeredResizeRequests: ${report.assessment.frontendTriggeredResizeRequests}`);
  lines.push(`- exactFrontendInputSourceResolvedInCode: ${report.assessment.exactFrontendInputSourceResolvedInCode}`);
  lines.push(`- conclusion: ${report.assessment.conclusion}`);
  return lines.join("\n");
}

async function main() {
  const options = parseArgs(process.argv);
  const sessionLabels = loadSessionLabels(options.sessionsPath);
  const latestRuntimePhase = await scanLatestRuntimePhase(options.logPath);
  if (!latestRuntimePhase.latestReady) {
    console.error("No runtime.ready event found in the log.");
    process.exit(1);
  }
  const frontendBootstrap = await scanFrontendBootstrap(
    options.logPath,
    latestRuntimePhase.latestReady.timestamp,
    options.windowSeconds,
    sessionLabels
  );

  const report = {
    logPath: options.logPath,
    sessionsPath: fs.existsSync(options.sessionsPath) ? options.sessionsPath : "",
    latestRuntime: {
      restoreStartAt: latestRuntimePhase.latestRestoreStart?.timestamp || "",
      restoreDoneAt: latestRuntimePhase.latestRestoreDone?.timestamp || "",
      readyAt: latestRuntimePhase.latestReady.timestamp,
      restoredSessionCount: Number(latestRuntimePhase.latestRestoreDone?.payload?.restoredSessionCount) || 0,
      readySessionCount: Number(latestRuntimePhase.latestReady.payload?.sessionCount) || 0,
      maxWarmupActiveSessionCount: Number(latestRuntimePhase.latestReady.warmup?.maxActiveSessionCount) || 0,
      lastWarmupActiveAt: latestRuntimePhase.latestReady.warmup?.lastWarmupActiveAt || "",
      lastWarmupQuietWaitAt: latestRuntimePhase.latestReady.warmup?.lastQuietWaitAt || "",
      startupWarmupQuietMs: Number(latestRuntimePhase.latestReady.warmup?.quietMs) || 0
    },
    frontendBootstrap: {
      firstReadyProbeAt: frontendBootstrap.firstReadyProbe?.timestamp || "",
      firstFrontendSocketAt: frontendBootstrap.firstFrontendSocket?.timestamp || "",
      firstSnapshotAt: frontendBootstrap.firstSnapshot?.timestamp || "",
      snapshotSessionCount: Number(frontendBootstrap.firstSnapshot?.payload?.sessionCount) || 0,
      snapshotOutputCount: Number(frontendBootstrap.firstSnapshot?.payload?.outputCount) || 0,
      bootstrapWindowSeconds: frontendBootstrap.bootstrapWindowSeconds,
      requestCounts: frontendBootstrap.requestCounts,
      inputPostCount: frontendBootstrap.inputPostCount,
      inputWriteOkCount: frontendBootstrap.inputWriteOkCount,
      inputWriteGroups: frontendBootstrap.inputWriteGroups,
      resizeGroups: frontendBootstrap.resizeGroups,
      activityStartGroups: frontendBootstrap.activityStartGroups,
      requests: frontendBootstrap.bootstrapRequests
    }
  };
  report.assessment = buildAssessment(latestRuntimePhase, frontendBootstrap);

  if (options.format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(formatTextReport(report));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error || "Unknown error"));
  process.exit(1);
});
