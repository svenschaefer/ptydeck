const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const scriptPath = path.join(process.cwd(), 'scripts', 'analyze-pty-write-eintr.mjs');

function writeTempFiles() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ptydeck-eintr-analysis-'));
  const logPath = path.join(tempDir, 'backend.log');
  const nodePtySourcePath = path.join(tempDir, 'unixTerminal.ts');
  const nodePtyPackagePath = path.join(tempDir, 'package.json');
  const logLines = [
    '[ptydeck-backend][2026-04-14T16:47:54.333Z] session.input.write {"sessionId":"s1","phase":"attempt","writeKind":"direct","bytes":103,"traceId":"mgr-a","correlationId":"req-a","requestId":"req-a","traceSource":"rest"}',
    '[ptydeck-backend][2026-04-14T16:47:54.333Z] session.input.write {"sessionId":"s1","phase":"ok","writeKind":"direct","bytes":103,"traceId":"mgr-a","correlationId":"req-a","requestId":"req-a","traceSource":"rest"}',
    '[ptydeck-backend][2026-04-14T16:47:54.717Z] session.input.write {"sessionId":"s1","phase":"attempt","writeKind":"submit_cr","bytes":1,"traceId":"mgr-b","correlationId":"req-b","requestId":"req-b","traceSource":"rest"}',
    '[ptydeck-backend][2026-04-14T16:47:54.718Z] session.input.write {"sessionId":"s1","phase":"ok","writeKind":"submit_cr","bytes":1,"traceId":"mgr-b","correlationId":"req-b","requestId":"req-b","traceSource":"rest"}'
  ];
  const sourceText = [
    'fs.write(this._fd, task.buffer, task.offset, (err, written) => {',
    '  if (err) {',
    "    if ('code' in err && err.code === 'EAGAIN') {",
    '      this._writeImmediate = setImmediate(() => this._processWriteQueue());',
    '    } else {',
    '      this._writeQueue.length = 0;',
    "      console.error('Unhandled pty write error', err);",
    '    }',
    '    return;',
    '  }',
    '});'
  ].join('\n');
  fs.writeFileSync(logPath, `${logLines.join('\n')}\n`, 'utf8');
  fs.writeFileSync(nodePtySourcePath, `${sourceText}\n`, 'utf8');
  fs.writeFileSync(nodePtyPackagePath, JSON.stringify({ version: '1.1.0' }), 'utf8');
  return { tempDir, logPath, nodePtySourcePath, nodePtyPackagePath };
}

test('analyze-pty-write-eintr reports async gap and queue-drop risk when EINTR is not retried', () => {
  const { tempDir, logPath, nodePtySourcePath, nodePtyPackagePath } = writeTempFiles();
  try {
    const output = execFileSync('node', [
      scriptPath,
      '--log', logPath,
      '--node-pty-source', nodePtySourcePath,
      '--node-pty-package', nodePtyPackagePath,
      '--format', 'json'
    ], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    const report = JSON.parse(output);
    assert.equal(report.nodePty.version, '1.1.0');
    assert.equal(report.nodePty.behavior.retriesEagain, true);
    assert.equal(report.nodePty.behavior.retriesEintr, false);
    assert.equal(report.nodePty.behavior.clearsQueueOnUnexpectedError, true);
    assert.equal(report.logSummary.sessionInputWrite.attemptCount, 2);
    assert.equal(report.logSummary.sessionInputWrite.okCount, 2);
    assert.equal(report.logSummary.sessionInputWrite.failedCount, 0);
    assert.equal(report.assessment.structuredFailuresObserved, false);
    assert.equal(report.assessment.asyncGapExists, true);
    assert.equal(report.assessment.silentQueueDropRiskOnEintr, true);
    assert.match(report.assessment.currentBestCorrectiveStrategy, /Treat EINTR like a retryable asynchronous PTY write interruption/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
