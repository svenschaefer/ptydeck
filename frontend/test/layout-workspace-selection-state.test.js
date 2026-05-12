import test from "node:test";
import assert from "node:assert/strict";

import {
  clearChildren,
  normalizeText,
  replaceSelectOptions,
  syncSelectionActionState
} from "../src/public/layout-workspace-selection-state.js";

function createSelectElement() {
  const nodes = [];
  return {
    value: "",
    disabled: false,
    get firstChild() {
      return nodes[0] || null;
    },
    get children() {
      return {
        length: nodes.length,
        0: nodes[0],
        item(index) {
          return nodes[index] || null;
        }
      };
    },
    appendChild(node) {
      nodes.push(node);
      return node;
    },
    removeChild(node) {
      const index = nodes.indexOf(node);
      if (index >= 0) {
        nodes.splice(index, 1);
      }
      return node;
    },
    toArray() {
      return nodes.slice();
    }
  };
}

test("layout workspace selection state replaces select options with placeholder and selected items deterministically", () => {
  const selectEl = createSelectElement();

  replaceSelectOptions({
    selectEl,
    selectedValue: "ops",
    placeholder: { value: "", label: "Choose" },
    items: [
      { value: "ops", label: "Ops" },
      { value: "dev", label: "Dev", disabled: true }
    ]
  });

  assert.equal(selectEl.value, "ops");
  assert.deepEqual(
    selectEl.toArray().map((entry) => ({
      value: entry.value,
      label: entry.textContent,
      disabled: entry.disabled,
      selected: entry.selected
    })),
    [
      { value: "", label: "Choose", disabled: false, selected: false },
      { value: "ops", label: "Ops", disabled: false, selected: true },
      { value: "dev", label: "Dev", disabled: true, selected: false }
    ]
  );
});

test("layout workspace selection state clears list-like collections and toggles action controls fail-closed", () => {
  const selectEl = createSelectElement();
  const controls = [{ disabled: false }, { disabled: false }];

  replaceSelectOptions({
    selectEl,
    placeholder: { value: "", label: "None", disabled: true, selected: true },
    items: []
  });
  assert.equal(selectEl.toArray().length, 1);

  clearChildren(selectEl);
  assert.equal(selectEl.toArray().length, 0);

  const hasItems = syncSelectionActionState({
    selectEl,
    selectedValue: "",
    itemCount: 0,
    controls
  });

  assert.equal(hasItems, false);
  assert.equal(selectEl.disabled, true);
  assert.deepEqual(controls.map((control) => control.disabled), [true, true]);
  assert.equal(normalizeText("  ops  "), "ops");
});
