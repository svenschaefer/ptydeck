import { homedir } from "node:os";

import { ApiError } from "./errors.js";

const DEFAULT_SSH_CLIENT = "ssh";
const DEFAULT_SSH_PORT = 22;
const SESSION_KIND_SSH = "ssh";
const SSH_AUTH_METHOD_PASSWORD = "password";
const SSH_AUTH_METHOD_PRIVATE_KEY = "privateKey";
const SSH_AUTH_METHOD_KEYBOARD_INTERACTIVE = "keyboardInteractive";
const REMOTE_HOST_MAX_LENGTH = 255;
const REMOTE_USERNAME_MAX_LENGTH = 64;
const REMOTE_PRIVATE_KEY_PATH_MAX_LENGTH = 1024;
const REMOTE_SECRET_MAX_LENGTH = 4096;
const REMOTE_NON_WHITESPACE_PATTERN = /^\S+$/;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function normalizeRemoteConnection(remoteConnection, kind) {
  if (kind !== SESSION_KIND_SSH) {
    if (remoteConnection !== undefined && remoteConnection !== null) {
      throw new ApiError(400, "ValidationError", "Field 'remoteConnection' is only supported for ssh sessions.");
    }
    return undefined;
  }
  if (!remoteConnection || typeof remoteConnection !== "object" || Array.isArray(remoteConnection)) {
    throw new ApiError(
      400,
      "ValidationError",
      "Field 'remoteConnection' is required for ssh sessions and must be an object."
    );
  }
  for (const unsupportedField of ["proxyJump", "proxyCommand", "forwardAgent", "forwardX11", "sshOptions"]) {
    if (Object.prototype.hasOwnProperty.call(remoteConnection, unsupportedField)) {
      throw new ApiError(
        400,
        "ValidationError",
        `Field 'remoteConnection.${unsupportedField}' is not supported in the H38 remote baseline.`
      );
    }
  }
  const host = typeof remoteConnection.host === "string" ? remoteConnection.host.trim() : "";
  if (!host || host.length > REMOTE_HOST_MAX_LENGTH || !REMOTE_NON_WHITESPACE_PATTERN.test(host)) {
    throw new ApiError(
      400,
      "ValidationError",
      "Field 'remoteConnection.host' must be a non-empty hostname or address without whitespace."
    );
  }
  const port =
    remoteConnection.port === undefined || remoteConnection.port === null ? DEFAULT_SSH_PORT : Number(remoteConnection.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ApiError(400, "ValidationError", "Field 'remoteConnection.port' must be an integer between 1 and 65535.");
  }
  const usernameRaw = typeof remoteConnection.username === "string" ? remoteConnection.username.trim() : "";
  if (
    usernameRaw &&
    (usernameRaw.length > REMOTE_USERNAME_MAX_LENGTH || !REMOTE_NON_WHITESPACE_PATTERN.test(usernameRaw))
  ) {
    throw new ApiError(
      400,
      "ValidationError",
      "Field 'remoteConnection.username' must be a non-empty token without whitespace."
    );
  }
  return {
    host,
    port,
    ...(usernameRaw ? { username: usernameRaw } : {})
  };
}

export function normalizeRemoteAuth(remoteAuth, kind) {
  if (kind !== SESSION_KIND_SSH) {
    if (remoteAuth !== undefined && remoteAuth !== null) {
      throw new ApiError(400, "ValidationError", "Field 'remoteAuth' is only supported for ssh sessions.");
    }
    return undefined;
  }
  if (remoteAuth === undefined || remoteAuth === null) {
    return { method: SSH_AUTH_METHOD_PRIVATE_KEY };
  }
  if (!isPlainObject(remoteAuth)) {
    throw new ApiError(400, "ValidationError", "Field 'remoteAuth' must be an object for ssh sessions.");
  }
  for (const unsupportedField of ["proxyJump", "proxyCommand", "forwardAgent", "forwardX11", "sshOptions"]) {
    if (Object.prototype.hasOwnProperty.call(remoteAuth, unsupportedField)) {
      throw new ApiError(
        400,
        "ValidationError",
        `Field 'remoteAuth.${unsupportedField}' is not supported in the H38 authentication baseline.`
      );
    }
  }
  const method =
    typeof remoteAuth.method === "string" && remoteAuth.method.trim()
      ? remoteAuth.method.trim()
      : SSH_AUTH_METHOD_PRIVATE_KEY;
  if (
    method !== SSH_AUTH_METHOD_PASSWORD &&
    method !== SSH_AUTH_METHOD_PRIVATE_KEY &&
    method !== SSH_AUTH_METHOD_KEYBOARD_INTERACTIVE
  ) {
    throw new ApiError(
      400,
      "ValidationError",
      "Field 'remoteAuth.method' must be 'password', 'privateKey', or 'keyboardInteractive'."
    );
  }
  const privateKeyPath = typeof remoteAuth.privateKeyPath === "string" ? remoteAuth.privateKeyPath.trim() : "";
  if (method !== SSH_AUTH_METHOD_PRIVATE_KEY && privateKeyPath) {
    throw new ApiError(
      400,
      "ValidationError",
      "Field 'remoteAuth.privateKeyPath' is only supported for privateKey ssh auth."
    );
  }
  if (privateKeyPath && privateKeyPath.length > REMOTE_PRIVATE_KEY_PATH_MAX_LENGTH) {
    throw new ApiError(
      400,
      "ValidationError",
      `Field 'remoteAuth.privateKeyPath' must not exceed ${REMOTE_PRIVATE_KEY_PATH_MAX_LENGTH} characters.`
    );
  }
  return {
    method,
    ...(privateKeyPath ? { privateKeyPath } : {})
  };
}

export function remoteAuthRequiresSecret(remoteAuth) {
  if (!remoteAuth) {
    return false;
  }
  return (
    remoteAuth.method === SSH_AUTH_METHOD_PASSWORD ||
    remoteAuth.method === SSH_AUTH_METHOD_KEYBOARD_INTERACTIVE
  );
}

export function normalizeRemoteSecret(remoteSecret, remoteAuth, kind) {
  if (kind !== SESSION_KIND_SSH) {
    if (remoteSecret !== undefined && remoteSecret !== null) {
      throw new ApiError(400, "ValidationError", "Field 'remoteSecret' is only supported for ssh sessions.");
    }
    return undefined;
  }
  if (remoteSecret === undefined || remoteSecret === null) {
    if (remoteAuthRequiresSecret(remoteAuth)) {
      throw new ApiError(
        400,
        "ValidationError",
        "Field 'remoteSecret' is required for password and keyboardInteractive ssh auth."
      );
    }
    return undefined;
  }
  if (!remoteAuthRequiresSecret(remoteAuth)) {
    throw new ApiError(
      400,
      "ValidationError",
      "Field 'remoteSecret' is only supported for password and keyboardInteractive ssh auth."
    );
  }
  if (typeof remoteSecret !== "string" || remoteSecret.length < 1 || remoteSecret.length > REMOTE_SECRET_MAX_LENGTH) {
    throw new ApiError(
      400,
      "ValidationError",
      `Field 'remoteSecret' must be a non-empty string up to ${REMOTE_SECRET_MAX_LENGTH} characters.`
    );
  }
  return remoteSecret;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function buildSshRemoteCommand({ startCwd, startCommand }) {
  const steps = [];
  if (typeof startCwd === "string" && startCwd.trim() && startCwd.trim() !== "~") {
    steps.push(`cd -- ${shellQuote(startCwd.trim())} >/dev/null 2>&1 || true`);
  }
  if (typeof startCommand === "string" && startCommand.trim()) {
    steps.push(startCommand);
  }
  if (steps.length === 0) {
    return "";
  }
  steps.push('exec "${SHELL:-/bin/sh}" -il');
  return `sh -lc ${shellQuote(steps.join("; "))}`;
}

function buildLocalStartupSubmitPayload(startCommand) {
  const normalized = typeof startCommand === "string" ? startCommand.replace(/\r\n/g, "\n").replace(/\r/g, "\n") : "";
  const trimmed = normalized.replace(/\n+$/g, "");
  if (!trimmed) {
    return "";
  }
  return `${trimmed}\r`;
}

export function buildSessionLaunchSpec({
  kind,
  shell,
  spawnCwd,
  startCwd,
  startCommand,
  remoteConnection,
  remoteAuth,
  remoteSecret,
  sshAskpassPath,
  sshKnownHostsPath
}) {
  if (kind !== SESSION_KIND_SSH) {
    return {
      shellAdapterId: shell,
      command: shell,
      args: [],
      spawnCwd,
      metaCwd: spawnCwd,
      ptyEnvAdditions: {},
      postStartInput: buildLocalStartupSubmitPayload(startCommand)
    };
  }

  const sshClient = typeof shell === "string" && shell.trim() ? shell.trim() : DEFAULT_SSH_CLIENT;
  const args = [
    "-tt",
    "-o",
    "ClearAllForwardings=yes",
    "-o",
    "ForwardAgent=no",
    "-o",
    "ForwardX11=no",
    "-o",
    "StrictHostKeyChecking=yes",
    "-o",
    `UserKnownHostsFile=${sshKnownHostsPath}`,
    "-o",
    "GlobalKnownHostsFile=/dev/null"
  ];
  if (remoteAuth?.method === SSH_AUTH_METHOD_PASSWORD) {
    args.push(
      "-o",
      "PreferredAuthentications=password",
      "-o",
      "PubkeyAuthentication=no",
      "-o",
      "KbdInteractiveAuthentication=no",
      "-o",
      "NumberOfPasswordPrompts=1"
    );
  } else if (remoteAuth?.method === SSH_AUTH_METHOD_KEYBOARD_INTERACTIVE) {
    args.push(
      "-o",
      "PreferredAuthentications=keyboard-interactive",
      "-o",
      "PubkeyAuthentication=no",
      "-o",
      "KbdInteractiveAuthentication=yes",
      "-o",
      "NumberOfPasswordPrompts=1"
    );
  } else {
    args.push(
      "-o",
      "PreferredAuthentications=publickey",
      "-o",
      "PasswordAuthentication=no",
      "-o",
      "KbdInteractiveAuthentication=no"
    );
    if (typeof remoteAuth?.privateKeyPath === "string" && remoteAuth.privateKeyPath) {
      args.push("-i", remoteAuth.privateKeyPath);
    }
  }
  if (remoteConnection.port !== DEFAULT_SSH_PORT) {
    args.push("-p", String(remoteConnection.port));
  }
  if (typeof remoteConnection.username === "string" && remoteConnection.username.trim()) {
    args.push("-l", remoteConnection.username.trim());
  }
  args.push(remoteConnection.host);
  const remoteCommand = buildSshRemoteCommand({ startCwd, startCommand });
  if (remoteCommand) {
    args.push(remoteCommand);
  }

  const ptyEnvAdditions = {};
  if (remoteAuthRequiresSecret(remoteAuth)) {
    ptyEnvAdditions.DISPLAY = "ptydeck-ssh-askpass";
    ptyEnvAdditions.SSH_ASKPASS_REQUIRE = "force";
    ptyEnvAdditions.SSH_ASKPASS = sshAskpassPath;
    ptyEnvAdditions.PTYDECK_SSH_SECRET = remoteSecret;
  }

  return {
    shellAdapterId: DEFAULT_SSH_CLIENT,
    command: sshClient,
    args,
    spawnCwd: homedir(),
    metaCwd: startCwd,
    ptyEnvAdditions,
    postStartInput: ""
  };
}
