#!/usr/bin/env node
import fs from 'node:fs';
import { logScriptStart } from "./lib/script-log.mjs";

logScriptStart("scripts/analyze-restart-streaming.mjs");

function parseArgs(argv) {
  const args = {
    log: '/tmp/ptydeck-backend-debug.log',
    start: null,
    end: null,
    format: 'text'
  };
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--log' && argv[index + 1]) {
      args.log = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === '--start' && argv[index + 1]) {
      args.start = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === '--end' && argv[index + 1]) {
      args.end = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === '--format' && argv[index + 1]) {
      args.format = argv[index + 1];
      index += 1;
      continue;
    }
  }
  if (!args.start || !args.end) {
    throw new Error('Usage: node scripts/analyze-restart-streaming.mjs --start <iso> --end <iso> [--log <path>] [--format text|json]');
  }
  const startMs = Date.parse(args.start);
  const endMs = Date.parse(args.end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    throw new Error('Invalid --start/--end window.');
  }
  return { ...args, startMs, endMs };
}

function parseLine(line) {
  const match = line.match(/^\[ptydeck-backend\]\[([^\]]+)\] ([^ ]+) (\{.*\})$/);
  if (!match) {
    return null;
  }
  const [, isoTimestamp, label, jsonPayload] = match;
  const recordedAt = Date.parse(isoTimestamp);
  if (!Number.isFinite(recordedAt)) {
    return null;
  }
  let payload;
  try {
    payload = JSON.parse(jsonPayload);
  } catch {
    return null;
  }
  return {
    recordedAt,
    isoTimestamp,
    label,
    payload
  };
}

function bump(map, key, delta = 1) {
  map.set(key, (map.get(key) || 0) + delta);
}

function mapToSortedObject(map) {
  return Object.fromEntries([...map.entries()].sort((left, right) => {
    if (typeof left[1] === 'number' && typeof right[1] === 'number') {
      return right[1] - left[1] || String(left[0]).localeCompare(String(right[0]));
    }
    return String(left[0]).localeCompare(String(right[0]));
  }).map(([key, value]) => [key, value instanceof Map ? mapToSortedObject(value) : value]));
}

function summarize(lines, startMs, endMs) {
  const labels = new Map();
  const httpPaths = new Map();
  const sessionEventTypes = new Map();
  const messagingEventTypes = new Map();
  const messagingEventReasons = new Map();
  const targetPhases = new Map();
  const sessions = new Map();
  let firstTimestamp = null;
  let lastTimestamp = null;

  for (const line of lines) {
    const parsed = parseLine(line);
    if (!parsed || parsed.recordedAt < startMs || parsed.recordedAt > endMs) {
      continue;
    }
    if (firstTimestamp === null || parsed.recordedAt < firstTimestamp) {
      firstTimestamp = parsed.recordedAt;
    }
    if (lastTimestamp === null || parsed.recordedAt > lastTimestamp) {
      lastTimestamp = parsed.recordedAt;
    }
    bump(labels, parsed.label);

    if (parsed.label === 'http.request.start' || parsed.label === 'http.request.done') {
      bump(httpPaths, `${parsed.payload.method || ''} ${parsed.payload.pathname || ''}`);
    }
    if (parsed.label === 'session.event') {
      bump(sessionEventTypes, parsed.payload.type || 'unknown');
    }
    if (parsed.label === 'messaging.event.trace') {
      bump(messagingEventTypes, parsed.payload.type || 'unknown');
      bump(messagingEventReasons, `${parsed.payload.action || 'unknown'}:${parsed.payload.reason || ''}`);
    }
    if (parsed.label === 'messaging.target.update') {
      bump(targetPhases, parsed.payload.phase || 'unknown');
    }

    const sessionId = parsed.payload.sessionId || null;
    if (sessionId) {
      let session = sessions.get(sessionId);
      if (!session) {
        session = {
          sessionId,
          sessionLabel: null,
          targetThreadId: null,
          targetChatId: null,
          topicName: null,
          firstAt: parsed.recordedAt,
          lastAt: parsed.recordedAt,
          labels: new Map(),
          sessionEvents: new Map(),
          messagingEvents: new Map(),
          messagingReasons: new Map(),
          targetPhases: new Map(),
          timeline: []
        };
        sessions.set(sessionId, session);
      }
      session.firstAt = Math.min(session.firstAt, parsed.recordedAt);
      session.lastAt = Math.max(session.lastAt, parsed.recordedAt);
      bump(session.labels, parsed.label);
      if (parsed.payload.sessionLabel && !session.sessionLabel) {
        session.sessionLabel = parsed.payload.sessionLabel;
      }
      if (parsed.payload.targetThreadId && !session.targetThreadId) {
        session.targetThreadId = parsed.payload.targetThreadId;
      }
      if (parsed.payload.targetChatId && !session.targetChatId) {
        session.targetChatId = parsed.payload.targetChatId;
      }
      if (parsed.payload.messageThreadId && !session.targetThreadId) {
        session.targetThreadId = parsed.payload.messageThreadId;
      }
      if (parsed.payload.chatId && !session.targetChatId) {
        session.targetChatId = parsed.payload.chatId;
      }
      if (parsed.payload.topicName && !session.topicName) {
        session.topicName = parsed.payload.topicName;
      }
      if (parsed.label === 'session.event') {
        bump(session.sessionEvents, parsed.payload.type || 'unknown');
      }
      if (parsed.label === 'messaging.event.trace') {
        bump(session.messagingEvents, parsed.payload.type || 'unknown');
        bump(session.messagingReasons, `${parsed.payload.action || 'unknown'}:${parsed.payload.reason || ''}`);
        if (parsed.payload.targetThreadId && !session.targetThreadId) {
          session.targetThreadId = parsed.payload.targetThreadId;
        }
        if (parsed.payload.targetChatId && !session.targetChatId) {
          session.targetChatId = parsed.payload.targetChatId;
        }
      }
      if (parsed.label === 'messaging.target.update') {
        bump(session.targetPhases, parsed.payload.phase || 'unknown');
      }
      if (session.timeline.length < 12) {
        const details = [];
        if (parsed.label === 'session.event') {
          details.push(parsed.payload.type || 'unknown');
        }
        if (parsed.label === 'messaging.event.trace') {
          details.push(parsed.payload.type || 'unknown');
          details.push(`${parsed.payload.action || 'unknown'}:${parsed.payload.reason || ''}`);
        }
        if (parsed.label === 'messaging.target.update') {
          details.push(parsed.payload.phase || 'unknown');
        }
        session.timeline.push({
          isoTimestamp: parsed.isoTimestamp,
          label: parsed.label,
          details
        });
      }
    }
  }

  const orderedSessions = [...sessions.values()].sort((left, right) => left.firstAt - right.firstAt || left.sessionId.localeCompare(right.sessionId));
  return {
    window: {
      start: new Date(startMs).toISOString(),
      end: new Date(endMs).toISOString(),
      firstObserved: firstTimestamp === null ? null : new Date(firstTimestamp).toISOString(),
      lastObserved: lastTimestamp === null ? null : new Date(lastTimestamp).toISOString()
    },
    totals: {
      labels: mapToSortedObject(labels),
      httpPaths: mapToSortedObject(httpPaths),
      sessionEventTypes: mapToSortedObject(sessionEventTypes),
      messagingEventTypes: mapToSortedObject(messagingEventTypes),
      messagingEventReasons: mapToSortedObject(messagingEventReasons),
      targetPhases: mapToSortedObject(targetPhases)
    },
    sessions: orderedSessions.map((session) => ({
      sessionId: session.sessionId,
      sessionLabel: session.sessionLabel,
      topicName: session.topicName,
      targetChatId: session.targetChatId,
      targetThreadId: session.targetThreadId,
      firstObserved: new Date(session.firstAt).toISOString(),
      lastObserved: new Date(session.lastAt).toISOString(),
      labels: mapToSortedObject(session.labels),
      sessionEvents: mapToSortedObject(session.sessionEvents),
      messagingEvents: mapToSortedObject(session.messagingEvents),
      messagingReasons: mapToSortedObject(session.messagingReasons),
      targetPhases: mapToSortedObject(session.targetPhases),
      timeline: session.timeline
    }))
  };
}

function renderText(summary) {
  const lines = [];
  lines.push(`Window: ${summary.window.start} .. ${summary.window.end}`);
  lines.push(`Observed: ${summary.window.firstObserved || 'none'} .. ${summary.window.lastObserved || 'none'}`);
  lines.push('');
  lines.push('Label totals:');
  for (const [label, count] of Object.entries(summary.totals.labels)) {
    lines.push(`- ${label}: ${count}`);
  }
  lines.push('');
  lines.push('Session event types:');
  for (const [label, count] of Object.entries(summary.totals.sessionEventTypes)) {
    lines.push(`- ${label}: ${count}`);
  }
  lines.push('');
  lines.push('Messaging event types:');
  for (const [label, count] of Object.entries(summary.totals.messagingEventTypes)) {
    lines.push(`- ${label}: ${count}`);
  }
  lines.push('');
  lines.push('Messaging decision reasons:');
  for (const [label, count] of Object.entries(summary.totals.messagingEventReasons)) {
    lines.push(`- ${label}: ${count}`);
  }
  lines.push('');
  lines.push('Target update phases:');
  for (const [label, count] of Object.entries(summary.totals.targetPhases)) {
    lines.push(`- ${label}: ${count}`);
  }
  lines.push('');
  lines.push('Session timelines:');
  for (const session of summary.sessions) {
    lines.push(`- ${session.sessionLabel || session.sessionId} (${session.topicName || 'no-topic'})`);
    lines.push(`  first=${session.firstObserved} last=${session.lastObserved} thread=${session.targetThreadId || 'n/a'}`);
    for (const entry of session.timeline) {
      const detail = entry.details.filter(Boolean).join(' | ');
      lines.push(`  ${entry.isoTimestamp} ${entry.label}${detail ? ` :: ${detail}` : ''}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

try {
  const args = parseArgs(process.argv);
  const content = fs.readFileSync(args.log, 'utf8');
  const summary = summarize(content.split(/\r?\n/), args.startMs, args.endMs);
  if (args.format === 'json') {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    process.stdout.write(renderText(summary));
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
