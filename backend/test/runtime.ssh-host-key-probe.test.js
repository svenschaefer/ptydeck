import test from "node:test";
import assert from "node:assert/strict";
import {
  computeSshTrustFingerprintSha256,
  formatSshTarget,
  normalizeSshHostKeyProbeCandidate,
  normalizeSshHostKeyProbeRequest,
  parseSshKeyscanOutput,
  probeSshHostKeysWithKeyscan
} from "../src/ssh-host-key-probe.js";

test("parseSshKeyscanOutput normalizes and deduplicates fetched host keys", () => {
  const payload = parseSshKeyscanOutput(
    [
      "# comment",
      "example.internal ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIB9zdXBlcmZha2VrZXlibG9iZm9ydGVzdHM",
      "example.internal ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIB9zdXBlcmZha2VrZXlibG9iZm9ydGVzdHM",
      "example.internal ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQCy"
    ].join("\n"),
    { host: "example.internal", port: 2222 }
  );

  assert.deepEqual(payload, [
    {
      host: "example.internal",
      port: 2222,
      keyType: "ssh-ed25519",
      publicKey: "AAAAC3NzaC1lZDI1NTE5AAAAIB9zdXBlcmZha2VrZXlibG9iZm9ydGVzdHM",
      fingerprintSha256: "SHA256:WBAy81afO2QAzgcFuxzxU+iGMFhHprahbFs9TMP7R9E"
    },
    {
      host: "example.internal",
      port: 2222,
      keyType: "ssh-rsa",
      publicKey: "AAAAB3NzaC1yc2EAAAADAQABAAABAQCy",
      fingerprintSha256: "SHA256:NBILKEVGqMz2VE0mzAK/xc9tolWVvvpbtmdTe5o+DhM"
    }
  ]);
});

test("probeSshHostKeysWithKeyscan converts ssh-keyscan output into probe candidates", async () => {
  const payload = await probeSshHostKeysWithKeyscan(
    { host: "example.internal", port: 2222 },
    {
      execFileAsync: async (command, args) => {
        assert.equal(command, "ssh-keyscan");
        assert.deepEqual(args, ["-T", "5", "-p", "2222", "-t", "ed25519,ecdsa,rsa", "example.internal"]);
        return {
          stdout: "example.internal ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIB9zdXBlcmZha2VrZXlibG9iZm9ydGVzdHM\n"
        };
      }
    }
  );

  assert.deepEqual(payload, [
    {
      host: "example.internal",
      port: 2222,
      keyType: "ssh-ed25519",
      publicKey: "AAAAC3NzaC1lZDI1NTE5AAAAIB9zdXBlcmZha2VrZXlibG9iZm9ydGVzdHM",
      fingerprintSha256: "SHA256:WBAy81afO2QAzgcFuxzxU+iGMFhHprahbFs9TMP7R9E"
    }
  ]);
});

test("SSH host-key probe normalizers trim inputs, default ports, and reject invalid payloads", () => {
  assert.deepEqual(normalizeSshHostKeyProbeRequest({ host: "  example.internal  " }), {
    host: "example.internal",
    port: 22
  });
  assert.deepEqual(normalizeSshHostKeyProbeRequest({ host: "example.internal", port: "2200" }), {
    host: "example.internal",
    port: 2200
  });

  assert.deepEqual(
    normalizeSshHostKeyProbeCandidate(
      {
        keyType: " ssh-ed25519 ",
        publicKey: "AAAAC3NzaC1lZDI1NTE5AAAAIB9zdXBlcmZha2VrZXlibG9iZm9ydGVzdHM=="
      },
      { host: "example.internal", port: 2222 }
    ),
    {
      host: "example.internal",
      port: 2222,
      keyType: "ssh-ed25519",
      publicKey: "AAAAC3NzaC1lZDI1NTE5AAAAIB9zdXBlcmZha2VrZXlibG9iZm9ydGVzdHM",
      fingerprintSha256: "SHA256:WBAy81afO2QAzgcFuxzxU+iGMFhHprahbFs9TMP7R9E"
    }
  );

  assert.equal(normalizeSshHostKeyProbeRequest({ host: "bad host" }, { strict: false }), null);
  assert.equal(normalizeSshHostKeyProbeRequest(null, { strict: false }), null);
  assert.deepEqual(
    normalizeSshHostKeyProbeRequest({ host: "example.internal", port: "bad" }, { strict: false }),
    { host: "example.internal", port: 22 }
  );
  assert.equal(
    normalizeSshHostKeyProbeCandidate(
      {
        keyType: "ssh-ed25519",
        publicKey: "***"
      },
      { host: "example.internal", port: 22 },
      { strict: false }
    ),
    null
  );
  assert.equal(
    normalizeSshHostKeyProbeCandidate(
      {
        host: "example.internal",
        keyType: "",
        publicKey: "AAAAC3NzaC1lZDI1NTE5AAAAIB9zdXBlcmZha2VrZXlibG9iZm9ydGVzdHM"
      },
      { host: "example.internal", port: 22 },
      { strict: false }
    ),
    null
  );

  assert.throws(() => normalizeSshHostKeyProbeRequest({ host: "" }), /Field 'host'/);
  assert.throws(() => normalizeSshHostKeyProbeRequest({ host: "example.internal", port: 0 }), /Field 'port'/);
  assert.throws(
    () =>
      normalizeSshHostKeyProbeCandidate(
        {
          keyType: "ssh-ed25519",
          publicKey: "***"
        },
        { host: "example.internal", port: 22 }
      ),
    /Field 'publicKey'/
  );
  assert.equal(
    computeSshTrustFingerprintSha256("AAAAB3NzaC1yc2EAAAADAQABAAABAQCy"),
    "SHA256:NBILKEVGqMz2VE0mzAK/xc9tolWVvvpbtmdTe5o+DhM"
  );
  assert.equal(formatSshTarget("example.internal", 22), "example.internal");
  assert.equal(formatSshTarget("example.internal", 2222), "example.internal:2222");
  assert.equal(formatSshTarget("example.internal", "bad"), "example.internal");
});

test("SSH host-key candidate validation rejects invalid object, key-type, and canonical base64 edge cases deterministically", () => {
  const target = { host: "example.internal", port: 22 };

  assert.throws(() => normalizeSshHostKeyProbeCandidate(null, target), /Body must be an object/);
  assert.equal(normalizeSshHostKeyProbeCandidate(null, target, { strict: false }), null);

  assert.throws(
    () =>
      normalizeSshHostKeyProbeCandidate(
        {
          keyType: "bad key type",
          publicKey: "AAAAB3NzaC1yc2EAAAADAQABAAABAQCy"
        },
        target
      ),
    /Field 'keyType'/
  );

  assert.equal(
    normalizeSshHostKeyProbeCandidate(
        {
          keyType: "ssh-ed25519",
          publicKey: "A==="
        },
        target,
        { strict: false }
    ),
    null
  );

  assert.equal(
    normalizeSshHostKeyProbeCandidate(
        {
          keyType: "ssh-ed25519",
          publicKey: "ABC"
        },
        target,
        { strict: false }
    ),
    null
  );

  assert.throws(
    () =>
      normalizeSshHostKeyProbeCandidate(
        {
          keyType: "ssh-ed25519",
          publicKey: "A==="
        },
        target
      ),
    /valid base64-encoded SSH public key blob/
  );

  assert.throws(
    () =>
      normalizeSshHostKeyProbeCandidate(
        {
          keyType: "ssh-ed25519",
          publicKey: "ABC"
        },
        target
      ),
    /valid base64-encoded SSH public key blob/
  );
});

test("parseSshKeyscanOutput rejects malformed strict target payloads before parsing lines", () => {
  assert.throws(() => parseSshKeyscanOutput("", null), /Body must be an object/);
});

test("parseSshKeyscanOutput ignores malformed lines and probe candidate normalization can fail softly", () => {
  const payload = parseSshKeyscanOutput(
    [
      "example.internal garbage",
      "example.internal ssh-ed25519 not-base64***",
      "example.internal ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIB9zdXBlcmZha2VrZXlibG9iZm9ydGVzdHM"
    ].join("\n"),
    { host: "example.internal" }
  );

  assert.equal(payload.length, 1);
  assert.equal(payload[0].port, 22);
  assert.equal(
    normalizeSshHostKeyProbeCandidate(
      {
        host: "bad host",
        keyType: "bad key type",
        publicKey: "AAAAC3NzaC1lZDI1NTE5AAAAIB9zdXBlcmZha2VrZXlibG9iZm9ydGVzdHM"
      },
      { host: "example.internal", port: 22 },
      { strict: false }
    ),
    null
  );
});

test("parseSshKeyscanOutput sorts equal key types by fingerprint as a deterministic tiebreaker", () => {
  const payload = parseSshKeyscanOutput(
    [
      "example.internal ssh-ed25519 ////",
      "example.internal ssh-ed25519 AAAA"
    ].join("\n"),
    { host: "example.internal", port: 22 }
  );

  assert.deepEqual(
    payload.map((entry) => entry.fingerprintSha256),
    [
      computeSshTrustFingerprintSha256("////"),
      computeSshTrustFingerprintSha256("AAAA")
    ].sort((left, right) => left.localeCompare(right, "en-US", { sensitivity: "base" }))
  );
});

test("probeSshHostKeysWithKeyscan maps unavailable, timeout, empty, and generic failures to API errors", async () => {
  await assert.rejects(
    () =>
      probeSshHostKeysWithKeyscan(
        { host: "example.internal", port: 22 },
        {
          execFileAsync: async () => {
            const error = new Error("missing");
            error.code = "ENOENT";
            throw error;
          }
        }
      ),
    (error) => error?.statusCode === 503 && error?.error === "SshHostKeyProbeUnavailable"
  );

  await assert.rejects(
    () =>
      probeSshHostKeysWithKeyscan(
        { host: "example.internal", port: 22 },
        {
          execFileAsync: async () => {
            const error = new Error("timeout");
            error.code = "ETIMEDOUT";
            throw error;
          }
        }
      ),
    (error) => error?.statusCode === 504 && error?.error === "SshHostKeyProbeTimedOut"
  );

  await assert.rejects(
    () =>
      probeSshHostKeysWithKeyscan(
        { host: "example.internal", port: 22 },
        {
          execFileAsync: async () => {
            const error = new Error("terminated");
            error.signal = "SIGTERM";
            throw error;
          }
        }
      ),
    (error) => error?.statusCode === 504 && error?.error === "SshHostKeyProbeTimedOut"
  );

  await assert.rejects(
    () =>
      probeSshHostKeysWithKeyscan(
        { host: "example.internal", port: 22 },
        {
          execFileAsync: async () => ({
            stdout: "# no keys\n"
          })
        }
      ),
    (error) => error?.statusCode === 502 && error?.error === "SshHostKeyProbeFailed"
  );

  await assert.rejects(
    () =>
      probeSshHostKeysWithKeyscan(
        { host: "example.internal", port: 22 },
        {
          execFileAsync: async () => {
            throw new Error("ssh-keyscan failed");
          }
        }
      ),
    (error) => error?.statusCode === 502 && error?.error === "SshHostKeyProbeFailed"
  );

  await assert.rejects(
    () =>
      probeSshHostKeysWithKeyscan(
        { host: "example.internal", port: 22 },
        {
          execFileAsync: async () => {
            const error = new Error("killed");
            error.killed = true;
            throw error;
          }
        }
      ),
    (error) => error?.statusCode === 504 && error?.error === "SshHostKeyProbeTimedOut"
  );
});

test("probeSshHostKeysWithKeyscan floors tiny timeouts to one second and preserves explicit target formatting", async () => {
  await probeSshHostKeysWithKeyscan(
    { host: "example.internal", port: 2222 },
    {
      timeoutMs: 1,
      execFileAsync: async (command, args, options) => {
        assert.equal(command, "ssh-keyscan");
        assert.deepEqual(args, ["-T", "1", "-p", "2222", "-t", "ed25519,ecdsa,rsa", "example.internal"]);
        assert.equal(options.timeout, 1);
        return {
          stdout: "example.internal ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIB9zdXBlcmZha2VrZXlibG9iZm9ydGVzdHM\n"
        };
      }
    }
  );
});
