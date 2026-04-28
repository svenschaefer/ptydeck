import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSlashCommandRegistry } from "../../frontend/src/public/command-schema.js";
import { DEFAULT_SESSION_INPUT_SAFETY_PROFILE } from "../../frontend/src/public/input-safety-profile.js";
import { SESSION_MOUSE_FORWARDING_MODE_VALUES } from "../../frontend/src/public/session-mouse-forwarding.js";
import { SYSTEM_SLASH_COMMANDS } from "../../frontend/src/public/system-slash-commands.js";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"]);
const HANDBOOK_STYLESHEET = `:root {
  --handbook-bg: #f3efe6;
  --handbook-panel: rgba(255, 252, 245, 0.94);
  --handbook-panel-strong: #fffaf1;
  --handbook-text: #1c2422;
  --handbook-muted: #5d6865;
  --handbook-border: rgba(28, 36, 34, 0.14);
  --handbook-accent: #0f766e;
  --handbook-accent-soft: rgba(15, 118, 110, 0.12);
  --handbook-code-bg: #13221f;
  --handbook-code-text: #e7f3ef;
  --handbook-shadow: 0 18px 36px rgba(18, 28, 25, 0.12);
  --handbook-radius: 20px;
}
* {
  box-sizing: border-box;
}
html {
  background: linear-gradient(180deg, #f5f1e8 0%, #efe6d7 100%);
  color: var(--handbook-text);
  font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
}
body {
  margin: 0;
  min-height: 100vh;
}
a {
  color: var(--handbook-accent);
  text-decoration-thickness: 0.08em;
}
a:hover {
  text-decoration-thickness: 0.14em;
}
code,
pre,
.handbook-code {
  font-family: "Cascadia Code", "Fira Code", Consolas, "Liberation Mono", monospace;
}
.handbook-shell {
  width: min(1360px, calc(100vw - 32px));
  margin: 24px auto;
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr) minmax(180px, 240px);
  gap: 20px;
  align-items: start;
}
.handbook-panel,
.handbook-article,
.handbook-page-toc {
  background: var(--handbook-panel);
  border: 1px solid var(--handbook-border);
  border-radius: var(--handbook-radius);
  box-shadow: var(--handbook-shadow);
  backdrop-filter: blur(10px);
}
.handbook-panel {
  padding: 20px;
  position: sticky;
  top: 24px;
}
.handbook-brand {
  display: grid;
  gap: 6px;
  margin-bottom: 20px;
}
.handbook-brand-title {
  margin: 0;
  font-size: 1.55rem;
  line-height: 1.1;
}
.handbook-brand-subtitle {
  margin: 0;
  color: var(--handbook-muted);
  font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
  font-size: 0.95rem;
}
.handbook-nav-group + .handbook-nav-group {
  margin-top: 18px;
}
.handbook-nav-title {
  margin: 0 0 8px;
  font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
  font-size: 0.77rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--handbook-muted);
}
.handbook-nav-list,
.handbook-page-toc-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}
.handbook-nav-link,
.handbook-page-toc-link {
  display: block;
  padding: 8px 10px;
  border-radius: 12px;
  text-decoration: none;
  color: inherit;
  font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
}
.handbook-nav-link:hover,
.handbook-page-toc-link:hover {
  background: rgba(255, 255, 255, 0.66);
}
.handbook-nav-link.is-current,
.handbook-page-toc-link.is-current {
  background: var(--handbook-accent-soft);
  color: #0a564f;
  font-weight: 700;
}
.handbook-nav-meta {
  display: block;
  margin-top: 2px;
  color: var(--handbook-muted);
  font-size: 0.85rem;
}
.handbook-article {
  padding: 28px 32px 40px;
}
.handbook-breadcrumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
  color: var(--handbook-muted);
  font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
  font-size: 0.94rem;
}
.handbook-breadcrumbs span {
  opacity: 0.65;
}
.handbook-article h1,
.handbook-article h2,
.handbook-article h3 {
  line-height: 1.12;
  scroll-margin-top: 24px;
}
.handbook-article h1 {
  margin: 0 0 16px;
  font-size: clamp(2rem, 3vw, 2.6rem);
}
.handbook-article h2 {
  margin: 28px 0 12px;
  font-size: clamp(1.45rem, 2vw, 1.85rem);
}
.handbook-article h3 {
  margin: 22px 0 10px;
  font-size: 1.15rem;
}
.handbook-article p,
.handbook-article li,
.handbook-article td,
.handbook-article th {
  font-size: 1rem;
  line-height: 1.62;
}
.handbook-article ul,
.handbook-article ol {
  padding-left: 1.3rem;
}
.handbook-article pre {
  margin: 16px 0;
  padding: 14px 16px;
  overflow: auto;
  border-radius: 16px;
  background: var(--handbook-code-bg);
  color: var(--handbook-code-text);
}
.handbook-article code {
  padding: 0.12rem 0.35rem;
  border-radius: 8px;
  background: rgba(19, 34, 31, 0.08);
  color: #103934;
}
.handbook-article pre code {
  padding: 0;
  background: transparent;
  color: inherit;
}
.handbook-article table {
  width: 100%;
  margin: 18px 0;
  border-collapse: collapse;
}
.handbook-article th,
.handbook-article td {
  vertical-align: top;
  text-align: left;
  border-top: 1px solid var(--handbook-border);
  padding: 10px 12px 10px 0;
}
.handbook-page-toc {
  padding: 18px 20px;
  position: sticky;
  top: 24px;
}
.handbook-page-toc-title {
  margin: 0 0 10px;
  font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
  font-size: 0.82rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--handbook-muted);
}
.handbook-page-toc-empty {
  margin: 0;
  color: var(--handbook-muted);
  font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
  font-size: 0.95rem;
}
.handbook-callout {
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid rgba(15, 118, 110, 0.18);
  background: rgba(15, 118, 110, 0.08);
  font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
}
@media (max-width: 1100px) {
  .handbook-shell {
    grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  }
  .handbook-page-toc {
    display: none;
  }
}
@media (max-width: 820px) {
  .handbook-shell {
    width: min(100vw - 20px, 100%);
    margin: 10px auto 20px;
    grid-template-columns: 1fr;
  }
  .handbook-panel,
  .handbook-page-toc {
    position: static;
  }
  .handbook-article {
    padding: 22px 18px 28px;
  }
}`;

const GENERATED_REFERENCE_DEFINITIONS = Object.freeze([
  {
    sourcePath: "docs/reference/README.md",
    build: buildReferenceIndexMarkdown
  },
  {
    sourcePath: "docs/reference/commands.md",
    build: buildCommandsReferenceMarkdown
  },
  {
    sourcePath: "docs/reference/api.md",
    build: buildApiReferenceMarkdown
  },
  {
    sourcePath: "docs/reference/session-settings.md",
    build: buildSessionSettingsReferenceMarkdown
  }
]);

const HANDBOOK_PAGE_DEFINITIONS = Object.freeze([
  {
    sourcePath: "docs/manual/index.md",
    outputPath: "frontend/src/public/handbook/index.html",
    section: "Manual",
    navTitle: "Overview",
    handbookHref: "/handbook/index.html"
  },
  {
    sourcePath: "docs/manual/startup-and-sessions.md",
    outputPath: "frontend/src/public/handbook/manual/startup-and-sessions.html",
    section: "Manual",
    navTitle: "Startup and Sessions",
    handbookHref: "/handbook/manual/startup-and-sessions.html"
  },
  {
    sourcePath: "docs/manual/session-settings.md",
    outputPath: "frontend/src/public/handbook/manual/session-settings.html",
    section: "Manual",
    navTitle: "Session Settings",
    handbookHref: "/handbook/manual/session-settings.html"
  },
  {
    sourcePath: "docs/manual/paste-and-send-safety.md",
    outputPath: "frontend/src/public/handbook/manual/paste-and-send-safety.html",
    section: "Manual",
    navTitle: "Paste and Send Safety",
    handbookHref: "/handbook/manual/paste-and-send-safety.html"
  },
  {
    sourcePath: "docs/manual/replay-copy-paste.md",
    outputPath: "frontend/src/public/handbook/manual/replay-copy-paste.html",
    section: "Manual",
    navTitle: "Replay Copy and Paste",
    handbookHref: "/handbook/manual/replay-copy-paste.html"
  },
  {
    sourcePath: "docs/manual/workspace-library.md",
    outputPath: "frontend/src/public/handbook/manual/workspace-library.html",
    section: "Manual",
    navTitle: "Workspace Library",
    handbookHref: "/handbook/manual/workspace-library.html"
  },
  {
    sourcePath: "docs/manual/trusted-local-control.md",
    outputPath: "frontend/src/public/handbook/manual/trusted-local-control.html",
    section: "Manual",
    navTitle: "Trusted-Local Control",
    handbookHref: "/handbook/manual/trusted-local-control.html"
  },
  {
    sourcePath: "docs/reference/README.md",
    outputPath: "frontend/src/public/handbook/reference/index.html",
    section: "Reference",
    navTitle: "Reference Overview",
    handbookHref: "/handbook/reference/index.html"
  },
  {
    sourcePath: "docs/reference/commands.md",
    outputPath: "frontend/src/public/handbook/reference/commands.html",
    section: "Reference",
    navTitle: "Slash Commands",
    handbookHref: "/handbook/reference/commands.html"
  },
  {
    sourcePath: "docs/reference/api.md",
    outputPath: "frontend/src/public/handbook/reference/api.html",
    section: "Reference",
    navTitle: "API",
    handbookHref: "/handbook/reference/api.html"
  },
  {
    sourcePath: "docs/reference/session-settings.md",
    outputPath: "frontend/src/public/handbook/reference/session-settings.html",
    section: "Reference",
    navTitle: "Session Settings",
    handbookHref: "/handbook/reference/session-settings.html"
  }
]);

const GENERATED_OUTPUTS = Object.freeze([
  ...GENERATED_REFERENCE_DEFINITIONS.map((entry) => entry.sourcePath),
  ...HANDBOOK_PAGE_DEFINITIONS.map((entry) => entry.outputPath),
  "frontend/src/public/handbook/styles.css"
]);
const GENERATED_HANDBOOK_OUTPUTS = new Set(
  GENERATED_OUTPUTS.filter((entry) => entry.startsWith("frontend/src/public/handbook/"))
);

export function getRepositoryRoot() {
  return REPOSITORY_ROOT;
}

export async function buildGeneratedArtifacts(rootDir = REPOSITORY_ROOT) {
  const referenceMarkdownByPath = new Map();
  for (const definition of GENERATED_REFERENCE_DEFINITIONS) {
    referenceMarkdownByPath.set(definition.sourcePath, await definition.build(rootDir));
  }

  const pageSourceByPath = new Map(referenceMarkdownByPath);
  for (const definition of HANDBOOK_PAGE_DEFINITIONS) {
    if (pageSourceByPath.has(definition.sourcePath)) {
      continue;
    }
    const absoluteSourcePath = resolve(rootDir, definition.sourcePath);
    pageSourceByPath.set(definition.sourcePath, await readFile(absoluteSourcePath, "utf8"));
  }

  const pageLookup = new Map(HANDBOOK_PAGE_DEFINITIONS.map((entry) => [entry.sourcePath, entry]));
  const pageContexts = HANDBOOK_PAGE_DEFINITIONS.map((definition) => ({
    ...definition,
    markdown: pageSourceByPath.get(definition.sourcePath)
  }));

  const artifacts = new Map(referenceMarkdownByPath);
  artifacts.set("frontend/src/public/handbook/styles.css", `${HANDBOOK_STYLESHEET}\n`);

  for (const page of pageContexts) {
    const rendered = renderHandbookPageHtml(page, pageContexts, pageLookup);
    artifacts.set(page.outputPath, rendered);
  }

  return {
    artifacts,
    pageContexts
  };
}

async function listFilesRecursive(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = resolve(directoryPath, entry.name);
      if (entry.isDirectory()) {
        return listFilesRecursive(absolutePath);
      }
      return [absolutePath];
    })
  );
  return nestedFiles.flat();
}

export async function findStaleGeneratedHandbookOutputs(rootDir = REPOSITORY_ROOT) {
  const handbookRoot = resolve(rootDir, "frontend/src/public/handbook");
  if (!existsSync(handbookRoot)) {
    return [];
  }
  const stalePaths = [];
  for (const absolutePath of await listFilesRecursive(handbookRoot)) {
    const outputPath = relative(rootDir, absolutePath).replace(/\\/g, "/");
    if (!GENERATED_HANDBOOK_OUTPUTS.has(outputPath)) {
      stalePaths.push(outputPath);
    }
  }
  return stalePaths.sort((left, right) => left.localeCompare(right));
}

export async function generateHandbook(rootDir = REPOSITORY_ROOT, options = {}) {
  const check = options.check === true;
  const { artifacts } = await buildGeneratedArtifacts(rootDir);
  const changedPaths = [];
  const missingPaths = [];

  for (const outputPath of GENERATED_OUTPUTS) {
    const nextContent = artifacts.get(outputPath);
    if (typeof nextContent !== "string") {
      throw new Error(`Missing generated content for ${outputPath}`);
    }
    const absolutePath = resolve(rootDir, outputPath);
    const currentContent = existsSync(absolutePath) ? await readFile(absolutePath, "utf8") : null;
    if (currentContent !== nextContent) {
      if (currentContent === null) {
        missingPaths.push(outputPath);
      }
      changedPaths.push(outputPath);
      if (!check) {
        await mkdir(dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, nextContent, "utf8");
      }
    }
  }

  const stalePaths = await findStaleGeneratedHandbookOutputs(rootDir);
  for (const outputPath of stalePaths) {
    changedPaths.push(outputPath);
    if (!check) {
      await rm(resolve(rootDir, outputPath), { force: true });
    }
  }

  return {
    check,
    changedPaths,
    missingPaths,
    stalePaths,
    wrotePaths: check ? [] : changedPaths,
    isClean: changedPaths.length === 0
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/\n/g, " ");
}

function normalizeHeadingSlug(value, usedSlugs) {
  const base = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "section";
  let slug = base;
  let counter = 2;
  while (usedSlugs.has(slug)) {
    slug = `${base}-${counter}`;
    counter += 1;
  }
  usedSlugs.add(slug);
  return slug;
}

function cleanInlineText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function stripHtmlToMarkdownText(value) {
  return cleanInlineText(String(value || "").replace(/<code>(.*?)<\/code>/g, (_match, code) => `\`${code}\``).replace(/<[^>]+>/g, " "));
}

function normalizeKebabToCamel(value) {
  return String(value || "").replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
}

function formatCode(value) {
  return `\`${String(value || "")}\``;
}

function formatBoolean(value) {
  return value ? "Yes" : "No";
}

function sortByLocale(left, right) {
  return String(left || "").localeCompare(String(right || ""), "en-US", { sensitivity: "base" });
}

function getPageTitle(page) {
  const match = String(page.markdown || "").match(/^#\s+(.+)$/m);
  return cleanInlineText(match ? match[1] : page.navTitle || page.section || "Handbook");
}

function rewriteMarkdownLink(rawUrl, sourcePath, pageLookup) {
  const url = String(rawUrl || "").trim();
  if (!url || url.startsWith("http://") || url.startsWith("https://") || url.startsWith("mailto:")) {
    return url;
  }
  if (url.startsWith("#")) {
    return url;
  }
  const [relativePath, hash = ""] = url.split("#");
  const sourceDir = posix.dirname(sourcePath);
  const resolvedSourcePath = posix.normalize(posix.join(sourceDir, relativePath));
  const page = pageLookup.get(resolvedSourcePath);
  if (!page) {
    return url;
  }
  return `${page.handbookHref}${hash ? `#${hash}` : ""}`;
}

function renderInlineMarkdown(text, sourcePath, pageLookup) {
  const codeTokens = [];
  let value = String(text || "").replace(/`([^`]+)`/g, (_match, code) => {
    const token = `@@CODE${codeTokens.length}@@`;
    codeTokens.push(code);
    return token;
  });
  value = escapeHtml(value);
  value = value.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  value = value.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, rawUrl) => {
    const href = rewriteMarkdownLink(rawUrl, sourcePath, pageLookup);
    return `<a href="${escapeAttribute(href)}">${escapeHtml(label)}</a>`;
  });
  value = value.replace(/&lt;br&gt;/g, "<br>");
  value = value.replace(/@@CODE(\d+)@@/g, (_match, index) => {
    const code = codeTokens[Number(index)] || "";
    return `<code>${escapeHtml(code)}</code>`;
  });
  return value;
}

function renderMarkdownToHtml(markdown, sourcePath, pageLookup) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const usedSlugs = new Set();
  const headings = [];
  const htmlParts = [];
  let paragraphLines = [];
  let listItems = [];
  let listType = "";
  let tableRows = [];
  let fenceLanguage = "";
  let fenceLines = [];

  function flushParagraph() {
    if (paragraphLines.length === 0) {
      return;
    }
    htmlParts.push(`<p>${renderInlineMarkdown(paragraphLines.join(" "), sourcePath, pageLookup)}</p>`);
    paragraphLines = [];
  }

  function flushList() {
    if (listItems.length === 0) {
      return;
    }
    const tagName = listType === "ol" ? "ol" : "ul";
    const body = listItems
      .map((item) => `<li>${renderInlineMarkdown(item, sourcePath, pageLookup)}</li>`)
      .join("\n");
    htmlParts.push(`<${tagName}>\n${body}\n</${tagName}>`);
    listItems = [];
    listType = "";
  }

  function flushTable() {
    if (tableRows.length < 2) {
      if (tableRows.length === 1) {
        paragraphLines.push(tableRows[0]);
      }
      tableRows = [];
      return;
    }
    const headerCells = parseMarkdownTableRow(tableRows[0]);
    const separatorCells = parseMarkdownTableRow(tableRows[1]);
    if (headerCells.length === 0 || separatorCells.length !== headerCells.length || !separatorCells.every(isMarkdownTableDividerCell)) {
      paragraphLines.push(...tableRows);
      tableRows = [];
      return;
    }
    const bodyRows = tableRows.slice(2).map(parseMarkdownTableRow).filter((cells) => cells.length === headerCells.length);
    const headerHtml = headerCells
      .map((cell) => `<th>${renderInlineMarkdown(cell, sourcePath, pageLookup)}</th>`)
      .join("");
    const bodyHtml = bodyRows
      .map(
        (cells) =>
          `<tr>${cells.map((cell) => `<td>${renderInlineMarkdown(cell, sourcePath, pageLookup)}</td>`).join("")}</tr>`
      )
      .join("\n");
    htmlParts.push(`<table>\n<thead><tr>${headerHtml}</tr></thead>\n<tbody>\n${bodyHtml}\n</tbody>\n</table>`);
    tableRows = [];
  }

  function flushFence() {
    if (!fenceLanguage && fenceLines.length === 0) {
      return;
    }
    const className = fenceLanguage ? ` class="language-${escapeAttribute(fenceLanguage)}"` : "";
    htmlParts.push(`<pre><code${className}>${escapeHtml(fenceLines.join("\n"))}</code></pre>`);
    fenceLanguage = "";
    fenceLines = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, "  ");
    if (fenceLanguage || fenceLines.length > 0) {
      if (/^```/.test(line.trim())) {
        flushFence();
      } else {
        fenceLines.push(rawLine);
      }
      continue;
    }

    const fenceMatch = line.match(/^```([a-zA-Z0-9_-]+)?\s*$/);
    if (fenceMatch) {
      flushParagraph();
      flushList();
      flushTable();
      fenceLanguage = String(fenceMatch[1] || "").trim();
      fenceLines = [];
      continue;
    }

    if (/^\s*$/.test(line)) {
      flushParagraph();
      flushList();
      flushTable();
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      flushTable();
      const level = headingMatch[1].length;
      const title = cleanInlineText(headingMatch[2]);
      const slug = normalizeHeadingSlug(title, usedSlugs);
      headings.push({ level, title, slug });
      htmlParts.push(`<h${level} id="${escapeAttribute(slug)}">${renderInlineMarkdown(title, sourcePath, pageLookup)}</h${level}>`);
      continue;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph();
      flushTable();
      if (listType && listType !== "ol") {
        flushList();
      }
      listType = "ol";
      listItems.push(cleanInlineText(orderedMatch[1]));
      continue;
    }

    const unorderedMatch = line.match(/^[-*]\s+(.+)$/);
    if (unorderedMatch) {
      flushParagraph();
      flushTable();
      if (listType && listType !== "ul") {
        flushList();
      }
      listType = "ul";
      listItems.push(cleanInlineText(unorderedMatch[1]));
      continue;
    }

    const tableMatch = line.trim();
    if (isMarkdownTableLine(tableMatch)) {
      flushParagraph();
      flushList();
      tableRows.push(tableMatch);
      continue;
    }

    flushList();
    flushTable();
    paragraphLines.push(cleanInlineText(line));
  }

  flushParagraph();
  flushList();
  flushTable();
  flushFence();

  return {
    html: htmlParts.join("\n\n"),
    headings
  };
}

function renderHandbookNav(pageContexts, currentPage) {
  const grouped = new Map();
  for (const page of pageContexts) {
    const group = grouped.get(page.section) || [];
    group.push(page);
    grouped.set(page.section, group);
  }

  return Array.from(grouped.entries())
    .map(([section, pages]) => {
      const items = pages
        .map((page) => {
          const currentClass = page.outputPath === currentPage.outputPath ? " is-current" : "";
          const sourceKind = page.sourcePath.includes("docs/reference/") ? "generated" : "guide";
          return `<li><a class="handbook-nav-link${currentClass}" href="${escapeAttribute(page.handbookHref)}"><span>${escapeHtml(page.navTitle)}</span><span class="handbook-nav-meta">${escapeHtml(sourceKind)}</span></a></li>`;
        })
        .join("\n");
      return `<section class="handbook-nav-group"><p class="handbook-nav-title">${escapeHtml(section)}</p><ul class="handbook-nav-list">\n${items}\n</ul></section>`;
    })
    .join("\n");
}

function renderPageToc(headings) {
  const visibleHeadings = headings.filter((entry) => entry.level >= 2 && entry.level <= 3);
  if (visibleHeadings.length === 0) {
    return '<p class="handbook-page-toc-empty">This page is intentionally short.</p>';
  }
  const items = visibleHeadings
    .map(
      (entry) =>
        `<li><a class="handbook-page-toc-link" href="#${escapeAttribute(entry.slug)}">${escapeHtml(entry.title)}</a></li>`
    )
    .join("\n");
  return `<ul class="handbook-page-toc-list">\n${items}\n</ul>`;
}

function renderHandbookPageHtml(page, pageContexts, pageLookup) {
  const title = getPageTitle(page);
  const { html, headings } = renderMarkdownToHtml(page.markdown, page.sourcePath, pageLookup);
  const breadcrumbs = page.section === "Manual"
    ? '<a href="/handbook/index.html">Handbook</a><span>/</span><span>Manual</span>'
    : '<a href="/handbook/index.html">Handbook</a><span>/</span><a href="/handbook/reference/index.html">Reference</a>';
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(`ptydeck Handbook - ${title}`)}</title>
    <link rel="stylesheet" href="/handbook/styles.css" />
  </head>
  <body>
    <div class="handbook-shell">
      <aside class="handbook-panel">
        <div class="handbook-brand">
          <p class="handbook-brand-title">ptydeck Handbook</p>
          <p class="handbook-brand-subtitle">Generated reference plus curated operator guides kept in repo.</p>
        </div>
        ${renderHandbookNav(pageContexts, page)}
      </aside>
      <main class="handbook-article">
        <nav class="handbook-breadcrumbs">${breadcrumbs}</nav>
        ${html}
      </main>
      <aside class="handbook-page-toc">
        <p class="handbook-page-toc-title">On This Page</p>
        ${renderPageToc(headings)}
      </aside>
    </div>
  </body>
</html>
`;
}

function buildCommandsReferenceMarkdown() {
  const registry = createSlashCommandRegistry(SYSTEM_SLASH_COMMANDS);
  const canonicalCommands = [...registry.listCanonical()].sort((left, right) => sortByLocale(left?.insertText, right?.insertText));
  const lines = [
    "# Slash Command Reference",
    "",
    "Generated from `frontend/src/public/command-schema.js` and `frontend/src/public/system-slash-commands.js`.",
    "",
    "## Canonical Commands",
    "",
    "| Command | Description | Usage | Aliases |",
    "| --- | --- | --- | --- |"
  ];

  for (const command of canonicalCommands) {
    const aliases = registry
      .listAliasesFor(command.insertText, "")
      .map((entry) => formatCode(entry.label))
      .sort(sortByLocale)
      .join(", ");
    lines.push(
      `| ${formatCode(command.label)} | ${cleanInlineText(command.description)} | ${command.usage.map(formatCode).join("<br>")} | ${
        aliases || "-"
      } |`
    );
  }

  for (const command of canonicalCommands) {
    const aliases = registry
      .listAliasesFor(command.insertText, "")
      .map((entry) => entry.label)
      .sort(sortByLocale);
    const subcommands = Object.values(command.subcommands || {}).sort((left, right) => sortByLocale(left?.insertText, right?.insertText));
    lines.push("", `## ${command.label}`, "", cleanInlineText(command.description), "", "### Usage", "");
    for (const usage of command.usage) {
      lines.push(`- ${formatCode(usage)}`);
    }
    if (aliases.length > 0) {
      lines.push("", `### Aliases`, "", aliases.map(formatCode).join(", "));
    }
    if (subcommands.length > 0) {
      lines.push("", "### Subcommands", "", "| Subcommand | Description | Usage |", "| --- | --- | --- |");
      for (const subcommand of subcommands) {
        const subcommandAliases = registry
          .listAliasesFor(command.insertText, subcommand.insertText)
          .map((entry) => entry.label)
          .sort(sortByLocale);
        lines.push(
          `| ${formatCode(subcommand.label)} | ${cleanInlineText(subcommand.description)}${
            subcommandAliases.length > 0 ? `<br>Aliases: ${subcommandAliases.map(formatCode).join(", ")}` : ""
          } | ${subcommand.usage.map(formatCode).join("<br>")} |`
        );
      }
    }
  }

  lines.push(
    "",
    "## Help Topics",
    "",
    `Use ${formatCode("/help")} for the alphabetical command overview, ${formatCode("/help <command>")} for a command topic, ${formatCode(
      "/help <command> <subcommand>"
    )} for a specific subcommand topic, and ${formatCode("/help @")} / ${formatCode("/help >")} for direct-route and quick-switch help.`
  );

  return `${lines.join("\n")}\n`;
}

function parseOpenApiContract(openApiSource) {
  const entries = [];
  const lines = String(openApiSource || "").replace(/\r\n/g, "\n").split("\n");
  let currentPath = null;
  let currentMethod = null;
  let inRequestBody = false;
  let inResponses = false;
  let currentResponse = null;

  for (const line of lines) {
    const indent = line.match(/^ */)?.[0]?.length || 0;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    if (indent === 2 && trimmed.startsWith("/") && trimmed.endsWith(":")) {
      currentPath = {
        path: trimmed.slice(0, -1),
        methods: []
      };
      entries.push(currentPath);
      currentMethod = null;
      inRequestBody = false;
      inResponses = false;
      currentResponse = null;
      continue;
    }
    if (!currentPath) {
      continue;
    }
    if (indent === 4 && trimmed.endsWith(":")) {
      const key = trimmed.slice(0, -1);
      if (HTTP_METHODS.has(key)) {
        currentMethod = {
          method: key.toUpperCase(),
          operationId: "",
          summary: "",
          requestBodyRequired: false,
          responses: []
        };
        currentPath.methods.push(currentMethod);
        inRequestBody = false;
        inResponses = false;
        currentResponse = null;
        continue;
      }
      currentMethod = null;
      inRequestBody = false;
      inResponses = false;
      currentResponse = null;
      continue;
    }
    if (!currentMethod) {
      continue;
    }
    if (indent === 6 && trimmed.startsWith("operationId:")) {
      currentMethod.operationId = cleanInlineText(trimmed.slice("operationId:".length));
      continue;
    }
    if (indent === 6 && trimmed.startsWith("summary:")) {
      currentMethod.summary = cleanInlineText(trimmed.slice("summary:".length));
      continue;
    }
    if (indent === 6 && trimmed === "requestBody:") {
      inRequestBody = true;
      inResponses = false;
      currentResponse = null;
      continue;
    }
    if (indent === 6 && trimmed === "responses:") {
      inResponses = true;
      inRequestBody = false;
      currentResponse = null;
      continue;
    }
    if (inRequestBody && indent === 8 && trimmed.startsWith("required:")) {
      currentMethod.requestBodyRequired = cleanInlineText(trimmed.slice("required:".length)) === "true";
      continue;
    }
    if (inResponses && indent === 8 && /^'?\d{3}'?:$/.test(trimmed)) {
      const code = trimmed.replace(/[':]/g, "");
      currentResponse = { code, description: "" };
      currentMethod.responses.push(currentResponse);
      continue;
    }
    if (currentResponse && indent === 10 && trimmed.startsWith("description:")) {
      currentResponse.description = cleanInlineText(trimmed.slice("description:".length));
    }
  }

  for (const resource of entries) {
    for (const method of resource.methods) {
      for (const response of method.responses) {
        if (!response.description && response.code === "426") {
          response.description = "TLS required";
        }
      }
    }
  }

  return entries;
}

function summarizeApiGroup(path) {
  const firstSegment = String(path || "")
    .split("/")
    .filter(Boolean)[0] || "misc";
  const titles = {
    auth: "Authentication",
    shares: "Shares",
    "custom-commands": "Custom Commands",
    decks: "Decks",
    "layout-profiles": "Layout Profiles",
    "connection-profiles": "Connection Profiles",
    "workspace-presets": "Workspace Presets",
    "ssh-trust-entries": "SSH Trust",
    sessions: "Sessions"
  };
  return titles[firstSegment] || firstSegment.replace(/-/g, " ");
}

function summarizeAuthNote(path, method) {
  if (path === "/auth/dev-token") {
    return "Development bootstrap route. Available only when auth dev mode is enabled.";
  }
  if (path === "/auth/ws-ticket") {
    return "Bearer-authenticated route that returns a one-time WebSocket ticket for the browser client.";
  }
  const responseCodes = new Set((method.responses || []).map((entry) => entry.code));
  if (responseCodes.has("401") || responseCodes.has("403")) {
    return "Bearer-authenticated operator route with explicit auth/scope failures in the contract.";
  }
  return "Operator route under `/api/v1`; share spectators use share URLs instead of this route family.";
}

async function buildApiReferenceMarkdown(rootDir) {
  const openApiSource = await readFile(resolve(rootDir, "backend/openapi/openapi.yaml"), "utf8");
  const resources = parseOpenApiContract(openApiSource);
  const grouped = new Map();
  for (const resource of resources) {
    const groupTitle = summarizeApiGroup(resource.path);
    const list = grouped.get(groupTitle) || [];
    list.push(resource);
    grouped.set(groupTitle, list);
  }

  const lines = [
    "# API Reference",
    "",
    "Generated from `backend/openapi/openapi.yaml`.",
    "",
    "The operator API is served under `/api/v1`, REST calls use bearer auth, and WebSocket upgrades use the short-lived ticket minted by `/auth/ws-ticket`.",
    ""
  ];

  for (const [groupTitle, resourcesInGroup] of Array.from(grouped.entries()).sort(([left], [right]) => sortByLocale(left, right))) {
    lines.push(`## ${groupTitle}`, "");
    for (const resource of resourcesInGroup.sort((left, right) => sortByLocale(left.path, right.path))) {
      lines.push(`### ${formatCode(resource.path)}`, "");
      for (const method of resource.methods) {
        const responseSummary = method.responses
          .map((entry) => `${formatCode(entry.code)} ${entry.description}`)
          .join("; ");
        lines.push(`- **${method.method}** ${cleanInlineText(method.summary)}`);
        lines.push(`  Operation ID: ${formatCode(method.operationId || "(none)")}`);
        lines.push(`  Request body: ${method.requestBodyRequired ? "required" : "optional or none"}`);
        lines.push(`  Auth note: ${summarizeAuthNote(resource.path, method)}`);
        lines.push(`  Responses: ${responseSummary || "none declared"}`);
      }
      lines.push("");
    }
  }

  return `${lines.join("\n")}\n`;
}

function extractSectionByPanelClass(indexHtml, panelClassName) {
  const pattern = new RegExp(`<section class="session-settings-section ${panelClassName}[\\s\\S]*?<\\/section>`);
  const match = String(indexHtml || "").match(pattern);
  return match ? match[0] : "";
}

function extractSelectOptions(sectionSource, className) {
  const pattern = new RegExp(`<select class="${className}">([\\s\\S]*?)<\\/select>`);
  const match = String(sectionSource || "").match(pattern);
  if (!match) {
    return [];
  }
  return Array.from(match[1].matchAll(/<option value="([^"]+)">([\s\S]*?)<\/option>/g)).map((entry) => ({
    value: cleanInlineText(entry[1]),
    label: cleanInlineText(entry[2])
  }));
}

function extractLabels(sectionSource, className) {
  const pattern = new RegExp(`<label class="${className}"[^>]*>([\\s\\S]*?)<\\/label>`, "g");
  return Array.from(String(sectionSource || "").matchAll(pattern)).map((entry) => cleanInlineText(stripHtmlToMarkdownText(entry[1])));
}

function extractBlockByClass(sectionSource, tagName, className) {
  const pattern = new RegExp(`<${tagName} class="[^"]*\\b${className}\\b[^"]*">([\\s\\S]*?)<\\/${tagName}>`);
  const match = String(sectionSource || "").match(pattern);
  return match ? match[0] : "";
}

function extractInputSafetyChecks(inputSection) {
  const pattern = /<input class="session-input-safety-([^"]+)" type="checkbox" \/>[\s\S]*?<span class="session-input-safety-check-title">([\s\S]*?)<\/span>[\s\S]*?<span class="session-input-safety-check-detail">([\s\S]*?)<\/span>/g;
  return Array.from(String(inputSection || "").matchAll(pattern)).map((entry) => ({
    key: normalizeKebabToCamel(cleanInlineText(entry[1])),
    classSuffix: cleanInlineText(entry[1]),
    title: cleanInlineText(stripHtmlToMarkdownText(entry[2])),
    detail: cleanInlineText(stripHtmlToMarkdownText(entry[3]))
  }));
}

function extractThresholdFields(inputSection) {
  const gridMatch = String(inputSection || "").match(
    /<div class="session-input-safety-threshold-grid">([\s\S]*?)<\/div>/
  );
  if (!gridMatch) {
    return [];
  }
  const pattern = /<label class="session-startup-label">([\s\S]*?)<\/label>\s*<input class="session-input-safety-([^"]+)"[^>]*value="([^"]+)"/g;
  return Array.from(gridMatch[1].matchAll(pattern)).map((entry) => ({
    label: cleanInlineText(stripHtmlToMarkdownText(entry[1])),
    key: normalizeKebabToCamel(cleanInlineText(entry[2])),
    defaultValue: cleanInlineText(entry[3])
  }));
}

function isMarkdownTableLine(line) {
  return /^\|.+\|$/.test(String(line || "").trim());
}

function parseMarkdownTableRow(line) {
  return String(line || "")
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cleanInlineText(cell));
}

function isMarkdownTableDividerCell(cell) {
  return /^:?-{3,}:?$/.test(String(cell || "").trim());
}

async function buildSessionSettingsReferenceMarkdown(rootDir) {
  const indexHtml = await readFile(resolve(rootDir, "frontend/src/public/index.html"), "utf8");
  const startupSection = extractSectionByPanelClass(indexHtml, "session-settings-panel-startup session-startup-controls");
  const inputSection = extractSectionByPanelClass(indexHtml, "session-settings-panel-input session-input-controls");
  const noteSection = extractSectionByPanelClass(indexHtml, "session-settings-panel-note session-note-controls");
  const themeSection = extractSectionByPanelClass(indexHtml, "session-settings-panel-theme session-theme-controls");

  const startupFields = extractLabels(startupSection, "session-startup-label");
  const noteFields = extractLabels(noteSection, "session-startup-label");
  const themeFilterSection = extractBlockByClass(themeSection, "div", "session-theme-filter-grid");
  const themeExchangeSection = extractBlockByClass(themeSection, "details", "session-theme-exchange-details");
  const themePaletteSection = extractBlockByClass(themeSection, "div", "session-theme-palette");
  const themePrimaryFields = extractLabels(themeFilterSection, "session-theme-label");
  const themeExchangeFields = extractLabels(themeExchangeSection, "session-theme-label");
  const themeAdvancedFields = extractLabels(themePaletteSection, "session-theme-label");
  const sendTerminatorOptions = extractSelectOptions(inputSection, "session-send-terminator");
  const mouseForwardingOptions = extractSelectOptions(inputSection, "session-mouse-forwarding-mode");
  const themeSlotOptions = extractSelectOptions(themeSection, "session-theme-slot");
  const themeCategoryOptions = extractSelectOptions(themeSection, "session-theme-category");
  const themeImportFormatOptions = extractSelectOptions(themeSection, "session-theme-import-format");
  const themeExportFormatOptions = extractSelectOptions(themeSection, "session-theme-export-format");
  const inputSafetyChecks = extractInputSafetyChecks(inputSection);
  const thresholdFields = extractThresholdFields(inputSection);
  const settingsTabs = Array.from(indexHtml.matchAll(/<button class="session-settings-tab [^"]+" type="button">([\s\S]*?)<\/button>/g)).map((entry) => cleanInlineText(entry[1]));
  const settingsHint = cleanInlineText(
    stripHtmlToMarkdownText(indexHtml.match(/<p class="session-settings-hint">([\s\S]*?)<\/p>/)?.[1] || "")
  ).replace(/\s*Open the session settings handbook reference.*$/i, "");

  const lines = [
    "# Session Settings Reference",
    "",
    "Generated from `frontend/src/public/index.html`, `frontend/src/public/input-safety-profile.js`, and `frontend/src/public/session-mouse-forwarding.js`.",
    "",
    `Dialog tabs: ${settingsTabs.map(formatCode).join(", ")}.`,
    "",
    settingsHint,
    "",
    "## Startup Tab",
    "",
    "Launch-time session settings. These values affect how the session starts or restarts.",
    ""
  ];

  for (const field of startupFields) {
    lines.push(`- ${field}`);
  }

  lines.push(
    "",
    "## Input Tab",
    "",
    "Send behavior, terminal interaction, and guarded input rules.",
    "",
    "### Send Terminator",
    "",
    "| Value | Label | Default |",
    "| --- | --- | --- |"
  );

  for (const [index, option] of sendTerminatorOptions.entries()) {
    lines.push(`| ${formatCode(option.value)} | ${option.label} | ${index === 0 ? "Yes" : "No"} |`);
  }

  lines.push("", "### Mouse Forwarding", "", "| Value | Label | Runtime Accepted |", "| --- | --- | --- |");
  for (const option of mouseForwardingOptions) {
    lines.push(
      `| ${formatCode(option.value)} | ${option.label} | ${SESSION_MOUSE_FORWARDING_MODE_VALUES.includes(option.value) ? "Yes" : "No"} |`
    );
  }

  lines.push("", "### Send Safety Checks", "", "| Setting | Default | Behavior |", "| --- | --- | --- |");
  for (const check of inputSafetyChecks) {
    lines.push(
      `| ${check.title} | ${formatBoolean(DEFAULT_SESSION_INPUT_SAFETY_PROFILE[check.key] === true)} | ${check.detail} |`
    );
  }

  lines.push("", "### Threshold Defaults", "", "| Setting | Default |", "| --- | --- |");
  for (const field of thresholdFields) {
    const fallback = DEFAULT_SESSION_INPUT_SAFETY_PROFILE[field.key];
    lines.push(`| ${field.label} | ${formatCode(String(fallback ?? field.defaultValue))} |`);
  }

  lines.push("", "## Note Tab", "", "Persisted per-session note and tag metadata.", "");
  for (const field of noteFields) {
    lines.push(`- ${field}`);
  }

  lines.push(
    "",
    "## Theme Tab",
    "",
    "Session-local appearance controls for active and inactive terminal views.",
    "",
    `Primary selectors: ${themePrimaryFields.map(formatCode).join(", ")}.`,
    "",
    `Theme slots: ${themeSlotOptions.map((option) => `${formatCode(option.value)} (${option.label})`).join(", ")}.`,
    "",
    `Theme categories: ${themeCategoryOptions.map((option) => `${formatCode(option.value)} (${option.label})`).join(", ")}.`,
    "",
    `Import/export controls: ${themeExchangeFields.map(formatCode).join(", ")}.`,
    "",
    `Import formats: ${themeImportFormatOptions.map((option) => `${formatCode(option.value)} (${option.label})`).join(", ")}.`,
    "",
    `Export formats: ${themeExportFormatOptions.map((option) => `${formatCode(option.value)} (${option.label})`).join(", ")}.`,
    "",
    "Theme import writes the selected active/inactive slot as a draft. Use `Save Settings` to persist imported UI changes.",
    "",
    `Advanced custom colors: ${themeAdvancedFields.map(formatCode).join(", ")}.`
  );

  return `${lines.join("\n")}\n`;
}

function buildReferenceIndexMarkdown() {
  return `# Reference Overview

Generated handbook reference pages:

- [Slash Commands](commands.md)
- [API](api.md)
- [Session Settings](session-settings.md)

The operator guides under [../manual/index.md](../manual/index.md) intentionally link back here instead of repeating command, transport, and settings contracts inline.
`;
}
