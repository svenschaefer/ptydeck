import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { ApiError } from "./errors.js";
import {
  formatSshTarget,
  normalizeSshHostKeyProbeCandidate,
  normalizeSshHostKeyProbeRequest
} from "./ssh-host-key-probe.js";

export function createRuntimeSshTrust(dependencies = {}) {
  const {
    sshTrustEntries = new Map(),
    sshKnownHostsPath = "",
    normalizeSshTrustEntryPort = () => 22,
    normalizeSshTrustEntryEntity = () => {
      throw new Error("normalizeSshTrustEntryEntity is required.");
    },
    renderSshKnownHosts = () => "",
    probeSshHostKeys = async () => [],
    sshTrustEntryIdPattern = /^trust-[a-f0-9]{24}$/,
    nowFn = () => Date.now(),
    formatSshTargetImpl = formatSshTarget,
    normalizeSshHostKeyProbeCandidateImpl = normalizeSshHostKeyProbeCandidate,
    normalizeSshHostKeyProbeRequestImpl = normalizeSshHostKeyProbeRequest,
    mkdirImpl = mkdir,
    writeFileImpl = writeFile
  } = dependencies;

  function compareSshTrustEntries(a, b) {
    const hostCompare = a.host.localeCompare(b.host, "en-US", { sensitivity: "base" });
    if (hostCompare !== 0) {
      return hostCompare;
    }
    if (a.port !== b.port) {
      return a.port - b.port;
    }
    const keyTypeCompare = a.keyType.localeCompare(b.keyType, "en-US", { sensitivity: "base" });
    if (keyTypeCompare !== 0) {
      return keyTypeCompare;
    }
    if (a.createdAt !== b.createdAt) {
      return a.createdAt - b.createdAt;
    }
    return a.id.localeCompare(b.id, "en-US", { sensitivity: "base" });
  }

  function toApiSshTrustEntry(entry) {
    return {
      id: entry.id,
      host: entry.host,
      port: entry.port,
      keyType: entry.keyType,
      publicKey: entry.publicKey,
      fingerprintSha256: entry.fingerprintSha256,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt
    };
  }

  function listSortedTrustEntries() {
    return Array.from(sshTrustEntries.values()).sort(compareSshTrustEntries);
  }

  function listSshTrustEntries() {
    return listSortedTrustEntries().map(toApiSshTrustEntry);
  }

  function listTrustedSshHostKeyTypes(host, port) {
    const normalizedHost = typeof host === "string" ? host.trim() : "";
    const normalizedPort = Number.isInteger(port) ? port : normalizeSshTrustEntryPort(port, "port", { strict: false });
    if (!normalizedHost) {
      return [];
    }
    const types = [];
    const seen = new Set();
    for (const entry of listSortedTrustEntries()) {
      if (entry.host !== normalizedHost || entry.port !== normalizedPort || seen.has(entry.keyType)) {
        continue;
      }
      seen.add(entry.keyType);
      types.push(entry.keyType);
    }
    return types;
  }

  async function probeSshHostKeysOrThrow(input) {
    const target = normalizeSshHostKeyProbeRequestImpl(input, { strict: true });
    const payload = await probeSshHostKeys(target);
    const candidates = [];
    const seen = new Set();
    for (const entry of Array.isArray(payload) ? payload : []) {
      const normalized = normalizeSshHostKeyProbeCandidateImpl(entry, target, { strict: false });
      if (!normalized) {
        continue;
      }
      const dedupeKey = `${normalized.keyType}\n${normalized.publicKey}`;
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);
      candidates.push(normalized);
    }
    if (candidates.length === 0) {
      throw new ApiError(
        502,
        "SshHostKeyProbeFailed",
        `No SSH host keys were returned for ${formatSshTargetImpl(target.host, target.port)}.`
      );
    }
    return candidates;
  }

  function findSshTrustConflict(entry) {
    for (const candidate of sshTrustEntries.values()) {
      if (candidate.host !== entry.host || candidate.port !== entry.port || candidate.keyType !== entry.keyType) {
        continue;
      }
      if (candidate.publicKey === entry.publicKey) {
        return { type: "exact", entry: candidate };
      }
      return { type: "conflict", entry: candidate };
    }
    return null;
  }

  function upsertSshTrustEntry(body) {
    const normalized = normalizeSshTrustEntryEntity(body, { strict: true });
    const conflict = findSshTrustConflict(normalized);
    if (conflict?.type === "exact") {
      return { created: false, entry: toApiSshTrustEntry(conflict.entry) };
    }
    if (conflict?.type === "conflict") {
      throw new ApiError(
        409,
        "SshHostKeyTrustConflict",
        `SSH trust entry '${conflict.entry.id}' already trusts ${normalized.host}:${normalized.port} ${normalized.keyType} with a different public key. Delete the existing entry before trusting the new host key.`
      );
    }
    const now = nowFn();
    const entry = {
      ...normalized,
      createdAt: now,
      updatedAt: now
    };
    sshTrustEntries.set(entry.id, entry);
    return { created: true, entry: toApiSshTrustEntry(entry) };
  }

  function deleteSshTrustEntry(entryId) {
    const normalizedEntryId = typeof entryId === "string" ? entryId.trim() : "";
    if (!sshTrustEntryIdPattern.test(normalizedEntryId)) {
      throw new ApiError(404, "SshTrustEntryNotFound", `SSH trust entry '${entryId}' was not found.`);
    }
    const entry = sshTrustEntries.get(normalizedEntryId);
    if (!entry) {
      throw new ApiError(404, "SshTrustEntryNotFound", `SSH trust entry '${entryId}' was not found.`);
    }
    sshTrustEntries.delete(normalizedEntryId);
    return toApiSshTrustEntry(entry);
  }

  async function syncSshKnownHostsFile() {
    const payload = renderSshKnownHosts(listSortedTrustEntries());
    await mkdirImpl(dirname(sshKnownHostsPath), { recursive: true });
    await writeFileImpl(sshKnownHostsPath, payload, { encoding: "utf8", mode: 0o600 });
  }

  return Object.freeze({
    findSshTrustConflict,
    listSshTrustEntries,
    listTrustedSshHostKeyTypes,
    probeSshHostKeysOrThrow,
    upsertSshTrustEntry,
    deleteSshTrustEntry,
    syncSshKnownHostsFile
  });
}
