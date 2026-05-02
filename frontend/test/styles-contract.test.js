import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const stylesCssPath = path.resolve(__dirname, "../src/public/styles.css");

test("terminal viewport keeps a stable native scrollbar gutter", () => {
  const stylesCss = fs.readFileSync(stylesCssPath, "utf8");
  assert.match(
    stylesCss,
    /\.terminal-mount \.xterm-screen canvas \{\s*pointer-events: none;\s*\}/m
  );
  assert.match(
    stylesCss,
    /\.terminal-mount \.xterm-viewport \{[\s\S]*overflow-y: scroll !important;[\s\S]*scrollbar-gutter: stable;[\s\S]*pointer-events: auto;[\s\S]*\}/m
  );
});

test("non-open dialogs stay hidden even when dialog classes set layout display modes", () => {
  const stylesCss = fs.readFileSync(stylesCssPath, "utf8");
  assert.match(stylesCss, /dialog:not\(\[open\]\) \{\s*display: none !important;\s*\}/m);
});

test("workspace library keeps a scrollable body and hides SSH-only sections correctly", () => {
  const stylesCss = fs.readFileSync(stylesCssPath, "utf8");
  assert.match(
    stylesCss,
    /\.workspace-manager-body \{[\s\S]*min-height: 0;[\s\S]*overflow: hidden;[\s\S]*\}/m
  );
  assert.match(
    stylesCss,
    /\.workspace-manager-panel \{[\s\S]*overflow: auto;[\s\S]*scrollbar-gutter: stable;[\s\S]*\}/m
  );
  assert.match(
    stylesCss,
    /\.workspace-manager-subsection\[hidden\],\s*\.workspace-manager-field-block\[hidden\] \{[\s\S]*display: none !important;[\s\S]*\}/m
  );
});

test("collapsed sidebar sections stay hidden even though the section body uses display grid", () => {
  const stylesCss = fs.readFileSync(stylesCssPath, "utf8");
  assert.match(stylesCss, /\.sidebar-section-body\[hidden\] \{\s*display: none !important;\s*\}/m);
});

test("send-history preview rows stay compact even for long payloads", () => {
  const stylesCss = fs.readFileSync(stylesCssPath, "utf8");
  assert.match(
    stylesCss,
    /\.send-history-item-preview \{[\s\S]*display: -webkit-box;[\s\S]*-webkit-box-orient: vertical;[\s\S]*-webkit-line-clamp: 2;[\s\S]*overflow: hidden;[\s\S]*\}/m
  );
});

test("blocked-write reclaim and trusted-local device controls have explicit layout contracts", () => {
  const stylesCss = fs.readFileSync(stylesCssPath, "utf8");
  assert.match(
    stylesCss,
    /\.command-feedback-action \{[\s\S]*display: inline-flex;[\s\S]*border-radius: 999px;[\s\S]*\}/m
  );
  assert.match(
    stylesCss,
    /\.session-control-device \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto;[\s\S]*\}/m
  );
  assert.match(
    stylesCss,
    /\.session-control-client-actions \{[\s\S]*display: flex;[\s\S]*flex-wrap: wrap;[\s\S]*\}/m
  );
});

test("session quick-send hover actions stay clickable while moving from the toolbar into the overlay", () => {
  const stylesCss = fs.readFileSync(stylesCssPath, "utf8");
  assert.match(
    stylesCss,
    /\.session-toolbar-actions \{[\s\S]*position: relative;[\s\S]*z-index: 2;[\s\S]*padding-bottom: 6px;[\s\S]*margin-bottom: -6px;[\s\S]*\}/m
  );
  assert.match(
    stylesCss,
    /\.session-quick-send-panel \{[\s\S]*top: 100%;[\s\S]*z-index: 6;[\s\S]*inline-size: max-content;[\s\S]*max-inline-size: min\(30rem, calc\(100vw - 32px\)\);[\s\S]*pointer-events: none;[\s\S]*\}/m
  );
  assert.match(
    stylesCss,
    /\.session-toolbar-actions:hover \.session-quick-send-panel:not\(\[hidden\]\),[\s\S]*\.session-toolbar-actions:focus-within \.session-quick-send-panel:not\(\[hidden\]\),[\s\S]*\.session-quick-send-panel:hover:not\(\[hidden\]\),[\s\S]*\.session-quick-send-panel:focus-within:not\(\[hidden\]\) \{[\s\S]*pointer-events: auto;[\s\S]*\}/m
  );
  assert.match(
    stylesCss,
    /\.session-quick-send-title \{[\s\S]*text-transform: uppercase;[\s\S]*\}/m
  );
  assert.match(
    stylesCss,
    /\.session-quick-send-target \{[\s\S]*text-overflow: ellipsis;[\s\S]*\}/m
  );
});
