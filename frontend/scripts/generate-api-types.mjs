import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const openapiPath = join(repoRoot, "backend", "openapi", "openapi.yaml");
const outputPath = join(repoRoot, "frontend", "src", "public", "api-types.d.ts");

const openapi = await readFile(openapiPath, "utf8");

const requiredMarkers = [
  "Deck:",
  "CreateDeckRequest:",
  "UpdateDeckRequest:",
  "Session:",
  "CreateSessionRequest:",
  "UpdateSessionRequest:",
  "RemoteConnection:",
  "RemoteAuth:",
  "SessionMouseForwardingMode:",
  "SessionInputSafetyProfile:",
  "SessionThemeProfile:",
  "CustomCommand:",
  "UpsertCustomCommandRequest:",
  "CreateDevTokenRequest:",
  "AuthTokenResponse:",
  "WsTicketResponse:",
  "ErrorResponse:"
];
for (const marker of requiredMarkers) {
  if (!openapi.includes(marker)) {
    throw new Error(`OpenAPI schema marker missing: ${marker}`);
  }
}

const types = `/* Auto-generated from backend/openapi/openapi.yaml. Do not edit manually. */

export type DeckSettings = Record<string, unknown>;

export type RemoteConnection = {
  host: string;
  port: number;
  username?: string;
};

export type RemoteAuth = {
  method: "password" | "privateKey" | "keyboardInteractive";
  privateKeyPath?: string;
};

export type SessionMouseForwardingMode = "off" | "application";

export type SessionInputSafetyProfile = {
  requireValidShellSyntax: boolean;
  confirmOnIncompleteShellConstruct: boolean;
  confirmOnNaturalLanguageInput: boolean;
  confirmOnDangerousShellCommand: boolean;
  confirmOnMultilineInput: boolean;
  confirmOnRecentTargetSwitch: boolean;
  targetSwitchGraceMs: number;
  pasteLengthConfirmThreshold: number;
  pasteLineConfirmThreshold: number;
};

export type SessionThemeProfile = {
  background: string;
  foreground: string;
  cursor: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
};

export type Deck = {
  id: string;
  name: string;
  settings: DeckSettings;
  createdAt: number;
  updatedAt: number;
};

export type CreateDeckRequest = {
  id?: string;
  name: string;
  settings?: DeckSettings;
};

export type UpdateDeckRequest = {
  name?: string;
  settings?: DeckSettings;
};

export type Session = {
  id: string;
  deckId: string;
  state: "starting" | "running" | "unrestored";
  activityState: "active" | "inactive";
  activityUpdatedAt: number;
  kind: "local" | "ssh";
  cwd: string;
  shell: string;
  remoteConnection?: RemoteConnection;
  remoteAuth?: RemoteAuth;
  tags: string[];
  mouseForwardingMode: SessionMouseForwardingMode;
  inputSafetyProfile: SessionInputSafetyProfile;
  name?: string;
  startCwd?: string;
  startCommand?: string;
  env?: Record<string, string>;
  themeProfile?: SessionThemeProfile;
  activeThemeProfile?: SessionThemeProfile;
  inactiveThemeProfile?: SessionThemeProfile;
  createdAt: number;
  updatedAt: number;
  startedAt?: number | null;
  activityCompletedAt?: number | null;
  exitCode?: number | null;
  exitSignal?: string;
  exitedAt?: number | null;
};

export type CreateSessionRequest = {
  kind?: "local" | "ssh";
  cwd?: string;
  shell?: string;
  remoteConnection?: RemoteConnection;
  remoteAuth?: RemoteAuth;
  remoteSecret?: string;
  name?: string;
  mouseForwardingMode?: SessionMouseForwardingMode;
  inputSafetyProfile?: SessionInputSafetyProfile;
  startCwd?: string;
  startCommand?: string;
  env?: Record<string, string>;
  tags?: string[];
  themeProfile?: SessionThemeProfile;
  activeThemeProfile?: SessionThemeProfile;
  inactiveThemeProfile?: SessionThemeProfile;
};

export type UpdateSessionRequest = {
  kind?: "local" | "ssh";
  remoteConnection?: RemoteConnection;
  remoteAuth?: RemoteAuth;
  remoteSecret?: string;
  name?: string;
  mouseForwardingMode?: SessionMouseForwardingMode;
  inputSafetyProfile?: SessionInputSafetyProfile;
  startCwd?: string;
  startCommand?: string;
  env?: Record<string, string>;
  tags?: string[];
  themeProfile?: SessionThemeProfile;
  activeThemeProfile?: SessionThemeProfile;
  inactiveThemeProfile?: SessionThemeProfile;
};

export type CustomCommand = {
  name: string;
  content: string;
  createdAt: number;
  updatedAt: number;
};

export type UpsertCustomCommandRequest = {
  content: string;
};

export type CreateDevTokenRequest = {
  subject?: string;
  tenantId?: string;
  scopes?: string[];
};

export type AuthTokenResponse = {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  scope: string;
};

export type WsTicketResponse = {
  ticket: string;
  tokenType: string;
  expiresIn: number;
};

export type ErrorResponse = {
  error: string;
  message: string;
};
`;

await writeFile(outputPath, types, "utf8");
console.log(`generated ${outputPath}`);
