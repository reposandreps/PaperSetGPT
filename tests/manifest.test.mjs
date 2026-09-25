import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const manifest = JSON.parse(
  await readFile(new URL("../extension/manifest.json", import.meta.url), "utf8")
);
const browserTheme = JSON.parse(
  await readFile(new URL("../browser-theme/manifest.json", import.meta.url), "utf8")
);

test("extension uses the narrow expected permission surface", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.equal("host_permissions" in manifest, false);
  assert.equal("background" in manifest, false);
  assert.equal("externally_connectable" in manifest, false);
  assert.deepEqual(manifest.web_accessible_resources, [
    {
      resources: [
        "fonts.css",
        "fonts/AtkinsonHyperlegibleNext-Variable.ttf",
        "fonts/AtkinsonHyperlegibleNext-Italic-Variable.ttf",
        "fonts/AtkinsonHyperlegibleMono-Variable.ttf",
        "fonts/AtkinsonHyperlegibleMono-Italic-Variable.ttf"
      ],
      matches: [
        "https://chatgpt.com/*",
        "https://chat.openai.com/*"
      ]
    }
  ]);
});

test("content script runs only on ChatGPT origins", () => {
  assert.equal(manifest.content_scripts.length, 1);
  assert.deepEqual(manifest.content_scripts[0].matches, [
    "https://chatgpt.com/*",
    "https://chat.openai.com/*"
  ]);
  assert.deepEqual(manifest.content_scripts[0].js, ["content.js"]);
  assert.deepEqual(manifest.content_scripts[0].css, ["content.css"]);
});

test("extension has no persistent runtime", () => {
  assert.equal(manifest.options_page, "options.html");
  assert.equal(manifest.content_scripts[0].run_at, "document_start");
});

test("browser theme is declarative and permissionless", () => {
  assert.equal(browserTheme.manifest_version, 3);
  assert.equal("permissions" in browserTheme, false);
  assert.equal("host_permissions" in browserTheme, false);
  assert.equal("background" in browserTheme, false);
  assert.equal("content_scripts" in browserTheme, false);
  assert.equal("options_page" in browserTheme, false);
  assert.deepEqual(browserTheme.theme.colors.frame, [95, 117, 101]);
  assert.deepEqual(browserTheme.theme.colors.frame_inactive, [95, 117, 101]);
  assert.deepEqual(browserTheme.theme.colors.toolbar, [253, 246, 227]);
  assert.deepEqual(browserTheme.theme.colors.tab_background_text, [72, 88, 96]);
  assert.deepEqual(browserTheme.theme.colors.tab_background_text_inactive, [72, 88, 96]);
});
