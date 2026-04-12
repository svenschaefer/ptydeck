const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const scriptPath = path.join(process.cwd(), 'scripts', 'analyze-codex-message-boundaries.mjs');
const dumpOne = path.join(process.cwd(), 'docs', 'examples', 'codex-terminal-dump-2026-04-11-22-41.txt');
const dumpTwo = path.join(process.cwd(), 'docs', 'examples', 'codex-terminal-dump-2026-04-11-23-30.txt');

test('analyze-codex-message-boundaries reports separator-anchored multiline blocks and mixed fit classes', () => {
  const output = execFileSync('node', [scriptPath, dumpOne, dumpTwo, '--format', 'json'], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  const reports = JSON.parse(output);
  assert.equal(reports.length, 2);
  for (const report of reports) {
    assert.ok(report.summary.totalBlocks > 0);
    assert.ok(report.summary.multiLineBlocks > 0);
    assert.ok(report.summary.nextAntiBulletClosed > 0 || report.summary.nextSeparatorClosed > 0 || report.summary.nextInfoBulletClosed > 0);
  }
  const second = reports.find((report) => report.file.endsWith('23-30.txt'));
  assert.ok(second);
  assert.ok(second.summary.sectionFitBlocks > 0);
  assert.ok(second.summary.infoFitBlocks > 0);
  assert.ok(second.blocks.some((block) => block.closingReason === 'next_anti_bullet'));
});
