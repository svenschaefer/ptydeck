import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMissingSshTrustRecoveryMessage,
  buildSshTrustGuidance,
  buildSshTrustStatus,
  createConnectionProfileSshLifecycle,
  formatSshTarget,
  getSshTrustTargetKey,
  normalizeSshHostKeyProbeCandidateCollection,
  normalizeSshTrustEntryCollection,
  normalizeSshTrustTargetInput,
  resolveSshTrustRecord
} from "../src/public/connection-profile-ssh-lifecycle.js";

function createHarness(overrides = {}) {
  const calls = [];
  const state = {
    sshTrustEntries: [],
    selectedSshTrustEntryId: "",
    sshHostKeyProbeCandidates: [],
    selectedSshProbeCandidateId: "",
    probingSshHostKeys: false,
    sshProbeTargetKey: "",
    loadingSshTrustEntries: false,
    ...(overrides.state || {})
  };
  const feedback = [];
  const statuses = [];
  const seededDrafts = [];
  const selectedProfiles = [];
  let currentTarget = overrides.currentTarget || null;
  const trustEntries = overrides.trustEntries || [];
  const probeCandidates = overrides.probeCandidates || [];
  const api = {
    async listSshTrustEntries() {
      calls.push(["list-trust"]);
      return trustEntries.slice();
    },
    async probeSshHostKeys(payload) {
      calls.push(["probe-trust", payload]);
      return probeCandidates.length > 0
        ? probeCandidates.map((entry) => ({ ...entry, host: payload.host, port: payload.port }))
        : [];
    },
    async createSshTrustEntry(payload) {
      calls.push(["create-trust", payload]);
      const created = {
        id: `${payload.host}:${payload.port}:${payload.keyType}:created`,
        host: payload.host,
        port: payload.port,
        keyType: payload.keyType,
        publicKey: payload.publicKey,
        fingerprintSha256: `SHA256:${payload.keyType}-created`
      };
      trustEntries.push(created);
      return created;
    },
    async deleteSshTrustEntry(entryId) {
      calls.push(["delete-trust", entryId]);
      const index = trustEntries.findIndex((entry) => entry.id === entryId);
      if (index >= 0) {
        trustEntries.splice(index, 1);
      }
    },
    ...(overrides.api || {})
  };

  const lifecycle = createConnectionProfileSshLifecycle({
    api,
    defaultDeckId: "default",
    authMethodRequiresSecret: (remoteAuth) => ["password", "keyboardInteractive"].includes(String(remoteAuth?.method || "")),
    requestSecret: overrides.requestSecret || (async () => "runtime-secret"),
    describeSshLaunchContext:
      overrides.describeSshLaunchContext ||
      ((profile) => ({ label: profile?.name || "SSH launch", target: formatSshTarget(profile?.launch?.remoteConnection?.host, profile?.launch?.remoteConnection?.port, profile?.launch?.remoteConnection?.username) })),
    getErrorMessage: overrides.getErrorMessage || ((error, fallback) => error?.message || fallback),
    getState: () => ({ ...state }),
    updateState: (patch) => Object.assign(state, patch),
    getCurrentSshTrustTarget: () => currentTarget,
    shouldRenderSshTrustTarget: (target) => getSshTrustTargetKey(target) === getSshTrustTargetKey(currentTarget),
    renderDraftComputedState: () => calls.push(["render-trust"]),
    setCommandFeedback: (message) => feedback.push(message),
    setStatus: (message) => statuses.push(message),
    getSshProbeCandidatesForTarget: (target) => {
      const normalizedTarget = normalizeSshTrustTargetInput(target, "SSH host-key target");
      return getSshTrustTargetKey(normalizedTarget) === state.sshProbeTargetKey ? state.sshHostKeyProbeCandidates.slice() : [];
    },
    getSshTrustEntriesForTarget: (target) => {
      const normalizedTarget = normalizeSshTrustTargetInput(target, "SSH host-key target");
      return state.sshTrustEntries.filter((entry) => entry.host === normalizedTarget.host && entry.port === normalizedTarget.port);
    },
    findSshTrustConflictEntry: (target, probeCandidate) => {
      if (!probeCandidate) {
        return null;
      }
      const normalizedTarget = normalizeSshTrustTargetInput(target, "SSH host-key target");
      return state.sshTrustEntries.find(
        (entry) =>
          entry.host === normalizedTarget.host &&
          entry.port === normalizedTarget.port &&
          entry.keyType === probeCandidate.keyType &&
          entry.publicKey !== probeCandidate.publicKey
      ) || null;
    },
    seedDraftOnMissingTrust: (profile, launch, defaultDeckId) => seededDrafts.push({ profile, launch, defaultDeckId }),
    selectProfileForMissingTrust: (profile) => selectedProfiles.push(profile)
  });

  return {
    api,
    calls,
    currentTargetRef: {
      get value() {
        return currentTarget;
      },
      set value(nextTarget) {
        currentTarget = nextTarget;
      }
    },
    feedback,
    lifecycle,
    seededDrafts,
    selectedProfiles,
    state,
    statuses,
    trustEntries
  };
}

test("SSH lifecycle helpers normalize deterministic trust records and operator guidance", () => {
  const entries = normalizeSshTrustEntryCollection([
    {
      id: "b",
      host: "carpo.uberspace.de",
      port: 22,
      keyType: "ssh-rsa",
      publicKey: "AAAAB3NzaC1yc2EAAAADAQABAAABAQC",
      fingerprintSha256: "SHA256:rsa"
    },
    {
      id: "a",
      host: "carpo.uberspace.de",
      port: 22,
      keyType: "ssh-ed25519",
      publicKey: "AAAAC3NzaC1lZDI1NTE5AAAA",
      fingerprintSha256: "SHA256:ed"
    },
    {
      id: "a",
      host: "ignored",
      port: 22,
      keyType: "ssh-ed25519",
      publicKey: "ignored",
      fingerprintSha256: "ignored"
    }
  ]);
  assert.deepEqual(entries.map((entry) => entry.id), ["a", "b"]);

  const probeEntries = normalizeSshHostKeyProbeCandidateCollection([
    { host: "carpo.uberspace.de", port: 22, keyType: "ssh-rsa", publicKey: "key-b", fingerprintSha256: "SHA256:b" },
    { host: "carpo.uberspace.de", port: 22, keyType: "ssh-ed25519", publicKey: "key-a", fingerprintSha256: "SHA256:a" }
  ]);
  assert.deepEqual(probeEntries.map((entry) => entry.keyType), ["ssh-ed25519", "ssh-rsa"]);

  const exactRecord = resolveSshTrustRecord(probeEntries, "SHA256:a");
  assert.equal(exactRecord.record?.fingerprintSha256, "SHA256:a");
  const prefixRecord = resolveSshTrustRecord(probeEntries, "ssh-r");
  assert.equal(prefixRecord.record?.keyType, "ssh-rsa");
  const ambiguousRecord = resolveSshTrustRecord(probeEntries, "ssh-");
  assert.match(ambiguousRecord.error, /ambiguous/i);

  assert.equal(formatSshTarget("carpo.uberspace.de", 22, "ixpqtwnk"), "ixpqtwnk@carpo.uberspace.de:22");
  assert.equal(getSshTrustTargetKey({ host: "carpo.uberspace.de", port: 22 }), "carpo.uberspace.de:22");

  assert.match(
    buildSshTrustGuidance({
      isSsh: true,
      target: { host: "carpo.uberspace.de", port: 22 },
      matchingTrustEntries: [],
      probeCandidates: [],
      conflictEntry: null
    }),
    /First connect/
  );
  assert.match(
    buildSshTrustStatus({
      isSsh: true,
      target: { host: "carpo.uberspace.de", port: 22 },
      matchingTrustEntries: entries,
      probeCandidates: probeEntries,
      conflictEntry: entries[0],
      probing: false
    }),
    /Rotation candidate ready/
  );
  assert.match(
    buildMissingSshTrustRecoveryMessage({ host: "carpo.uberspace.de", port: 22 }, { seedDraftOnMissingTrust: true }, probeEntries),
    /rerun the same `\/ssh \.\.\.` command/
  );
});

test("SSH lifecycle prompts for masked secrets and seeds the draft on missing trust", async () => {
  const harness = createHarness({
    currentTarget: { host: "carpo.uberspace.de", port: 22 },
    probeCandidates: [
      {
        keyType: "ssh-ed25519",
        publicKey: "AAAAC3NzaC1lZDI1NTE5AAAAcreated",
        fingerprintSha256: "SHA256:created"
      }
    ]
  });

  const noSecretResult = await harness.lifecycle.promptForLaunchSecret({
    name: "Saved SSH",
    launch: { remoteAuth: { method: "privateKey" } }
  });
  assert.deepEqual(noSecretResult, { ok: true, remoteSecret: undefined, cancelled: false });

  const cancelledHarness = createHarness({ requestSecret: async () => null });
  const cancelledResult = await cancelledHarness.lifecycle.promptForLaunchSecret({
    name: "Saved SSH",
    launch: { remoteAuth: { method: "password" }, remoteConnection: { host: "carpo.uberspace.de", port: 22, username: "ixpqtwnk" } }
  });
  assert.equal(cancelledResult.cancelled, true);

  const blankHarness = createHarness({ requestSecret: async () => "   " });
  await assert.rejects(
    () => blankHarness.lifecycle.promptForLaunchSecret({
      name: "Saved SSH",
      launch: { remoteAuth: { method: "keyboardInteractive" }, remoteConnection: { host: "carpo.uberspace.de", port: 22, username: "ixpqtwnk" } }
    }),
    /SSH secret is required/
  );

  await assert.rejects(
    () => harness.lifecycle.ensureTrustedHostKeyBeforeLaunch({
      name: "SSH ixpqtwnk@carpo.uberspace.de:22",
      seedDraftOnMissingTrust: true,
      launch: {
        kind: "ssh",
        deckId: "ops",
        remoteConnection: { host: "carpo.uberspace.de", port: 22, username: "ixpqtwnk" },
        remoteAuth: { method: "privateKey", privateKeyPath: "~/.ssh/id_ed25519" }
      }
    }),
    /No trusted host key is stored/
  );
  assert.equal(harness.seededDrafts.length, 1);
  assert.equal(harness.seededDrafts[0].defaultDeckId, "default");
  assert.equal(harness.state.selectedSshProbeCandidateId.includes("ssh-ed25519"), true);
  assert.deepEqual(harness.calls.filter((entry) => entry[0] === "probe-trust"), [
    ["probe-trust", { host: "carpo.uberspace.de", port: 22 }]
  ]);
});

test("SSH lifecycle helpers cover non-SSH guidance, empty selectors, and fallback recovery text", () => {
  assert.match(
    buildSshTrustGuidance({
      isSsh: false,
      target: null,
      matchingTrustEntries: [],
      probeCandidates: [],
      conflictEntry: null
    }),
    /only used for SSH profiles/i
  );
  assert.match(
    buildSshTrustGuidance({
      isSsh: true,
      target: { host: "carpo.uberspace.de", port: 22 },
      matchingTrustEntries: [{ id: "trust-1" }],
      probeCandidates: [],
      conflictEntry: null
    }),
    /stored separately/i
  );
  assert.match(
    buildSshTrustStatus({
      isSsh: true,
      target: { host: "carpo.uberspace.de", port: 22 },
      matchingTrustEntries: [],
      probeCandidates: [],
      conflictEntry: null,
      probing: true
    }),
    /Fetching host keys/i
  );
  assert.match(
    buildMissingSshTrustRecoveryMessage(
      { host: "carpo.uberspace.de", port: 22 },
      { seedDraftOnMissingTrust: false },
      []
    ),
    /Then launch this SSH connection again\./
  );

  const noRecords = resolveSshTrustRecord([], "", { emptyError: "No keys." });
  assert.equal(noRecords.record, null);
  assert.equal(noRecords.error, "No keys.");

  const ambiguousExact = resolveSshTrustRecord([
    {
      id: "k1",
      keyType: "ssh-rsa",
      fingerprintSha256: "SHA256:first"
    },
    {
      id: "k2",
      keyType: "ssh-rsa",
      fingerprintSha256: "SHA256:second"
    }
  ], "ssh-rsa");
  assert.match(ambiguousExact.error, /ambiguous/i);

  const missingSelector = resolveSshTrustRecord([
    {
      id: "k1",
      keyType: "ssh-ed25519",
      fingerprintSha256: "SHA256:first"
    }
  ], "ssh-rsa");
  assert.match(missingSelector.error, /No SSH host key matches/i);

  assert.throws(
    () => normalizeSshTrustTargetInput({ host: "carpo.uberspace.de", port: 0 }),
    /must include a valid host and port/i
  );
});

test("SSH lifecycle refreshes, probes, trusts, replaces, and deletes host keys through the extracted seam", async () => {
  const harness = createHarness({
    currentTarget: { host: "carpo.uberspace.de", port: 22 },
    trustEntries: [
      {
        id: "trust-rsa-old",
        host: "carpo.uberspace.de",
        port: 22,
        keyType: "ssh-rsa",
        publicKey: "AAAAB3NzaC1yc2EAAAADAQABAAABAQCold",
        fingerprintSha256: "SHA256:old-rsa"
      }
    ],
    probeCandidates: [
      {
        keyType: "ssh-rsa",
        publicKey: "AAAAB3NzaC1yc2EAAAADAQABAAABAQCnew",
        fingerprintSha256: "SHA256:new-rsa"
      }
    ]
  });

  const refreshed = await harness.lifecycle.refreshSshTrustEntries({ silent: true });
  assert.equal(refreshed.length, 1);

  const probeResult = await harness.lifecycle.probeSshHostKeysForTarget({ host: "carpo.uberspace.de", port: 22 }, { silent: true });
  assert.equal(probeResult.candidates[0].fingerprintSha256, "SHA256:new-rsa");
  assert.equal(harness.state.sshProbeTargetKey, "carpo.uberspace.de:22");

  const replaceResult = await harness.lifecycle.replaceTrustEntryForTarget({ host: "carpo.uberspace.de", port: 22 }, "ssh-rsa", { silent: true });
  assert.match(replaceResult.feedback, /Replaced trusted SSH host key/);
  assert.equal(harness.state.selectedSshTrustEntryId.includes("created"), true);
  assert.equal(harness.trustEntries.some((entry) => entry.publicKey === "AAAAB3NzaC1yc2EAAAADAQABAAABAQCold"), false);

  const deleteResult = await harness.lifecycle.deleteTrustEntryForTarget({ host: "carpo.uberspace.de", port: 22 }, "ssh-rsa", { silent: true });
  assert.match(deleteResult.feedback, /Deleted trusted SSH host key/);
  assert.equal(harness.trustEntries.length, 0);
});

test("SSH lifecycle reports rotation guidance on trust conflict and restores old trust on failed replacement", async () => {
  const trustEntries = [
    {
      id: "trust-rsa-old",
      host: "carpo.uberspace.de",
      port: 22,
      keyType: "ssh-rsa",
      publicKey: "AAAAB3NzaC1yc2EAAAADAQABAAABAQCold",
      fingerprintSha256: "SHA256:old-rsa"
    }
  ];
  let createCount = 0;
  const harness = createHarness({
    currentTarget: { host: "carpo.uberspace.de", port: 22 },
    state: {
      sshTrustEntries: trustEntries.slice(),
      sshProbeTargetKey: "carpo.uberspace.de:22",
      sshHostKeyProbeCandidates: [
        {
          id: "carpo.uberspace.de:22:ssh-rsa:SHA256:new-rsa",
          host: "carpo.uberspace.de",
          port: 22,
          keyType: "ssh-rsa",
          publicKey: "AAAAB3NzaC1yc2EAAAADAQABAAABAQCnew",
          fingerprintSha256: "SHA256:new-rsa"
        }
      ],
      selectedSshProbeCandidateId: "carpo.uberspace.de:22:ssh-rsa:SHA256:new-rsa"
    },
    trustEntries,
    api: {
      async createSshTrustEntry(payload) {
        createCount += 1;
        if (createCount === 1) {
          const error = new Error("conflict");
          error.status = 409;
          error.error = "SshHostKeyTrustConflict";
          throw error;
        }
        if (createCount === 2) {
          throw new Error("backend create failed");
        }
        const restored = {
          id: "trust-rsa-restored",
          host: payload.host,
          port: payload.port,
          keyType: payload.keyType,
          publicKey: payload.publicKey,
          fingerprintSha256: "SHA256:old-rsa"
        };
        trustEntries.push(restored);
        return restored;
      },
      async deleteSshTrustEntry(entryId) {
        const index = trustEntries.findIndex((entry) => entry.id === entryId);
        if (index >= 0) {
          trustEntries.splice(index, 1);
        }
      },
      async listSshTrustEntries() {
        return trustEntries.slice();
      }
    }
  });

  const conflictFeedback = await harness.lifecycle.saveTrustEntryFlow();
  assert.match(conflictFeedback, /rotation review required/i);

  await assert.rejects(
    () => harness.lifecycle.replaceTrustEntryForTarget({ host: "carpo.uberspace.de", port: 22 }, "ssh-rsa", { refresh: false }),
    /Restored the previous trusted fingerprint SHA256:old-rsa\. backend create failed/
  );
  assert.equal(trustEntries[0].fingerprintSha256, "SHA256:old-rsa");
});

test("SSH lifecycle error and fallback branches stay deterministic", async () => {
  const missingApiLifecycle = createConnectionProfileSshLifecycle({
    authMethodRequiresSecret: () => true,
    describeSshLaunchContext: () => ({ label: "Direct SSH", target: "ixpqtwnk@carpo.uberspace.de:22" }),
    getState: () => ({
      sshTrustEntries: [],
      selectedSshTrustEntryId: "",
      sshHostKeyProbeCandidates: [],
      selectedSshProbeCandidateId: "",
      probingSshHostKeys: false,
      sshProbeTargetKey: "",
      loadingSshTrustEntries: false
    }),
    getCurrentSshTrustTarget: () => null,
    getSshProbeCandidatesForTarget: () => [],
    getSshTrustEntriesForTarget: () => [],
    shouldRenderSshTrustTarget: () => false
  });

  assert.deepEqual(await missingApiLifecycle.refreshSshTrustEntries({ silent: true }), []);
  assert.equal(
    await missingApiLifecycle.ensureTrustedHostKeyBeforeLaunch({ launch: { kind: "local" } }),
    ""
  );
  await assert.rejects(
    () => missingApiLifecycle.promptForLaunchSecret({
      launch: {
        remoteAuth: { method: "password" },
        remoteConnection: { host: "carpo.uberspace.de", port: 22 }
      }
    }),
    /runtime-secret prompt is unavailable/i
  );
  await assert.rejects(
    () => missingApiLifecycle.ensureTrustedHostKeyBeforeLaunch({
      launch: {
        kind: "ssh",
        remoteConnection: { host: "", port: 22 }
      }
    }),
    /Enter an SSH host and port/i
  );
  await assert.rejects(
    () => missingApiLifecycle.probeSshHostKeysFlow(),
    /Enter an SSH host and port before fetching host keys/i
  );
  await assert.rejects(
    () => missingApiLifecycle.saveTrustEntryFlow(),
    /Enter an SSH host and port before trusting a host key/i
  );
  await assert.rejects(
    () => missingApiLifecycle.replaceTrustEntryFlow(),
    /Enter an SSH host and port before replacing a trusted host key/i
  );
  await assert.rejects(
    () => missingApiLifecycle.deleteTrustEntryFlow(),
    /Select a trusted SSH host key to delete/i
  );

  const noConflictHarness = createHarness({
    currentTarget: { host: "carpo.uberspace.de", port: 22 },
    state: {
      sshProbeTargetKey: "carpo.uberspace.de:22",
      sshHostKeyProbeCandidates: [
        {
          id: "carpo.uberspace.de:22:ssh-ed25519:SHA256:ed-current",
          host: "carpo.uberspace.de",
          port: 22,
          keyType: "ssh-ed25519",
          publicKey: "ed-current",
          fingerprintSha256: "SHA256:ed-current"
        }
      ],
      selectedSshProbeCandidateId: "carpo.uberspace.de:22:ssh-ed25519:SHA256:ed-current"
    },
    trustEntries: [
      {
        id: "trust-ed",
        host: "carpo.uberspace.de",
        port: 22,
        keyType: "ssh-ed25519",
        publicKey: "ed-current",
        fingerprintSha256: "SHA256:ed-current"
      }
    ],
    probeCandidates: [
      {
        keyType: "ssh-ed25519",
        publicKey: "ed-current",
        fingerprintSha256: "SHA256:ed-current"
      }
    ]
  });
  await assert.rejects(
    () => noConflictHarness.lifecycle.replaceTrustEntryForTarget(
      { host: "carpo.uberspace.de", port: 22 },
      "ssh-ed25519",
      { refresh: false }
    ),
    /No conflicting trusted SSH host key is selected/i
  );

  const restoreFailureTrustEntries = [
    {
      id: "trust-rsa-old",
      host: "carpo.uberspace.de",
      port: 22,
      keyType: "ssh-rsa",
      publicKey: "AAAAB3NzaC1yc2EAAAADAQABAAABAQCold",
      fingerprintSha256: "SHA256:old-rsa"
    }
  ];
  const restoreFailureHarness = createHarness({
    currentTarget: { host: "carpo.uberspace.de", port: 22 },
    state: {
      sshTrustEntries: restoreFailureTrustEntries.slice(),
      sshProbeTargetKey: "carpo.uberspace.de:22",
      sshHostKeyProbeCandidates: [
        {
          id: "carpo.uberspace.de:22:ssh-rsa:SHA256:new-rsa",
          host: "carpo.uberspace.de",
          port: 22,
          keyType: "ssh-rsa",
          publicKey: "AAAAB3NzaC1yc2EAAAADAQABAAABAQCnew",
          fingerprintSha256: "SHA256:new-rsa"
        }
      ],
      selectedSshProbeCandidateId: "carpo.uberspace.de:22:ssh-rsa:SHA256:new-rsa"
    },
    trustEntries: restoreFailureTrustEntries,
    api: {
      async createSshTrustEntry() {
        throw new Error("replacement create failed");
      },
      async deleteSshTrustEntry(entryId) {
        const index = restoreFailureTrustEntries.findIndex((entry) => entry.id === entryId);
        if (index >= 0) {
          restoreFailureTrustEntries.splice(index, 1);
        }
      },
      async listSshTrustEntries() {
        return restoreFailureTrustEntries.slice();
      }
    }
  });
  await assert.rejects(
    () => restoreFailureHarness.lifecycle.replaceTrustEntryForTarget(
      { host: "carpo.uberspace.de", port: 22 },
      "ssh-rsa",
      { refresh: false }
    ),
    /could not be restored automatically/i
  );
});
