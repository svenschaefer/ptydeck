import test from "node:test";
import assert from "node:assert/strict";
import {
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

  assert.throws(() => normalizeSshHostKeyProbeRequest({ host: "" }), /Field 'host'/);
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
  assert.equal(formatSshTarget("example.internal", 22), "example.internal");
  assert.equal(formatSshTarget("example.internal", 2222), "example.internal:2222");
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
});
