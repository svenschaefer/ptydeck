import { basename } from "node:path";

const CWD_MARKER_START = "__CWD__";
const CWD_MARKER_END = "__";
const BASH_CWD_MARKER_COMMAND = 'printf "__CWD__%s__\\n" "$PWD"';

const SHELL_CWD_TRACKING_CAPABILITY_MATRIX = Object.freeze({
  bash: Object.freeze({
    family: "bash",
    shellNames: Object.freeze(["bash"]),
    cwdTrackingSupported: true,
    cwdTrackingMode: "prompt_command_marker",
    fallbackBehavior: "n/a"
  }),
  zsh: Object.freeze({
    family: "zsh",
    shellNames: Object.freeze(["zsh"]),
    cwdTrackingSupported: false,
    cwdTrackingMode: "unsupported",
    fallbackBehavior: "retain_last_known_cwd"
  }),
  fish: Object.freeze({
    family: "fish",
    shellNames: Object.freeze(["fish"]),
    cwdTrackingSupported: false,
    cwdTrackingMode: "unsupported",
    fallbackBehavior: "retain_last_known_cwd"
  }),
  posix_sh: Object.freeze({
    family: "posix_sh",
    shellNames: Object.freeze(["sh", "dash", "ash", "busybox"]),
    cwdTrackingSupported: false,
    cwdTrackingMode: "unsupported",
    fallbackBehavior: "retain_last_known_cwd"
  }),
  unknown: Object.freeze({
    family: "unknown",
    shellNames: Object.freeze([]),
    cwdTrackingSupported: false,
    cwdTrackingMode: "unsupported",
    fallbackBehavior: "retain_last_known_cwd"
  })
});

function normalizeShellBasename(shell) {
  return basename(String(shell || "")).toLowerCase();
}

function cloneCapability(capability) {
  return {
    family: capability.family,
    shellNames: capability.shellNames.slice(),
    cwdTrackingSupported: capability.cwdTrackingSupported,
    cwdTrackingMode: capability.cwdTrackingMode,
    fallbackBehavior: capability.fallbackBehavior
  };
}

function resolveShellCapability(shell) {
  const shellName = normalizeShellBasename(shell);
  if (shellName.includes("bash")) {
    return cloneCapability(SHELL_CWD_TRACKING_CAPABILITY_MATRIX.bash);
  }
  if (shellName.includes("zsh")) {
    return cloneCapability(SHELL_CWD_TRACKING_CAPABILITY_MATRIX.zsh);
  }
  if (shellName.includes("fish")) {
    return cloneCapability(SHELL_CWD_TRACKING_CAPABILITY_MATRIX.fish);
  }
  if (
    shellName === "sh" ||
    shellName.includes("dash") ||
    shellName.includes("ash") ||
    shellName.includes("busybox")
  ) {
    return cloneCapability(SHELL_CWD_TRACKING_CAPABILITY_MATRIX.posix_sh);
  }
  return cloneCapability(SHELL_CWD_TRACKING_CAPABILITY_MATRIX.unknown);
}

function consumeCwdMarkers(session, chunk) {
  const combined = `${session.cwdTrackingBuffer || ""}${chunk}`;
  let dataForScan = combined;
  session.cwdTrackingBuffer = "";

  const lastStart = dataForScan.lastIndexOf(CWD_MARKER_START);
  if (lastStart >= 0) {
    const endFromLast = dataForScan.indexOf(CWD_MARKER_END, lastStart + CWD_MARKER_START.length);
    if (endFromLast < 0) {
      session.cwdTrackingBuffer = dataForScan.slice(lastStart);
      dataForScan = dataForScan.slice(0, lastStart);
    }
  }

  const markerRegex = /__CWD__(.*?)__/g;
  let match = markerRegex.exec(dataForScan);
  let lastCwdCandidate = "";
  while (match) {
    lastCwdCandidate = String(match[1] || "").trim();
    match = markerRegex.exec(dataForScan);
  }
  if (lastCwdCandidate) {
    session.meta.cwd = lastCwdCandidate;
  }

  return dataForScan.replace(/__CWD__(.*?)__\r?\n?/g, "");
}

function createUnsupportedShellAdapter(capability) {
  return {
    capability,
    prepareSpawnEnv(env) {
      return { ...env };
    },
    consumeOutput(_session, chunk) {
      return String(chunk || "");
    }
  };
}

export function createShellAdapter(shell) {
  const capability = resolveShellCapability(shell);
  if (!capability.cwdTrackingSupported) {
    return createUnsupportedShellAdapter(capability);
  }

  return {
    capability,
    prepareSpawnEnv(env) {
      const nextEnv = { ...env };
      const existing = typeof nextEnv.PROMPT_COMMAND === "string" ? nextEnv.PROMPT_COMMAND.trim() : "";
      nextEnv.PROMPT_COMMAND = existing
        ? `${BASH_CWD_MARKER_COMMAND};${existing}`
        : BASH_CWD_MARKER_COMMAND;
      return nextEnv;
    },
    consumeOutput(session, chunk) {
      return consumeCwdMarkers(session, chunk);
    }
  };
}

export function listShellCwdTrackingCapabilities() {
  return Object.values(SHELL_CWD_TRACKING_CAPABILITY_MATRIX).map((capability) => cloneCapability(capability));
}
