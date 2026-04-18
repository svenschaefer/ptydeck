import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareCustomCommandRecords,
  normalizeCustomCommandPayloadForShell,
  normalizeCustomCommandRecord,
  parseCustomCommandInvocation,
  renderCustomCommandForSession,
  resolveCustomCommandForSession
} from '../src/messaging-custom-command-utils.js';

test('normalizeCustomCommandRecord and compareCustomCommandRecords stay deterministic for backend transport helpers', () => {
  const normalized = normalizeCustomCommandRecord({
    name: ' Doc-U ',
    kind: 'template',
    scope: 'session',
    sessionId: ' s-1 ',
    content: 'echo hi',
    templateVariables: ['session.name', 'session.name', 'deck.name'],
    createdAt: 4,
    updatedAt: 9
  });

  assert.deepEqual(normalized, {
    name: 'doc-u',
    content: 'echo hi',
    kind: 'template',
    scope: 'session',
    sessionId: 's-1',
    precedence: 300,
    templateVariables: ['deck.name', 'session.name'],
    createdAt: 4,
    updatedAt: 9,
    lookupKey: 'session:s-1:doc-u'
  });

  assert.ok(compareCustomCommandRecords(
    { name: 'doc-u', scope: 'session', sessionId: 's-1', content: 'echo session' },
    { name: 'doc-u', scope: 'project', content: 'echo project' }
  ) < 0);
});

test('resolveCustomCommandForSession prefers session scope over project and global scope', () => {
  const commands = [
    { name: 'deploy', scope: 'global', content: 'echo global' },
    { name: 'deploy', scope: 'project', content: 'echo project' },
    { name: 'deploy', scope: 'session', sessionId: 's-1', content: 'echo session' },
    { name: 'deploy', scope: 'session', sessionId: 's-2', content: 'echo other-session' }
  ];

  assert.equal(resolveCustomCommandForSession(commands, 'deploy', 's-1')?.content, 'echo session');
  assert.equal(resolveCustomCommandForSession(commands, 'deploy', 's-9')?.content, 'echo project');
  assert.equal(resolveCustomCommandForSession(commands, 'missing', 's-1'), null);
});

test('parseCustomCommandInvocation validates template parameters and target selectors', () => {
  const templateCommand = {
    name: 'doc-u',
    kind: 'template',
    scope: 'project',
    content: 'echo {{param:topic}} {{var:session.name}}'
  };

  assert.deepEqual(parseCustomCommandInvocation('/doc-u topic=health', templateCommand), {
    ok: true,
    parameterAssignments: { topic: 'health' },
    targetSelector: ''
  });

  assert.deepEqual(parseCustomCommandInvocation('/doc-u topic=health -- deck:ops', templateCommand), {
    ok: true,
    parameterAssignments: { topic: 'health' },
    targetSelector: 'deck:ops'
  });

  assert.match(parseCustomCommandInvocation('/doc-u', templateCommand).error, /Missing template parameter/);
  assert.match(parseCustomCommandInvocation('/doc-u wrong', templateCommand).error, /uses 'key=value' parameters/);
  assert.match(parseCustomCommandInvocation('/doc-u topic=a topic=b', templateCommand).error, /Duplicate template parameter/);
  assert.match(parseCustomCommandInvocation('/other topic=a', templateCommand).error, /Invalid custom command invocation/);
});

test('renderCustomCommandForSession resolves template variables and rejects invalid parameter sets', () => {
  const command = {
    name: 'doc-u',
    kind: 'template',
    scope: 'project',
    content: 'echo {{param:topic}} {{var:session.name}} {{var:deck.name}}'
  };
  const session = { id: 's-1', name: 'build-run', deckId: 'ops', cwd: '/tmp/work', note: 'keep' };
  const deck = { id: 'ops', name: 'Operations' };

  assert.deepEqual(renderCustomCommandForSession(command, session, deck, { topic: 'health' }), {
    ok: true,
    text: 'echo health build-run Operations'
  });
  assert.match(renderCustomCommandForSession(command, session, deck, {}).error, /Missing template parameter/);
  assert.match(renderCustomCommandForSession(command, session, deck, { topic: 'health', extra: 'nope' }).error, /Unknown template parameter/);
  assert.deepEqual(renderCustomCommandForSession({ name: 'plain', scope: 'project', content: 'echo hi' }, session, deck, {}), {
    ok: true,
    text: 'echo hi'
  });
});

test('template custom command helpers reject malformed placeholders and parameterless redirects deterministically', () => {
  const invalidTemplateCommand = {
    name: 'bad',
    kind: 'template',
    scope: 'project',
    content: 'echo {{param:9bad}}'
  };
  const parameterlessTemplate = {
    name: 'jump',
    kind: 'template',
    scope: 'project',
    content: 'echo {{var:session.name}}'
  };

  assert.match(parseCustomCommandInvocation('/bad topic=health', invalidTemplateCommand).error, /invalid/);
  assert.match(renderCustomCommandForSession(invalidTemplateCommand, { id: 's-1' }, { id: 'ops' }, { topic: 'health' }).error, /invalid/);
  assert.deepEqual(parseCustomCommandInvocation('/jump -- deck:ops', parameterlessTemplate), {
    ok: true,
    parameterAssignments: {},
    targetSelector: 'deck:ops'
  });
});

test('normalizeCustomCommandPayloadForShell escapes only unmatched single quotes', () => {
  assert.equal(normalizeCustomCommandPayloadForShell("echo 'unterminated"), "echo \\\'unterminated");
  assert.equal(normalizeCustomCommandPayloadForShell("echo 'closed'"), "echo 'closed'");
  assert.equal(normalizeCustomCommandPayloadForShell("echo \\\'already escaped"), "echo \\\'already escaped");
  assert.equal(normalizeCustomCommandPayloadForShell("first\r\nsecond 'line"), "first\nsecond \\\'line");
  assert.equal(normalizeCustomCommandPayloadForShell('echo \\\\'), 'echo \\\\');
  assert.equal(normalizeCustomCommandPayloadForShell("echo 'open\nsecond \\\\'quoted"), "echo \\\'open\nsecond \\\\\\'quoted");
});
