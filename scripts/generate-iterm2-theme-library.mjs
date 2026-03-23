#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.argv[2];
const outFile = process.argv[3] || path.join(process.cwd(), "frontend/src/public/theme-library.js");
if (!repoRoot) {
  console.error("usage: node scripts/generate-iterm2-theme-library.mjs <iterm2-color-schemes-repo-path> [output-file]");
  process.exit(1);
}

const readmePath = path.join(repoRoot, "README.md");
const schemesDir = path.join(repoRoot, "schemes");
if (!fs.existsSync(readmePath) || !fs.existsSync(schemesDir)) {
  console.error("invalid upstream repo path; expected README.md and schemes/");
  process.exit(1);
}

const readme = fs.readFileSync(readmePath, "utf8");

function extractSection(startMarker, endMarker) {
  const start = readme.indexOf(startMarker);
  if (start < 0) return "";
  const afterStart = readme.slice(start + startMarker.length);
  if (!endMarker) return afterStart;
  const end = afterStart.indexOf(endMarker);
  if (end < 0) return afterStart;
  return afterStart.slice(0, end);
}

function extractThemeNamesFromSection(markdown) {
  const names = [];
  const lines = markdown.split(/\r?\n/);
  for (const line of lines) {
    const m = /^###\s+(.+?)\s*$/.exec(line.trim());
    if (!m) continue;
    const raw = m[1].replace(/<a.*$/i, "").trim();
    if (!raw) continue;
    if (raw.toLowerCase() === "dark themes" || raw.toLowerCase() === "light themes") continue;
    names.push(raw);
  }
  return names;
}

const darkSection = extractSection("### Dark Themes<a name=\"darkthemes\"><a/>", "### Light Themes<a name=\"lightthemes\"><a/>");
const lightSection = extractSection("### Light Themes<a name=\"lightthemes\"><a/>", "### X11 Installation");

const darkNames = extractThemeNamesFromSection(darkSection);
const lightNames = extractThemeNamesFromSection(lightSection);

const keyMap = {
  "Background Color": "background",
  "Foreground Color": "foreground",
  "Cursor Color": "cursor",
  "Ansi 0 Color": "black",
  "Ansi 1 Color": "red",
  "Ansi 2 Color": "green",
  "Ansi 3 Color": "yellow",
  "Ansi 4 Color": "blue",
  "Ansi 5 Color": "magenta",
  "Ansi 6 Color": "cyan",
  "Ansi 7 Color": "white",
  "Ansi 8 Color": "brightBlack",
  "Ansi 9 Color": "brightRed",
  "Ansi 10 Color": "brightGreen",
  "Ansi 11 Color": "brightYellow",
  "Ansi 12 Color": "brightBlue",
  "Ansi 13 Color": "brightMagenta",
  "Ansi 14 Color": "brightCyan",
  "Ansi 15 Color": "brightWhite"
};

const requiredKeys = Object.values(keyMap);

function clamp01(value) {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function toHex(rgbFloat) {
  const n = Math.round(clamp01(rgbFloat) * 255);
  return n.toString(16).padStart(2, "0");
}

function dictToHexColor(dictContent) {
  const redMatch = /<key>Red Component<\/key>\s*<(?:real|integer)>([^<]+)<\/(?:real|integer)>/i.exec(dictContent);
  const greenMatch = /<key>Green Component<\/key>\s*<(?:real|integer)>([^<]+)<\/(?:real|integer)>/i.exec(dictContent);
  const blueMatch = /<key>Blue Component<\/key>\s*<(?:real|integer)>([^<]+)<\/(?:real|integer)>/i.exec(dictContent);
  if (!redMatch || !greenMatch || !blueMatch) {
    return null;
  }
  const r = Number.parseFloat(redMatch[1]);
  const g = Number.parseFloat(greenMatch[1]);
  const b = Number.parseFloat(blueMatch[1]);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
    return null;
  }
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function parseScheme(filePath) {
  const xml = fs.readFileSync(filePath, "utf8");
  const profile = {};
  for (const [itermKey, appKey] of Object.entries(keyMap)) {
    const rx = new RegExp(`<key>${itermKey.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}<\\/key>\\s*<dict>([\\s\\S]*?)<\\/dict>`, "i");
    const m = rx.exec(xml);
    if (!m) {
      return null;
    }
    const hex = dictToHexColor(m[1]);
    if (!hex) {
      return null;
    }
    profile[appKey] = hex;
  }
  for (const key of requiredKeys) {
    if (!profile[key]) {
      return null;
    }
  }
  return profile;
}

function parseAlacrittyToml(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const content = fs.readFileSync(filePath, "utf8");
  const section = (name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = new RegExp(`\\[${escaped}\\]\\s*([\\s\\S]*?)(?:\\n\\s*\\[|$)`, "i").exec(content);
    return m ? m[1] : "";
  };
  const readColor = (block, key) => {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = new RegExp(`^\\s*${escaped}\\s*=\\s*['"](#(?:[0-9a-fA-F]{6}))['"]\\s*$`, "im").exec(block);
    return m ? m[1].toLowerCase() : null;
  };
  const primary = section("colors.primary");
  const cursor = section("colors.cursor");
  const normal = section("colors.normal");
  const bright = section("colors.bright");
  const profile = {
    background: readColor(primary, "background"),
    foreground: readColor(primary, "foreground"),
    cursor: readColor(cursor, "cursor"),
    black: readColor(normal, "black"),
    red: readColor(normal, "red"),
    green: readColor(normal, "green"),
    yellow: readColor(normal, "yellow"),
    blue: readColor(normal, "blue"),
    magenta: readColor(normal, "magenta"),
    cyan: readColor(normal, "cyan"),
    white: readColor(normal, "white"),
    brightBlack: readColor(bright, "black"),
    brightRed: readColor(bright, "red"),
    brightGreen: readColor(bright, "green"),
    brightYellow: readColor(bright, "yellow"),
    brightBlue: readColor(bright, "blue"),
    brightMagenta: readColor(bright, "magenta"),
    brightCyan: readColor(bright, "cyan"),
    brightWhite: readColor(bright, "white")
  };
  for (const key of requiredKeys) {
    if (!profile[key]) {
      return null;
    }
  }
  return profile;
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

const all = [];
const seenIds = new Set();
const missing = [];

function addThemes(names, category) {
  for (const name of names) {
    const filePath = path.join(schemesDir, `${name}.itermcolors`);
    if (!fs.existsSync(filePath)) {
      missing.push(`${category}: missing file for '${name}'`);
      continue;
    }
    let profile = parseScheme(filePath);
    if (!profile) {
      profile = parseAlacrittyToml(path.join(repoRoot, "alacritty", `${name}.toml`));
    }
    if (!profile) {
      missing.push(`${category}: parse failed for '${name}'`);
      continue;
    }
    let id = slug(name);
    let index = 2;
    while (seenIds.has(id)) {
      id = `${slug(name)}-${index}`;
      index += 1;
    }
    seenIds.add(id);
    all.push({ id, name, category, profile });
  }
}

addThemes(darkNames, "dark");
addThemes(lightNames, "light");

all.sort((a, b) => {
  if (a.category !== b.category) return a.category.localeCompare(b.category);
  return a.name.localeCompare(b.name);
});

const banner = [
  "/*",
  " * Generated from mbadolato/iTerm2-Color-Schemes.",
  " * Source sections: README darkthemes + lightthemes.",
  " * Do not edit manually; regenerate via scripts/generate-iterm2-theme-library.mjs.",
  " */",
  ""
].join("\n");

const output = `${banner}export const ITERM2_THEME_LIBRARY = ${JSON.stringify(all, null, 2)};\n`;
fs.writeFileSync(outFile, output, "utf8");

console.log(`generated ${outFile}`);
console.log(`themes: ${all.length} (dark=${all.filter((t) => t.category === "dark").length}, light=${all.filter((t) => t.category === "light").length})`);
if (missing.length > 0) {
  console.log("missing/failed entries:");
  for (const line of missing.slice(0, 50)) console.log(`- ${line}`);
  if (missing.length > 50) console.log(`... and ${missing.length - 50} more`);
}
