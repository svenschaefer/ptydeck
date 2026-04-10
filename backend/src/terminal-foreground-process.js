import fs from "node:fs";
import { basename } from "node:path";

const DEFAULT_ANCESTRY_DEPTH = 6;

function readFileUtf8(filePath, readFileSyncImpl) {
  try {
    return readFileSyncImpl(filePath, "utf8");
  } catch {
    return "";
  }
}

function readLink(filePath, readlinkSyncImpl) {
  try {
    return readlinkSyncImpl(filePath);
  } catch {
    return "";
  }
}

function parseInteger(value) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function normalizeCommandLine(raw) {
  if (typeof raw !== "string" || !raw.length) {
    return [];
  }
  return raw.split("\u0000").map((entry) => entry.trim()).filter(Boolean);
}

function parseStatusMap(raw) {
  const entries = {};
  if (typeof raw !== "string" || !raw.trim()) {
    return entries;
  }
  for (const line of raw.split(/\r?\n/)) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (key) {
      entries[key] = value;
    }
  }
  return entries;
}

export function parseLinuxProcStat(raw) {
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const openParenIndex = trimmed.indexOf("(");
  const closeParenIndex = trimmed.lastIndexOf(")");
  if (openParenIndex <= 0 || closeParenIndex <= openParenIndex) {
    return null;
  }
  const pid = parseInteger(trimmed.slice(0, openParenIndex));
  const comm = trimmed.slice(openParenIndex + 1, closeParenIndex);
  const fields = trimmed.slice(closeParenIndex + 1).trim().split(/\s+/);
  if (!pid || !comm || fields.length < 6) {
    return null;
  }
  const ppid = parseInteger(fields[1]);
  const pgrp = parseInteger(fields[2]);
  const sessionId = parseInteger(fields[3]);
  const ttyNr = parseInteger(fields[4]);
  const tpgid = parseInteger(fields[5]);
  if (ppid === null || pgrp === null || sessionId === null || ttyNr === null || tpgid === null) {
    return null;
  }
  return {
    pid,
    comm,
    state: fields[0],
    ppid,
    pgrp,
    sessionId,
    ttyNr,
    tpgid
  };
}

export function readLinuxProcessSnapshot(pid, dependencies = {}) {
  const normalizedPid = parseInteger(pid);
  if (!normalizedPid || normalizedPid <= 0) {
    return null;
  }
  const readFileSyncImpl = dependencies.readFileSync || fs.readFileSync;
  const readlinkSyncImpl = dependencies.readlinkSync || fs.readlinkSync;
  const stat = parseLinuxProcStat(readFileUtf8(`/proc/${normalizedPid}/stat`, readFileSyncImpl));
  if (!stat) {
    return null;
  }
  const statusMap = parseStatusMap(readFileUtf8(`/proc/${normalizedPid}/status`, readFileSyncImpl));
  const commandLine = normalizeCommandLine(readFileUtf8(`/proc/${normalizedPid}/cmdline`, readFileSyncImpl));
  const executablePath = readLink(`/proc/${normalizedPid}/exe`, readlinkSyncImpl);
  const ttyPath = readLink(`/proc/${normalizedPid}/fd/0`, readlinkSyncImpl);
  return {
    pid: normalizedPid,
    ppid: stat.ppid,
    pgrp: stat.pgrp,
    sessionId: stat.sessionId,
    ttyNr: stat.ttyNr,
    tpgid: stat.tpgid,
    state: stat.state,
    comm: String(stat.comm || "").trim(),
    name: String(statusMap.Name || stat.comm || "").trim(),
    executablePath,
    executableName: basename(executablePath || commandLine[0] || stat.comm || "").trim().toLowerCase(),
    commandLine,
    ttyPath,
    namespaceProcessGroupId: parseInteger(statusMap.NSpgid),
    namespaceSessionId: parseInteger(statusMap.NSsid)
  };
}

function listProcPids(readdirSyncImpl) {
  try {
    return readdirSyncImpl("/proc", { withFileTypes: true })
      .filter((entry) => entry?.isDirectory?.() && /^\d+$/.test(entry.name))
      .map((entry) => Number.parseInt(entry.name, 10))
      .filter((value) => Number.isInteger(value) && value > 0)
      .sort((left, right) => left - right);
  } catch {
    return [];
  }
}

function simplifyProcessSnapshot(processSnapshot) {
  if (!processSnapshot) {
    return null;
  }
  return {
    pid: processSnapshot.pid,
    ppid: processSnapshot.ppid,
    pgrp: processSnapshot.pgrp,
    sessionId: processSnapshot.sessionId,
    ttyNr: processSnapshot.ttyNr,
    comm: processSnapshot.comm,
    name: processSnapshot.name,
    executableName: processSnapshot.executableName,
    executablePath: processSnapshot.executablePath,
    commandLine: processSnapshot.commandLine,
    ttyPath: processSnapshot.ttyPath
  };
}

function chooseForegroundRepresentative(foregroundProcesses, foregroundProcessGroupId) {
  if (!Array.isArray(foregroundProcesses) || foregroundProcesses.length === 0) {
    return null;
  }
  const processIds = new Set(foregroundProcesses.map((entry) => entry.pid));
  const leader = foregroundProcesses.find((entry) => entry.pid === foregroundProcessGroupId);
  if (leader) {
    return leader;
  }
  const root = foregroundProcesses.find((entry) => !processIds.has(entry.ppid));
  if (root) {
    return root;
  }
  return foregroundProcesses.slice().sort((left, right) => left.pid - right.pid)[0] || null;
}

function buildAncestry(processSnapshot, processByPid, maxDepth) {
  const ancestry = [];
  const visited = new Set([processSnapshot?.pid]);
  let currentPid = processSnapshot?.ppid;
  let depth = 0;
  while (Number.isInteger(currentPid) && currentPid > 0 && depth < maxDepth && !visited.has(currentPid)) {
    const current = processByPid.get(currentPid);
    if (!current) {
      break;
    }
    ancestry.push(simplifyProcessSnapshot(current));
    visited.add(currentPid);
    currentPid = current.ppid;
    depth += 1;
  }
  return ancestry;
}

export function inspectLinuxTerminalForegroundProcess(terminalPid, dependencies = {}) {
  if (process.platform !== "linux") {
    return null;
  }
  const readdirSyncImpl = dependencies.readdirSync || fs.readdirSync;
  const terminalProcess = readLinuxProcessSnapshot(terminalPid, dependencies);
  if (!terminalProcess || terminalProcess.ttyNr <= 0 || terminalProcess.tpgid <= 0) {
    return null;
  }
  const processByPid = new Map([[terminalProcess.pid, terminalProcess]]);
  const foregroundProcesses = [];
  for (const pid of listProcPids(readdirSyncImpl)) {
    const snapshot = pid === terminalProcess.pid ? terminalProcess : readLinuxProcessSnapshot(pid, dependencies);
    if (!snapshot) {
      continue;
    }
    processByPid.set(snapshot.pid, snapshot);
    if (snapshot.ttyNr === terminalProcess.ttyNr && snapshot.pgrp === terminalProcess.tpgid) {
      foregroundProcesses.push(snapshot);
    }
  }
  if (!foregroundProcesses.length) {
    return null;
  }
  foregroundProcesses.sort((left, right) => left.pid - right.pid);
  const representativeProcess = chooseForegroundRepresentative(foregroundProcesses, terminalProcess.tpgid);
  if (!representativeProcess) {
    return null;
  }
  return {
    terminalPid: terminalProcess.pid,
    terminalProcessGroupId: terminalProcess.pgrp,
    terminalSessionId: terminalProcess.sessionId,
    terminalComm: terminalProcess.comm,
    terminalExecutableName: terminalProcess.executableName,
    ttyNr: terminalProcess.ttyNr,
    ttyPath: terminalProcess.ttyPath,
    foregroundProcessGroupId: terminalProcess.tpgid,
    representativeProcess: simplifyProcessSnapshot(representativeProcess),
    foregroundProcesses: foregroundProcesses.map((entry) => simplifyProcessSnapshot(entry)),
    ancestry: buildAncestry(representativeProcess, processByPid, dependencies.maxAncestryDepth || DEFAULT_ANCESTRY_DEPTH)
  };
}
