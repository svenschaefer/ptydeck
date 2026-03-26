import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const openapiPath = fileURLToPath(new URL("../../backend/openapi/openapi.yaml", import.meta.url));
const apiTypesPath = fileURLToPath(new URL("../src/public/api-types.d.ts", import.meta.url));

test("generated frontend api types stay aligned with backend openapi markers", async () => {
  const [openapi, apiTypes] = await Promise.all([
    readFile(openapiPath, "utf8"),
    readFile(apiTypesPath, "utf8")
  ]);

  const requiredOpenApiMarkers = [
    "operationId: createWsTicket",
    "operationId: listDecks",
    "operationId: listCustomCommands",
    "operationId: createSession",
    "Deck:",
    "Session:",
    "CustomCommand:",
    "SessionInputSafetyProfile:",
    "SessionThemeProfile:",
    "deckId:",
    "tags:",
    "inputSafetyProfile:",
    "themeProfile:"
  ];
  for (const marker of requiredOpenApiMarkers) {
    assert.ok(openapi.includes(marker), `expected OpenAPI marker ${marker}`);
  }

  const requiredGeneratedTypeMarkers = [
    "export type DeckSettings = Record<string, unknown>;",
    "export type SessionInputSafetyProfile = {",
    "export type SessionThemeProfile = {",
    "export type Deck = {",
    "settings: DeckSettings;",
    "export type Session = {",
    "deckId: string;",
    "inputSafetyProfile: SessionInputSafetyProfile;",
    "state: \"starting\" | \"running\" | \"unrestored\";",
    "startedAt?: number | null;",
    "exitCode?: number | null;",
    "exitSignal?: string;",
    "exitedAt?: number | null;",
    "tags: string[];",
    "themeProfile?: SessionThemeProfile;",
    "export type CustomCommand = {",
    "content: string;",
    "export type UpsertCustomCommandRequest = {",
    "export type AuthTokenResponse = {",
    "accessToken: string;",
    "export type WsTicketResponse = {",
    "ticket: string;"
  ];
  for (const marker of requiredGeneratedTypeMarkers) {
    assert.ok(apiTypes.includes(marker), `expected generated api type marker ${marker}`);
  }
});
