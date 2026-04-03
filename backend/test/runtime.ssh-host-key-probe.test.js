import test from "node:test";
import assert from "node:assert/strict";
import { parseSshKeyscanOutput, probeSshHostKeysWithKeyscan } from "../src/ssh-host-key-probe.js";

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
