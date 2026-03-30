import test from "node:test";
import assert from "node:assert/strict";

import {
  getTerminalCellHeightPx,
  getTerminalCellWidthPx,
  isTerminalAtBottom,
  refreshTerminalViewport,
  syncTerminalScrollArea
} from "../src/public/terminal-compat.js";

test("isTerminalAtBottom reads xterm public buffer state safely", () => {
  assert.equal(isTerminalAtBottom(null), true);
  assert.equal(isTerminalAtBottom({}), true);
  assert.equal(
    isTerminalAtBottom({
      buffer: {
        active: {
          baseY: 12,
          ydisp: 12
        }
      }
    }),
    true
  );
  assert.equal(
    isTerminalAtBottom({
      buffer: {
        active: {
          baseY: 13,
          ydisp: 12
        }
      }
    }),
    false
  );
});

test("syncTerminalScrollArea supports viewport and _viewport compatibility paths", () => {
  const calls = [];
  assert.equal(
    syncTerminalScrollArea({
      _core: {
        viewport: {
          syncScrollArea() {
            calls.push("viewport");
          }
        }
      }
    }),
    true
  );
  assert.equal(
    syncTerminalScrollArea({
      _core: {
        _viewport: {
          syncScrollArea() {
            calls.push("_viewport");
          }
        }
      }
    }),
    true
  );
  assert.deepEqual(calls, ["viewport", "_viewport"]);
  assert.equal(syncTerminalScrollArea({ _core: {} }), false);
});

test("refreshTerminalViewport repaints visible rows safely", () => {
  const calls = [];
  assert.equal(
    refreshTerminalViewport({
      rows: 8,
      refresh(start, end) {
        calls.push([start, end]);
      }
    }),
    true
  );
  assert.deepEqual(calls, [[0, 7]]);
  assert.equal(refreshTerminalViewport({ rows: 0, refresh() {} }), true);
  assert.equal(refreshTerminalViewport({}), false);
});

test("getTerminalCellHeightPx reads render dimensions through compatibility boundary", () => {
  assert.equal(
    getTerminalCellHeightPx({
      _core: {
        _renderService: {
          dimensions: {
            css: {
              cell: {
                height: 19.75
              }
            }
          }
        }
      }
    }),
    19.75
  );
  assert.equal(getTerminalCellHeightPx({}), 0);
});

test("getTerminalCellWidthPx reads render dimensions through compatibility boundary", () => {
  assert.equal(
    getTerminalCellWidthPx({
      _core: {
        _renderService: {
          dimensions: {
            css: {
              cell: {
                width: 8.5
              }
            }
          }
        }
      }
    }),
    8.5
  );
  assert.equal(getTerminalCellWidthPx({}), 0);
});
