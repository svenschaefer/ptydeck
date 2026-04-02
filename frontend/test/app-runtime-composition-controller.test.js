import test from "node:test";
import assert from "node:assert/strict";

import { collectAppRuntimeDomRefs } from "../src/public/app-runtime-composition-controller.js";

test("collectAppRuntimeDomRefs resolves query and id based runtime refs deterministically", () => {
  const appShellEl = { id: "app-shell" };
  const controlPaneEl = { id: "control-pane" };
  const commandInput = { id: "command-input" };
  const workspaceManagerOpenBtn = { id: "workspace-manager-open" };

  const refs = collectAppRuntimeDomRefs({
    querySelector(selector) {
      return selector === ".app-shell" ? appShellEl : null;
    },
    getElementById(id) {
      return {
        "control-pane": controlPaneEl,
        "command-input": commandInput,
        "workspace-manager-open": workspaceManagerOpenBtn
      }[id] || null;
    }
  });

  assert.equal(refs.appShellEl, appShellEl);
  assert.equal(refs.controlPaneEl, controlPaneEl);
  assert.equal(refs.commandInput, commandInput);
  assert.equal(refs.workspaceManagerOpenBtn, workspaceManagerOpenBtn);
  assert.equal(refs.terminalSearchStatusEl, null);
});

test("collectAppRuntimeDomRefs tolerates missing document APIs by returning null refs", () => {
  const refs = collectAppRuntimeDomRefs({});

  assert.equal(refs.appShellEl, null);
  assert.equal(refs.stateEl, null);
  assert.equal(refs.commandInput, null);
  assert.equal(refs.terminalSearchStatusEl, null);
});
