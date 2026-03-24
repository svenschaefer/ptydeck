import test from "node:test";
import assert from "node:assert/strict";

import {
  applyTerminalSearchMatch,
  collectTerminalSearchMatches,
  formatTerminalSearchStatus,
  normalizeTerminalSearchQuery
} from "../src/public/terminal-search.js";

function createTerminalFixture(lines, rows = 6) {
  const terminal = {
    rows,
    scrollCalls: [],
    clearSelectionCalls: 0,
    selected: null,
    buffer: {
      active: {
        baseY: Math.max(lines.length - rows, 0),
        length: lines.length,
        getLine(index) {
          const text = lines[index];
          if (typeof text !== "string") {
            return null;
          }
          return {
            translateToString() {
              return text;
            }
          };
        }
      }
    },
    scrollToLine(line) {
      this.scrollCalls.push(line);
    },
    clearSelection() {
      this.clearSelectionCalls += 1;
      this.selected = null;
    },
    select(column, row, length) {
      this.selected = { column, row, length };
    }
  };
  return terminal;
}

test("normalizeTerminalSearchQuery trims input deterministically", () => {
  assert.equal(normalizeTerminalSearchQuery("  alpha  "), "alpha");
  assert.equal(normalizeTerminalSearchQuery("\n\n"), "");
});

test("collectTerminalSearchMatches finds literal matches across terminal buffer lines", () => {
  const terminal = createTerminalFixture(["alpha beta", "gamma alpha", "ALPHA"], 4);
  const matches = collectTerminalSearchMatches(terminal, "alpha");
  assert.deepEqual(matches.map((entry) => ({ row: entry.row, column: entry.column })), [
    { row: 0, column: 0 },
    { row: 1, column: 6 },
    { row: 2, column: 0 }
  ]);
});

test("applyTerminalSearchMatch scrolls and selects through public terminal APIs", () => {
  const terminal = createTerminalFixture(["zero", "one", "two", "three", "four", "five"], 4);
  const applied = applyTerminalSearchMatch(terminal, { row: 5, column: 2, length: 3 });
  assert.equal(applied, true);
  assert.equal(terminal.clearSelectionCalls, 1);
  assert.deepEqual(terminal.selected, { column: 2, row: 5, length: 3 });
  assert.deepEqual(terminal.scrollCalls, [3]);
});

test("formatTerminalSearchStatus distinguishes match, wrap, and no-match states", () => {
  assert.equal(
    formatTerminalSearchStatus({ query: "alpha", matches: [{}, {}], activeIndex: 0, wrapped: false }),
    "Match 1/2"
  );
  assert.equal(
    formatTerminalSearchStatus({ query: "alpha", matches: [{}, {}], activeIndex: 0, wrapped: true, direction: "next" }),
    "Wrapped to next match (Match 1/2)."
  );
  assert.equal(
    formatTerminalSearchStatus({ query: "alpha", matches: [], activeIndex: -1 }),
    "No matches in active terminal."
  );
  assert.equal(
    formatTerminalSearchStatus({ query: "alpha", missingActiveSession: true }),
    "Search needs an active terminal."
  );
});
