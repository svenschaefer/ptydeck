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
