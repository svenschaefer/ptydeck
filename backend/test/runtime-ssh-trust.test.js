import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ApiError } from "../src/errors.js";
import { createRuntimeSshTrust } from "../src/runtime-ssh-trust.js";

const SSH_ED25519_PUBLIC_KEY = "AAAAC3NzaC1lZDI1NTE5AAAAIB9zdXBlcmZha2VrZXlibG9iZm9ydGVzdHM=";
const SSH_RSA_PUBLIC_KEY = "AAAAB3NzaC1yc2EAAAADAQABAAABAQC7dHJ1c3RlZHJzYXRlc3RrZXlibG9i";
const SSH_RSA_REPLACEMENT_PUBLIC_KEY = "AAAAB3NzaC1yc2EAAAADAQABAAABAQDDaWZmZXJlbnRydXN0a2V5dGVzdGJsb2I=";

function normalizeSshTrustEntryPort(value, _fieldPath, { strict = true } = {}) {
  const normalized = Number(value);
  if (Number.isInteger(normalized) && normalized > 0 && normalized <= 65535) {
    return normalized;
  }
  if (strict) {
    throw new ApiError(400, "ValidationError", "Invalid SSH trust port.");
  }
  return 22;
}

function createNormalizeSshTrustEntryEntity() {
  let nextId = 1;
  return (input, { strict = true } = {}) => {
    const host = typeof input?.host === "string" ? input.host.trim() : "";
    const keyType = typeof input?.keyType === "string" ? input.keyType.trim() : "";
    const publicKeyRaw = typeof input?.publicKey === "string" ? input.publicKey.trim() : "";
    const port = normalizeSshTrustEntryPort(input?.port, "port", { strict });
    if (strict && (!host || !keyType || !publicKeyRaw)) {
      throw new ApiError(400, "ValidationError", "Invalid SSH trust entry.");
    }
    const publicKey = publicKeyRaw.endsWith("=") ? publicKeyRaw : `${publicKeyRaw}=`;
    const generatedId = `trust-${String(nextId).padStart(24, "0")}`;
    nextId += 1;
    return {
      id: typeof input?.id === "string" && input.id.trim() ? input.id.trim() : generatedId,
      host,
      port,
      keyType,
      publicKey,
      fingerprintSha256: `SHA256:${Buffer.from(`${host}:${port}:${keyType}:${publicKey}`).toString("base64url").slice(0, 16)}`
    };
  };
}

function renderSshKnownHosts(entries) {
  return entries.map((entry) => `[${entry.host}]:${entry.port} ${entry.keyType} ${entry.publicKey}`).join("\n") + (entries.length ? "\n" : "");
}

function createRuntimeSshTrustHarness(overrides = {}) {
  return createRuntimeSshTrust({
    sshTrustEntries: overrides.sshTrustEntries || new Map(),
    sshKnownHostsPath: overrides.sshKnownHostsPath || join(process.cwd(), "tmp", "ssh_known_hosts"),
    normalizeSshTrustEntryPort,
    normalizeSshTrustEntryEntity: overrides.normalizeSshTrustEntryEntity || createNormalizeSshTrustEntryEntity(),
    renderSshKnownHosts,
    probeSshHostKeys: overrides.probeSshHostKeys || (async () => []),
    nowFn: overrides.nowFn || (() => 1234)
  });
}

test("runtime ssh trust lists entries deterministically and resolves unique trusted key types", () => {
  const sshTrustEntries = new Map([
    [
      "trust-2",
      {
        id: "trust-2",
        host: "zeta.internal",
        port: 22,
        keyType: "ssh-rsa",
        publicKey: SSH_RSA_PUBLIC_KEY,
        fingerprintSha256: "SHA256:zeta",
        createdAt: 20,
        updatedAt: 20
      }
    ],
    [
      "trust-1",
      {
        id: "trust-1",
        host: "alpha.internal",
        port: 22,
        keyType: "ssh-rsa",
        publicKey: SSH_RSA_PUBLIC_KEY,
        fingerprintSha256: "SHA256:alpha-rsa",
        createdAt: 10,
        updatedAt: 10
      }
    ],
    [
      "trust-3",
      {
        id: "trust-3",
        host: "alpha.internal",
        port: 22,
        keyType: "ssh-ed25519",
        publicKey: SSH_ED25519_PUBLIC_KEY,
        fingerprintSha256: "SHA256:alpha-ed25519",
        createdAt: 30,
        updatedAt: 30
      }
    ],
    [
      "trust-4",
      {
        id: "trust-4",
        host: "alpha.internal",
        port: 22,
        keyType: "ssh-rsa",
        publicKey: SSH_RSA_PUBLIC_KEY,
        fingerprintSha256: "SHA256:alpha-rsa-duplicate",
        createdAt: 40,
        updatedAt: 40
      }
    ]
  ]);
  const runtimeSshTrust = createRuntimeSshTrustHarness({ sshTrustEntries });

  assert.deepEqual(runtimeSshTrust.listSshTrustEntries().map((entry) => entry.id), [
    "trust-3",
    "trust-1",
    "trust-4",
    "trust-2"
  ]);
  assert.deepEqual(runtimeSshTrust.listTrustedSshHostKeyTypes("alpha.internal", 22), ["ssh-ed25519", "ssh-rsa"]);
  assert.deepEqual(runtimeSshTrust.listTrustedSshHostKeyTypes("alpha.internal", "22"), ["ssh-ed25519", "ssh-rsa"]);
  assert.deepEqual(runtimeSshTrust.listTrustedSshHostKeyTypes("missing.internal", 22), []);
  assert.deepEqual(runtimeSshTrust.listTrustedSshHostKeyTypes("", 22), []);
});

test("runtime ssh trust upserts exact entries and rejects conflicting replacements", () => {
  const runtimeSshTrust = createRuntimeSshTrustHarness();

  const created = runtimeSshTrust.upsertSshTrustEntry({
    host: "example.internal",
    port: 22,
    keyType: "ssh-rsa",
    publicKey: SSH_RSA_PUBLIC_KEY
  });
  assert.equal(created.created, true);
  assert.match(created.entry.id, /^trust-[0-9]{24}$/);
  assert.equal(created.entry.createdAt, 1234);
  assert.equal(created.entry.updatedAt, 1234);

  const reused = runtimeSshTrust.upsertSshTrustEntry({
    host: "example.internal",
    port: 22,
    keyType: "ssh-rsa",
    publicKey: SSH_RSA_PUBLIC_KEY
  });
  assert.equal(reused.created, false);
  assert.equal(reused.entry.id, created.entry.id);

  assert.throws(
    () =>
      runtimeSshTrust.upsertSshTrustEntry({
        host: "example.internal",
        port: 22,
        keyType: "ssh-rsa",
        publicKey: SSH_RSA_REPLACEMENT_PUBLIC_KEY
      }),
    (error) => {
      assert.equal(error instanceof ApiError, true);
      assert.equal(error.statusCode, 409);
      assert.equal(error.error, "SshHostKeyTrustConflict");
      return true;
    }
  );
});

test("runtime ssh trust deletes entries fail-closed for invalid or missing ids", () => {
  const runtimeSshTrust = createRuntimeSshTrustHarness();
  const { entry } = runtimeSshTrust.upsertSshTrustEntry({
    host: "example.internal",
    port: 22,
    keyType: "ssh-ed25519",
    publicKey: SSH_ED25519_PUBLIC_KEY
  });

  const deleted = runtimeSshTrust.deleteSshTrustEntry(entry.id);
  assert.equal(deleted.id, entry.id);
  assert.equal(runtimeSshTrust.listSshTrustEntries().length, 0);

  assert.throws(() => runtimeSshTrust.deleteSshTrustEntry("invalid-id"), (error) => {
    assert.equal(error instanceof ApiError, true);
    assert.equal(error.statusCode, 404);
    assert.equal(error.error, "SshTrustEntryNotFound");
    return true;
  });

  assert.throws(() => runtimeSshTrust.deleteSshTrustEntry(entry.id), (error) => {
    assert.equal(error instanceof ApiError, true);
    assert.equal(error.statusCode, 404);
    assert.equal(error.error, "SshTrustEntryNotFound");
    return true;
  });
});

test("runtime ssh trust probes host keys deterministically and rejects empty probe results", async () => {
  const runtimeSshTrust = createRuntimeSshTrustHarness({
    probeSshHostKeys: async () => [
      { host: "example.internal", port: 22, keyType: "ssh-ed25519", publicKey: SSH_ED25519_PUBLIC_KEY, fingerprintSha256: "SHA256:ed25519" },
      { host: "example.internal", port: 22, keyType: "ssh-ed25519", publicKey: SSH_ED25519_PUBLIC_KEY, fingerprintSha256: "SHA256:duplicate" },
      { host: "example.internal", port: 22, keyType: "ssh-rsa", publicKey: SSH_RSA_PUBLIC_KEY, fingerprintSha256: "SHA256:rsa" },
      { host: "example.internal", port: 22, keyType: "", publicKey: "", fingerprintSha256: "SHA256:invalid" }
    ]
  });

  const candidates = await runtimeSshTrust.probeSshHostKeysOrThrow({ host: "example.internal", port: 22 });
  assert.deepEqual(
    candidates.map((entry) => ({ keyType: entry.keyType, publicKey: entry.publicKey })),
    [
      { keyType: "ssh-ed25519", publicKey: SSH_ED25519_PUBLIC_KEY },
      { keyType: "ssh-rsa", publicKey: SSH_RSA_PUBLIC_KEY }
    ]
  );

  const emptyProbeRuntime = createRuntimeSshTrustHarness({
    probeSshHostKeys: async () => []
  });
  await assert.rejects(
    () => emptyProbeRuntime.probeSshHostKeysOrThrow({ host: "example.internal", port: 22 }),
    (error) => {
      assert.equal(error instanceof ApiError, true);
      assert.equal(error.statusCode, 502);
      assert.equal(error.error, "SshHostKeyProbeFailed");
      return true;
    }
  );
});

test("runtime ssh trust writes the managed known_hosts file from sorted trusted entries", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ptydeck-runtime-ssh-trust-seam-"));
  const knownHostsPath = join(dir, "state", "ssh_known_hosts");
  const runtimeSshTrust = createRuntimeSshTrustHarness({
    sshKnownHostsPath: knownHostsPath
  });

  runtimeSshTrust.upsertSshTrustEntry({
    host: "zeta.internal",
    port: 22,
    keyType: "ssh-rsa",
    publicKey: SSH_RSA_PUBLIC_KEY
  });
  runtimeSshTrust.upsertSshTrustEntry({
    host: "alpha.internal",
    port: 22,
    keyType: "ssh-ed25519",
    publicKey: SSH_ED25519_PUBLIC_KEY
  });

  await runtimeSshTrust.syncSshKnownHostsFile();
  const knownHostsRaw = await readFile(knownHostsPath, "utf8");
  assert.equal(
    knownHostsRaw,
    `[alpha.internal]:22 ssh-ed25519 ${SSH_ED25519_PUBLIC_KEY}\n[zeta.internal]:22 ssh-rsa ${SSH_RSA_PUBLIC_KEY}=\n`
  );
});
