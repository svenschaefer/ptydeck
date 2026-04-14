const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const scriptPath = path.join(process.cwd(), 'scripts', 'analyze-startup-timeline.mjs');

function writeTempFiles() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ptydeck-startup-analysis-'));
  const logPath = path.join(tempDir, 'backend.log');
  const sessionsPath = path.join(tempDir, 'sessions.json');
  const lines = [
    '[ptydeck-backend][2026-04-14T08:36:20.700Z] runtime.restore.start {"persistedSessionCount":16}',
    '[ptydeck-backend][2026-04-14T08:36:20.887Z] runtime.restore.done {"restoredSessionCount":16}',
    '[ptydeck-backend][2026-04-14T08:36:51.063Z] runtime.startup_warmup.active {"activeSessionCount":6}',
    '[ptydeck-backend][2026-04-14T08:37:00.598Z] runtime.startup_warmup.quiet_wait {"quietMs":1000}',
    '[ptydeck-backend][2026-04-14T08:40:03.242Z] runtime.ready {"port":18080,"sessionCount":16}',
    '[ptydeck-backend][2026-04-14T12:26:30.222Z] http.request.start {"method":"GET","pathname":"/ready","requestId":"req-ready","traceId":"req-ready","correlationId":"req-ready","traceSource":"rest"}',
    '[ptydeck-backend][2026-04-14T12:26:30.250Z] http.request.start {"method":"POST","pathname":"/api/v1/auth/dev-token","requestId":"req-auth","traceId":"req-auth","correlationId":"req-auth","traceSource":"rest"}',
    '[ptydeck-backend][2026-04-14T12:26:30.260Z] http.request.start {"method":"GET","pathname":"/api/v1/layout-profiles","requestId":"req-layout","traceId":"req-layout","correlationId":"req-layout","traceSource":"rest"}',
    '[ptydeck-backend][2026-04-14T12:26:30.319Z] ws.upgrade.accepted {"socketCount":1,"requestId":"req-ws","traceId":"req-ws","correlationId":"req-ws","connectionId":"ws-1","traceSource":"ws"}',
    '[ptydeck-backend][2026-04-14T12:26:30.328Z] ws.snapshot.sent {"sessionCount":16,"outputCount":16,"customCommandCount":13,"requestId":"req-ws","traceId":"trc-snapshot","correlationId":"req-ws","connectionId":"ws-1","traceSource":"ws"}',
    '[ptydeck-backend][2026-04-14T12:26:31.262Z] http.request.start {"method":"POST","pathname":"/api/v1/sessions/s1/input","requestId":"req-input-1","traceId":"req-input-1","correlationId":"req-input-1","traceSource":"rest"}',
    '[ptydeck-backend][2026-04-14T12:26:31.263Z] session.input.write {"sessionId":"s1","phase":"ok","writeKind":"direct","bytes":6,"requestId":"req-input-1","traceId":"mgr-1","correlationId":"req-input-1","traceSource":"rest"}',
    '[ptydeck-backend][2026-04-14T12:26:31.264Z] session.event {"type":"session.activity.started","sessionId":"s1","requestId":"req-input-1","traceId":"mgr-1","correlationId":"req-input-1","traceSource":"pty"}',
    '[ptydeck-backend][2026-04-14T12:26:31.362Z] http.request.start {"method":"POST","pathname":"/api/v1/sessions/s2/input","requestId":"req-input-2","traceId":"req-input-2","correlationId":"req-input-2","traceSource":"rest"}',
    '[ptydeck-backend][2026-04-14T12:26:31.363Z] session.input.write {"sessionId":"s2","phase":"ok","writeKind":"direct","bytes":6,"requestId":"req-input-2","traceId":"mgr-2","correlationId":"req-input-2","traceSource":"rest"}',
    '[ptydeck-backend][2026-04-14T12:26:31.500Z] http.request.start {"method":"POST","pathname":"/api/v1/sessions/s1/resize","requestId":"req-resize-1","traceId":"req-resize-1","correlationId":"req-resize-1","traceSource":"rest"}',
    '[ptydeck-backend][2026-04-14T12:26:31.520Z] http.request.start {"method":"POST","pathname":"/api/v1/sessions/s2/resize","requestId":"req-resize-2","traceId":"req-resize-2","correlationId":"req-resize-2","traceSource":"rest"}'
  ];
  fs.writeFileSync(logPath, `${lines.join('\n')}\n`, 'utf8');
  fs.writeFileSync(
    sessionsPath,
    JSON.stringify({
      sessions: [
        { id: 's1', deckId: 'deck-a', name: 'alpha' },
        { id: 's2', deckId: 'deck-b', name: 'beta' }
      ]
    }),
    'utf8'
  );
  return { tempDir, logPath, sessionsPath };
}

test('analyze-startup-timeline reports backend-ready-before-frontend and FE-triggered writes', () => {
  const { tempDir, logPath, sessionsPath } = writeTempFiles();
  try {
    const output = execFileSync('node', [scriptPath, '--log', logPath, '--sessions', sessionsPath, '--window-seconds', '90', '--format', 'json'], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    const report = JSON.parse(output);
    assert.equal(report.latestRuntime.restoreStartAt, '2026-04-14T08:36:20.700Z');
    assert.equal(report.latestRuntime.restoreDoneAt, '2026-04-14T08:36:20.887Z');
    assert.equal(report.latestRuntime.readyAt, '2026-04-14T08:40:03.242Z');
    assert.equal(report.frontendBootstrap.firstReadyProbeAt, '2026-04-14T12:26:30.222Z');
    assert.equal(report.frontendBootstrap.firstFrontendSocketAt, '2026-04-14T12:26:30.319Z');
    assert.equal(report.frontendBootstrap.firstSnapshotAt, '2026-04-14T12:26:30.328Z');
    assert.equal(report.frontendBootstrap.requestCounts.ready_probe, 1);
    assert.equal(report.frontendBootstrap.requestCounts.auth_dev_token, 1);
    assert.equal(report.frontendBootstrap.requestCounts.layout_profiles, 1);
    assert.equal(report.frontendBootstrap.requestCounts.session_input, 2);
    assert.equal(report.frontendBootstrap.requestCounts.session_resize, 2);
    assert.equal(report.frontendBootstrap.inputWriteOkCount, 2);
    assert.equal(report.frontendBootstrap.inputWriteGroups.length, 2);
    assert.deepEqual(report.frontendBootstrap.inputWriteGroups[0].bytes, { '6': 1 });
    assert.equal(report.frontendBootstrap.resizeGroups.length, 2);
    assert.equal(report.assessment.backendStartupCompletedBeforeFrontend, true);
    assert.equal(report.assessment.restoreCompletedBeforeFrontend, true);
    assert.equal(report.assessment.frontendTriggeredInputWrites, true);
    assert.equal(report.assessment.frontendTriggeredResizeRequests, true);
    assert.equal(report.assessment.exactFrontendInputSourceResolvedInCode, false);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
