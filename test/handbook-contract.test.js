const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const repoRoot = path.resolve(__dirname, '..');
const indexHtmlPath = path.join(repoRoot, 'frontend/src/public/index.html');
const commandReferencePath = path.join(repoRoot, 'docs/reference/commands.md');
const manualDir = path.join(repoRoot, 'docs/manual');
const EXTERNAL_MESSAGING_COMMAND_EXAMPLES = new Set(['/status', '/stop', '/retry']);

async function loadModule(relativePath) {
  return import(pathToFileURL(path.join(repoRoot, relativePath)).href);
}

function collectHandbookLinks(indexHtml) {
  return Array.from(indexHtml.matchAll(/href="([^"]*\/handbook[^"]*)"/g)).map((match) => match[1]);
}

function collectDocumentedSlashExamples(markdown) {
  const examples = [];
  for (const block of markdown.matchAll(/```[a-zA-Z0-9_-]*\n([\s\S]*?)```/g)) {
    const lines = block[1]
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith('/'));
    examples.push(...lines);
  }
  return examples;
}

test('handbook artifacts are current', async () => {
  const { generateHandbook } = await loadModule('scripts/lib/handbook.mjs');
  const result = await generateHandbook(repoRoot, { check: true });
  assert.equal(result.changedPaths.length, 0, `Expected generated handbook artifacts to be current, got: ${result.changedPaths.join(', ')}`);
});

test('generated command reference covers every canonical slash command', async () => {
  const commandReference = fs.readFileSync(commandReferencePath, 'utf8');
  const { SYSTEM_SLASH_COMMANDS } = await loadModule('frontend/src/public/system-slash-commands.js');
  for (const commandName of SYSTEM_SLASH_COMMANDS) {
    assert.match(commandReference, new RegExp(`^## /${commandName}$`, 'm'));
  }
});

test('documented slash-command examples resolve to known command topics', async () => {
  const { interpretComposerInput } = await loadModule('frontend/src/public/command-interpreter.js');
  const { createSlashCommandRegistry } = await loadModule('frontend/src/public/command-schema.js');
  const { SYSTEM_SLASH_COMMANDS } = await loadModule('frontend/src/public/system-slash-commands.js');
  const registry = createSlashCommandRegistry(SYSTEM_SLASH_COMMANDS);
  const markdownFiles = fs.readdirSync(manualDir).filter((entry) => entry.endsWith('.md'));
  const examples = markdownFiles.flatMap((entry) => collectDocumentedSlashExamples(fs.readFileSync(path.join(manualDir, entry), 'utf8')));
  assert.ok(examples.length > 0, 'Expected at least one documented slash-command example.');
  for (const example of examples) {
    if (EXTERNAL_MESSAGING_COMMAND_EXAMPLES.has(example)) {
      continue;
    }
    const parsed = interpretComposerInput(example);
    assert.equal(parsed.kind, 'control', `Expected ${example} to resolve as a control command.`);
    assert.ok(registry.get(parsed.command), `Expected ${example} to resolve to a known slash command or alias.`);
  }
});

test('main UI handbook entry and deep links resolve to generated handbook pages', () => {
  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
  const links = collectHandbookLinks(indexHtml);
  assert.ok(links.includes('/handbook/index.html'), 'Expected a global handbook entry in the main UI.');
  assert.ok(links.some((entry) => entry.includes('#')), 'Expected at least one handbook deep link with an anchor target.');

  for (const href of links) {
    const url = new URL(href, 'https://ptydeck.local');
    const filePath = path.join(repoRoot, 'frontend/src/public', url.pathname.replace(/^\//, ''));
    assert.ok(fs.existsSync(filePath), `Expected handbook target file to exist for ${href}.`);
    if (url.hash) {
      const html = fs.readFileSync(filePath, 'utf8');
      const anchorId = url.hash.slice(1);
      assert.match(html, new RegExp(`id="${anchorId}"`), `Expected anchor ${url.hash} to exist in ${href}.`);
    }
  }
});
