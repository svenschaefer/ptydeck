export const THEME_IO_FORMAT_AUTO = "auto";
export const THEME_IO_FORMAT_PTYDECK = "ptydeck";
export const THEME_IO_FORMAT_ITERM2 = "iterm2";
export const THEME_IO_FORMAT_WINDOWS_TERMINAL = "windows-terminal";
export const THEME_IO_FORMAT_XRESOURCES = "xresources";

export const THEME_IO_FORMATS = Object.freeze([
  THEME_IO_FORMAT_PTYDECK,
  THEME_IO_FORMAT_ITERM2,
  THEME_IO_FORMAT_WINDOWS_TERMINAL,
  THEME_IO_FORMAT_XRESOURCES
]);

const THEME_PROFILE_KEY_LABELS = Object.freeze({
  background: "Background",
  foreground: "Foreground",
  cursor: "Cursor",
  black: "Black",
  red: "Red",
  green: "Green",
  yellow: "Yellow",
  blue: "Blue",
  magenta: "Magenta",
  cyan: "Cyan",
  white: "White",
  brightBlack: "Bright Black",
  brightRed: "Bright Red",
  brightGreen: "Bright Green",
  brightYellow: "Bright Yellow",
  brightBlue: "Bright Blue",
  brightMagenta: "Bright Magenta",
  brightCyan: "Bright Cyan",
  brightWhite: "Bright White"
});

const ITERM2_COLOR_KEYS = Object.freeze({
  background: "Background Color",
  foreground: "Foreground Color",
  cursor: "Cursor Color",
  black: "Ansi 0 Color",
  red: "Ansi 1 Color",
  green: "Ansi 2 Color",
  yellow: "Ansi 3 Color",
  blue: "Ansi 4 Color",
  magenta: "Ansi 5 Color",
  cyan: "Ansi 6 Color",
  white: "Ansi 7 Color",
  brightBlack: "Ansi 8 Color",
  brightRed: "Ansi 9 Color",
  brightGreen: "Ansi 10 Color",
  brightYellow: "Ansi 11 Color",
  brightBlue: "Ansi 12 Color",
  brightMagenta: "Ansi 13 Color",
  brightCyan: "Ansi 14 Color",
  brightWhite: "Ansi 15 Color"
});

const WINDOWS_TERMINAL_COLOR_KEYS = Object.freeze({
  background: "background",
  foreground: "foreground",
  cursor: "cursorColor",
  black: "black",
  red: "red",
  green: "green",
  yellow: "yellow",
  blue: "blue",
  magenta: "purple",
  cyan: "cyan",
  white: "white",
  brightBlack: "brightBlack",
  brightRed: "brightRed",
  brightGreen: "brightGreen",
  brightYellow: "brightYellow",
  brightBlue: "brightBlue",
  brightMagenta: "brightPurple",
  brightCyan: "brightCyan",
  brightWhite: "brightWhite"
});

const WINDOWS_TERMINAL_ALIASES = Object.freeze({
  cursor: ["cursorColor", "cursor"],
  magenta: ["purple", "magenta"],
  brightMagenta: ["brightPurple", "brightMagenta"]
});

const XRESOURCES_COLOR_KEYS = Object.freeze({
  background: "background",
  foreground: "foreground",
  cursor: "cursorColor",
  black: "color0",
  red: "color1",
  green: "color2",
  yellow: "color3",
  blue: "color4",
  magenta: "color5",
  cyan: "color6",
  white: "color7",
  brightBlack: "color8",
  brightRed: "color9",
  brightGreen: "color10",
  brightYellow: "color11",
  brightBlue: "color12",
  brightMagenta: "color13",
  brightCyan: "color14",
  brightWhite: "color15"
});

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLookupKey(value) {
  return normalizeText(value).toLowerCase().replace(/[\s_.-]+/g, "");
}

export function normalizeThemeIoFormat(value) {
  const normalized = normalizeLookupKey(value);
  if (!normalized) {
    return THEME_IO_FORMAT_AUTO;
  }
  if (["auto", "detect", "autodetect"].includes(normalized)) {
    return THEME_IO_FORMAT_AUTO;
  }
  if (["ptydeck", "native", "json", "profile"].includes(normalized)) {
    return THEME_IO_FORMAT_PTYDECK;
  }
  if (["iterm", "iterm2", "itermjson", "iterm2json"].includes(normalized)) {
    return THEME_IO_FORMAT_ITERM2;
  }
  if (["windowsterminal", "windows", "wt", "terminaljson"].includes(normalized)) {
    return THEME_IO_FORMAT_WINDOWS_TERMINAL;
  }
  if (["xresources", "xrdb", "xdefaults", "xresource"].includes(normalized)) {
    return THEME_IO_FORMAT_XRESOURCES;
  }
  return "";
}

function isSupportedFormat(format) {
  return THEME_IO_FORMATS.includes(format);
}

function normalizeThemeProfileKeys(themeProfileKeys) {
  return Array.isArray(themeProfileKeys)
    ? themeProfileKeys.map((key) => String(key || "").trim()).filter(Boolean)
    : [];
}

function normalizeHexColor(value) {
  const raw = normalizeText(value);
  if (!raw) {
    return "";
  }
  const rgbMatch = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i.exec(raw);
  if (rgbMatch) {
    return rgbToHex(Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3]));
  }
  const normalized = raw.replace(/^0x/i, "#");
  const hexMatch = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(normalized);
  if (!hexMatch) {
    return "";
  }
  const hex = hexMatch[1];
  if (hex.length === 3) {
    return `#${hex.split("").map((char) => `${char}${char}`).join("")}`.toLowerCase();
  }
  if (hex.length === 8) {
    return `#${hex.slice(2)}`.toLowerCase();
  }
  return `#${hex}`.toLowerCase();
}

function clampColorChannel(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  if (numeric >= 0 && numeric <= 1) {
    return Math.round(numeric * 255);
  }
  return Math.max(0, Math.min(255, Math.round(numeric)));
}

function rgbToHex(red, green, blue) {
  const channels = [red, green, blue].map((value) => Math.max(0, Math.min(255, Math.round(Number(value) || 0))));
  return `#${channels.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function parseComponentColor(value) {
  if (typeof value === "string") {
    return normalizeHexColor(value);
  }
  if (Array.isArray(value) && value.length >= 3) {
    return rgbToHex(clampColorChannel(value[0]), clampColorChannel(value[1]), clampColorChannel(value[2]));
  }
  if (!value || typeof value !== "object") {
    return "";
  }
  const red = value["Red Component"] ?? value.red ?? value.r;
  const green = value["Green Component"] ?? value.green ?? value.g;
  const blue = value["Blue Component"] ?? value.blue ?? value.b;
  if (red === undefined || green === undefined || blue === undefined) {
    return normalizeHexColor(value.hex || value.value || value.color || "");
  }
  return rgbToHex(clampColorChannel(red), clampColorChannel(green), clampColorChannel(blue));
}

function parseJsonObject(rawText, label) {
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    return {
      ok: false,
      error: `${label} JSON is invalid: ${error instanceof Error ? error.message : String(error)}`
    };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      error: `${label} JSON must be an object.`
    };
  }
  return { ok: true, value: parsed };
}

function getThemeProfileSource(value) {
  if (!value || typeof value !== "object") {
    return {};
  }
  if (value.profile && typeof value.profile === "object" && !Array.isArray(value.profile)) {
    return value.profile;
  }
  if (value.themeProfile && typeof value.themeProfile === "object" && !Array.isArray(value.themeProfile)) {
    return value.themeProfile;
  }
  if (value.colors && typeof value.colors === "object" && !Array.isArray(value.colors)) {
    return value.colors;
  }
  return value;
}

function parsePtydeckProfile(value, themeProfileKeys) {
  const source = getThemeProfileSource(value);
  const colors = {};
  const seen = [];
  for (const key of themeProfileKeys) {
    const color = normalizeHexColor(source[key]);
    if (color) {
      colors[key] = color;
      seen.push(key);
    }
  }
  return { colors, seen };
}

function parseIterm2Profile(value, themeProfileKeys) {
  const source = getThemeProfileSource(value);
  const colors = {};
  const seen = [];
  for (const key of themeProfileKeys) {
    const sourceKey = ITERM2_COLOR_KEYS[key];
    const directColor = normalizeHexColor(source[key]);
    const color = directColor || parseComponentColor(source[sourceKey]);
    if (color) {
      colors[key] = color;
      seen.push(key);
    }
  }
  return { colors, seen };
}

function parseWindowsTerminalProfile(value, themeProfileKeys) {
  const source = getThemeProfileSource(value);
  const colors = {};
  const seen = [];
  for (const key of themeProfileKeys) {
    const aliases = [WINDOWS_TERMINAL_COLOR_KEYS[key], ...(WINDOWS_TERMINAL_ALIASES[key] || []), key].filter(Boolean);
    let color = "";
    for (const alias of aliases) {
      color = normalizeHexColor(source[alias]);
      if (color) {
        break;
      }
    }
    if (color) {
      colors[key] = color;
      seen.push(key);
    }
  }
  return { colors, seen };
}

function parseXresourcesProfile(rawText, themeProfileKeys) {
  const source = {};
  const lines = String(rawText || "").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("!") || trimmed.startsWith("#")) {
      continue;
    }
    const match = /^(.+?)\s*:\s*(\S+)/.exec(trimmed);
    if (!match) {
      continue;
    }
    const keyToken = String(match[1] || "")
      .split(/[.*]/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .pop();
    if (!keyToken) {
      continue;
    }
    source[normalizeLookupKey(keyToken)] = match[2];
  }

  const colors = {};
  const seen = [];
  for (const key of themeProfileKeys) {
    const xresourceKey = XRESOURCES_COLOR_KEYS[key];
    const aliases = [
      xresourceKey,
      key,
      key === "cursor" ? "cursorcolor" : "",
      key === "brightBlack" ? "color8" : ""
    ].filter(Boolean);
    let color = "";
    for (const alias of aliases) {
      color = normalizeHexColor(source[normalizeLookupKey(alias)]);
      if (color) {
        break;
      }
    }
    if (color) {
      colors[key] = color;
      seen.push(key);
    }
  }
  return { colors, seen };
}

function mergeThemeProfile(colors, themeProfileKeys, fallbackProfile) {
  const normalized = {};
  for (const key of themeProfileKeys) {
    normalized[key] = colors[key] || normalizeHexColor(fallbackProfile?.[key]) || "#000000";
  }
  return normalized;
}

function detectJsonFormat(value) {
  const source = getThemeProfileSource(value);
  if (Object.keys(ITERM2_COLOR_KEYS).some((key) => Object.prototype.hasOwnProperty.call(source, ITERM2_COLOR_KEYS[key]))) {
    return THEME_IO_FORMAT_ITERM2;
  }
  if (["cursorColor", "brightPurple", "purple"].some((key) => Object.prototype.hasOwnProperty.call(source, key))) {
    return THEME_IO_FORMAT_WINDOWS_TERMINAL;
  }
  return THEME_IO_FORMAT_PTYDECK;
}

function parseThemePayloadByFormat(rawText, format, themeProfileKeys) {
  if (format === THEME_IO_FORMAT_XRESOURCES) {
    return { ok: true, ...parseXresourcesProfile(rawText, themeProfileKeys) };
  }

  const parsed = parseJsonObject(rawText, format === THEME_IO_FORMAT_ITERM2 ? "iTerm2 theme" : "Theme");
  if (!parsed.ok) {
    return parsed;
  }

  const detectedFormat = format === THEME_IO_FORMAT_AUTO ? detectJsonFormat(parsed.value) : format;
  if (detectedFormat === THEME_IO_FORMAT_ITERM2) {
    return { ok: true, format: detectedFormat, ...parseIterm2Profile(parsed.value, themeProfileKeys) };
  }
  if (detectedFormat === THEME_IO_FORMAT_WINDOWS_TERMINAL) {
    return { ok: true, format: detectedFormat, ...parseWindowsTerminalProfile(parsed.value, themeProfileKeys) };
  }
  return { ok: true, format: detectedFormat, ...parsePtydeckProfile(parsed.value, themeProfileKeys) };
}

export function parseExternalThemeProfile(rawPayload, options = {}) {
  const rawText = typeof rawPayload === "string" ? rawPayload.trim() : JSON.stringify(rawPayload || "");
  if (!rawText) {
    return { ok: false, error: "Theme import payload is empty." };
  }
  const themeProfileKeys = normalizeThemeProfileKeys(options.themeProfileKeys);
  if (themeProfileKeys.length === 0) {
    return { ok: false, error: "Theme import requires supported theme profile keys." };
  }
  let format = normalizeThemeIoFormat(options.format || THEME_IO_FORMAT_AUTO);
  if (!format) {
    return { ok: false, error: `Unsupported theme import format: ${options.format}` };
  }
  if (format === THEME_IO_FORMAT_AUTO && !rawText.startsWith("{")) {
    format = THEME_IO_FORMAT_XRESOURCES;
  }
  const parsed = parseThemePayloadByFormat(rawText, format, themeProfileKeys);
  if (!parsed.ok) {
    return parsed;
  }
  const resolvedFormat = parsed.format || format;
  if (!isSupportedFormat(resolvedFormat)) {
    return { ok: false, error: `Unsupported theme import format: ${resolvedFormat}` };
  }
  if (!Array.isArray(parsed.seen) || parsed.seen.length === 0) {
    return { ok: false, error: `No supported theme colors found in ${resolvedFormat} payload.` };
  }
  const fallbackProfile =
    options.baseThemeProfile && typeof options.baseThemeProfile === "object"
      ? options.baseThemeProfile
      : options.defaultThemeProfile;
  return {
    ok: true,
    format: resolvedFormat,
    profile: mergeThemeProfile(parsed.colors, themeProfileKeys, fallbackProfile),
    importedKeys: parsed.seen.slice()
  };
}

function hexToIterm2Component(hexColor) {
  const normalized = normalizeHexColor(hexColor) || "#000000";
  const red = parseInt(normalized.slice(1, 3), 16) / 255;
  const green = parseInt(normalized.slice(3, 5), 16) / 255;
  const blue = parseInt(normalized.slice(5, 7), 16) / 255;
  return {
    "Color Space": "sRGB",
    "Red Component": Number(red.toFixed(6)),
    "Green Component": Number(green.toFixed(6)),
    "Blue Component": Number(blue.toFixed(6)),
    "Alpha Component": 1
  };
}

function normalizeExportProfile(profile, themeProfileKeys, defaultThemeProfile) {
  const source = profile && typeof profile === "object" ? profile : {};
  const fallback = defaultThemeProfile && typeof defaultThemeProfile === "object" ? defaultThemeProfile : {};
  const normalized = {};
  for (const key of themeProfileKeys) {
    normalized[key] = normalizeHexColor(source[key]) || normalizeHexColor(fallback[key]) || "#000000";
  }
  return normalized;
}

function serializePtydeckProfile(profile) {
  return `${JSON.stringify(profile, null, 2)}\n`;
}

function serializeIterm2Profile(profile, themeProfileKeys) {
  const output = {};
  for (const key of themeProfileKeys) {
    const sourceKey = ITERM2_COLOR_KEYS[key];
    if (sourceKey) {
      output[sourceKey] = hexToIterm2Component(profile[key]);
    }
  }
  return `${JSON.stringify(output, null, 2)}\n`;
}

function serializeWindowsTerminalProfile(profile, themeProfileKeys, name) {
  const output = {};
  const normalizedName = normalizeText(name);
  if (normalizedName) {
    output.name = normalizedName;
  }
  for (const key of themeProfileKeys) {
    const sourceKey = WINDOWS_TERMINAL_COLOR_KEYS[key];
    if (sourceKey) {
      output[sourceKey] = profile[key];
    }
  }
  return `${JSON.stringify(output, null, 2)}\n`;
}

function serializeXresourcesProfile(profile, themeProfileKeys) {
  const lines = [];
  for (const key of themeProfileKeys) {
    const sourceKey = XRESOURCES_COLOR_KEYS[key];
    if (sourceKey) {
      lines.push(`*.${sourceKey}: ${profile[key]}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export function serializeExternalThemeProfile(profile, options = {}) {
  const themeProfileKeys = normalizeThemeProfileKeys(options.themeProfileKeys);
  if (themeProfileKeys.length === 0) {
    return { ok: false, error: "Theme export requires supported theme profile keys." };
  }
  const format = normalizeThemeIoFormat(options.format || THEME_IO_FORMAT_PTYDECK);
  if (!isSupportedFormat(format)) {
    return { ok: false, error: `Unsupported theme export format: ${options.format}` };
  }
  const normalizedProfile = normalizeExportProfile(profile, themeProfileKeys, options.defaultThemeProfile);
  if (format === THEME_IO_FORMAT_ITERM2) {
    return { ok: true, format, text: serializeIterm2Profile(normalizedProfile, themeProfileKeys) };
  }
  if (format === THEME_IO_FORMAT_WINDOWS_TERMINAL) {
    return { ok: true, format, text: serializeWindowsTerminalProfile(normalizedProfile, themeProfileKeys, options.name) };
  }
  if (format === THEME_IO_FORMAT_XRESOURCES) {
    return { ok: true, format, text: serializeXresourcesProfile(normalizedProfile, themeProfileKeys) };
  }
  return { ok: true, format, text: serializePtydeckProfile(normalizedProfile) };
}

export function formatThemeIoFormats() {
  return THEME_IO_FORMATS.join(", ");
}

export function getThemeProfileKeyLabel(key) {
  return THEME_PROFILE_KEY_LABELS[key] || String(key || "");
}
