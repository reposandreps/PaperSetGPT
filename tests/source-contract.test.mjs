import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const contentStylesUrl = new URL("../extension/content.css", import.meta.url);
const contentRuntimeUrl = new URL("../extension/content.js", import.meta.url);
const optionsRuntimeUrl = new URL("../extension/options.js", import.meta.url);
const optionsHtmlUrl = new URL("../extension/options.html", import.meta.url);

const forbiddenNetworkPatterns = [
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\bEventSource\b/
];

test("runtime scripts contain no extension-originated network APIs", async () => {
  for (const file of [contentRuntimeUrl, optionsRuntimeUrl]) {
    const source = await readFile(file, "utf8");
    for (const pattern of forbiddenNetworkPatterns) {
      assert.equal(pattern.test(source), false, `${file.pathname} must not use ${pattern}`);
    }
  }
});

test("content script decorates rather than replaces ChatGPT-owned DOM", async () => {
  const source = await readFile(contentRuntimeUrl, "utf8");
  const sourceWithoutClassRemovals = source.replace(/\.classList\.remove\s*\(/g, ".classListRemove(");

  for (const pattern of [
    /\.innerHTML\s*=/,
    /\.outerHTML\s*=/,
    /\.replaceWith\s*\(/,
    /\.replaceChildren\s*\(/,
    /\.remove\s*\(/
  ]) {
    assert.equal(pattern.test(sourceWithoutClassRemovals), false);
  }
});

test("ChatGPT application colours are not owned by extension CSS or runtime", async () => {
  const styles = await readFile(contentStylesUrl, "utf8");
  const runtime = await readFile(contentRuntimeUrl, "utf8");
  const options = await readFile(optionsHtmlUrl, "utf8");

  for (const obsolete of [
    "paperset-theme-soft",
    "--main-surface-primary",
    "--sidebar-surface-primary",
    "--text-primary",
    "--message-surface",
    "--composer-surface"
  ]) {
    assert.equal(styles.includes(obsolete), false, `content.css must not own ${obsolete}`);
  }

  for (const obsolete of [
    "softTheme",
    "palette",
    "PAPERSET_THEME_CONFIG",
    "MATERIALIZATION_PROMPT_PATTERN",
    "CITATION_PILL_SELECTOR",
    "USER_INLINE_CODE_SELECTOR"
  ]) {
    assert.equal(runtime.includes(obsolete), false, `content.js must not own ${obsolete}`);
  }

  assert.equal(options.includes('id="softTheme"'), false);
  assert.equal(options.includes('id="paletteEditor"'), false);
  assert.equal(options.includes('theme-config.js'), false);
});

test("off-screen containment stays the safe CSS-only default", async () => {
  const styles = await readFile(contentStylesUrl, "utf8");
  const runtime = await readFile(contentRuntimeUrl, "utf8");

  assert.match(runtime, /containTurns:\s*true/);
  assert.match(styles, /html\.paperset-contain-turns \.paperset-turn/);
  assert.match(styles, /content-visibility:\s*auto/);
  assert.match(styles, /contain-intrinsic-size:\s*auto 240px/);
  assert.match(runtime, /if \(!settings\.hibernateOldTurns\) \{\s*return;\s*\}/);
});

test("optional old-turn hibernation is distinct and viewport-observed only when enabled", async () => {
  const styles = await readFile(contentStylesUrl, "utf8");
  const runtime = await readFile(contentRuntimeUrl, "utf8");
  const optionsHtml = await readFile(optionsHtmlUrl, "utf8");
  const optionsRuntime = await readFile(optionsRuntimeUrl, "utf8");

  assert.match(runtime, /hibernateOldTurns:\s*false/);
  assert.match(runtime, /new IntersectionObserver/);
  assert.match(runtime, /rootMargin:\s*"1200px 0px"/);
  assert.match(styles, /paperset-hibernate-old/);
  assert.match(styles, /content-visibility:\s*hidden\s*!important/);
  assert.match(styles, /contain-intrinsic-block-size:\s*var\(--paperset-turn-height, 240px\)/);
  assert.match(optionsHtml, /id="keepRecentTurns"[^>]*min="5"/);

  for (const source of [runtime, optionsRuntime]) {
    assert.match(source, /const MIN_KEEP_RECENT_TURNS = 5;/);
    assert.match(source, /Math\.max\(MIN_KEEP_RECENT_TURNS, parsed\)/);
  }
});

test("image hints only fill missing attributes and only remove PaperSet-owned hints", async () => {
  const runtime = await readFile(contentRuntimeUrl, "utf8");

  assert.match(runtime, /if \(!image\.hasAttribute\("loading"\)\)/);
  assert.match(runtime, /image\.setAttribute\("loading", "lazy"\)/);
  assert.match(runtime, /data-paperset-added-loading/);
  assert.match(runtime, /if \(image\.hasAttribute\(ADDED_LOADING_ATTR\)\)/);

  assert.match(runtime, /if \(!image\.hasAttribute\("decoding"\)\)/);
  assert.match(runtime, /image\.setAttribute\("decoding", "async"\)/);
  assert.match(runtime, /data-paperset-added-decoding/);
  assert.match(runtime, /if \(image\.hasAttribute\(ADDED_DECODING_ATTR\)\)/);
});

test("Atkinson Hyperlegible Next and Mono stay bundled locally", async () => {
  const fontStyles = await readFile(new URL("../extension/fonts.css", import.meta.url), "utf8");
  const regular = await readFile(new URL("../extension/fonts/AtkinsonHyperlegibleNext-Variable.ttf", import.meta.url));
  const italic = await readFile(new URL("../extension/fonts/AtkinsonHyperlegibleNext-Italic-Variable.ttf", import.meta.url));
  const monoRegular = await readFile(new URL("../extension/fonts/AtkinsonHyperlegibleMono-Variable.ttf", import.meta.url));
  const monoItalic = await readFile(new URL("../extension/fonts/AtkinsonHyperlegibleMono-Italic-Variable.ttf", import.meta.url));
  const license = await readFile(new URL("../extension/fonts/OFL.txt", import.meta.url), "utf8");
  const monoLicense = await readFile(new URL("../extension/fonts/OFL-Mono.txt", import.meta.url), "utf8");

  assert.ok(regular.length > 100000);
  assert.ok(italic.length > 100000);
  assert.ok(monoRegular.length > 50000);
  assert.ok(monoItalic.length > 50000);
  assert.match(fontStyles, /PaperSet Atkinson Hyperlegible Next/);
  assert.match(fontStyles, /PaperSet Atkinson Hyperlegible Mono/);
  assert.equal(/https?:\/\//.test(fontStyles), false);
  assert.match(license, /SIL Open Font License, Version 1\.1/);
  assert.match(monoLicense, /SIL Open Font License, Version 1\.1/);
});

test("reading font picker stays accessible and code remains monospace", async () => {
  const optionsHtml = await readFile(optionsHtmlUrl, "utf8");
  const optionsRuntime = await readFile(optionsRuntimeUrl, "utf8");
  const optionsStyles = await readFile(new URL("../extension/options.css", import.meta.url), "utf8");
  const contentRuntime = await readFile(contentRuntimeUrl, "utf8");
  const styles = await readFile(contentStylesUrl, "utf8");

  assert.match(optionsHtml, /id="readingFontTrigger"/);
  assert.match(optionsHtml, /aria-haspopup="listbox"/);
  assert.match(optionsHtml, /id="readingFontList"[^>]*role="listbox"/);
  assert.match(optionsHtml, /id="readingTextColorPicker"[^>]*type="color"/);
  assert.match(optionsHtml, /id="readingTextColorHex"[^>]*placeholder="Native"/);
  assert.match(optionsHtml, /id="readingTextColorReset"/);

  for (const value of ["chatgpt", "atkinson", "atkinson-mono", "verdana", "open-sans", "arial", "tahoma", "trebuchet", "calibri", "century-gothic"]) {
    assert.ok(optionsHtml.includes(`data-value="${value}"`));
    assert.ok(optionsStyles.includes(`[data-font="${value}"]`));
  }

  assert.match(optionsRuntime, /readingFont:\s*"atkinson"/);
  assert.match(optionsRuntime, /aria-selected/);
  assert.match(optionsRuntime, /event\.key === "Escape"/);
  assert.match(contentRuntime, /READING_FONT_CLASS_BY_SETTING/);
  assert.match(contentRuntime, /chrome\.runtime\.getURL\("fonts\.css"\)/);
  assert.match(styles, /html\[class\*="paperset-font-"\] pre/);
  assert.match(styles, /var\(--font-mono\), ui-monospace/);
});


test("optional reading text colour stays native by default and prose-scoped", async () => {
  const optionsHtml = await readFile(optionsHtmlUrl, "utf8");
  const optionsRuntime = await readFile(optionsRuntimeUrl, "utf8");
  const contentRuntime = await readFile(contentRuntimeUrl, "utf8");
  const styles = await readFile(contentStylesUrl, "utf8");

  for (const runtime of [optionsRuntime, contentRuntime]) {
    assert.match(runtime, /readingTextColor:\s*""/);
    assert.match(runtime, /function normalizeReadingTextColor\(value\)/);
    assert.match(runtime, /\/\^#\[0-9a-f\]\{6\}\$\/i/);
  }

  assert.match(optionsRuntime, /readingTextColorReset\.addEventListener\("click"/);
  assert.match(optionsRuntime, /renderReadingTextColor\(""\)/);
  assert.match(optionsRuntime, /event\.stopPropagation\(\)/);
  assert.match(contentRuntime, /style\.setProperty\("--paperset-reading-text-colour"/);
  assert.match(contentRuntime, /style\.removeProperty\("--paperset-reading-text-colour"/);

  assert.match(styles, /html\.paperset-reading-colour \.paperset-turn \[data-message-author-role\] :where\(/);
  for (const proseTag of ["p", "li", "blockquote", "h1", "th", "td"]) {
    assert.ok(styles.includes("  " + proseTag + ",") || styles.includes("  " + proseTag + String.fromCharCode(10)));
  }

  assert.doesNotMatch(styles, /paperset-reading-colour\s+body/);
  assert.doesNotMatch(styles, /paperset-reading-colour\s+\*/);
  assert.doesNotMatch(styles, /--paperset-reading-text-colour\)\s*!important/);
  const readingColourRule = styles.slice(
    styles.indexOf("html.paperset-reading-colour"),
    styles.indexOf("html.paperset-reduce-effects")
  );
  for (const excluded of [" a,", " code,", " pre,", " button,", "[role=\"button\"]"]) {
    assert.equal(readingColourRule.includes(excluded), false);
  }

  assert.match(optionsRuntime, /raw\.startsWith\("#"\) \? raw : "#" \+ raw/);
  assert.match(optionsRuntime, /candidate\.toLowerCase\(\) : null/);
  assert.match(contentRuntime, /candidate\.toLowerCase\(\) : ""/);
  assert.match(optionsHtml, /Use ChatGPT foreground/);
});

test("native PaperSet theme payload is valid and carries the canonical visual anchors", async () => {
  const raw = (await readFile(
    new URL("../native-theme/paperset-light.import.txt", import.meta.url),
    "utf8"
  )).trim();

  const prefix = "codex-theme-v1:";
  assert.ok(raw.startsWith(prefix));
  const payload = JSON.parse(raw.slice(prefix.length));

  assert.equal(payload.variant, "light");
  assert.equal(payload.codeThemeId, "everforest");
  assert.equal(payload.theme.surface.toLowerCase(), "#fdf6e3");
  assert.equal(payload.theme.ink.toLowerCase(), "#485860");
  assert.equal(payload.theme.accent.toLowerCase(), "#5f7565");
  assert.equal(payload.theme.accentSource, "custom");
  assert.equal(payload.theme.contrast, 42);
  assert.deepEqual(payload.theme.fonts, { code: null, ui: null });
  assert.equal(payload.theme.semanticColors.diffAdded.toLowerCase(), "#5f7565");
  assert.equal(payload.theme.semanticColors.diffRemoved.toLowerCase(), "#b6655a");
  assert.equal(payload.theme.semanticColors.skill.toLowerCase(), "#788f7e");
});

test("theme copy helper prints exactly the tracked native payload", async () => {
  const expected = await readFile(
    new URL("../native-theme/paperset-light.import.txt", import.meta.url),
    "utf8"
  );
  const actual = execFileSync(process.execPath, ["scripts/copy-theme.mjs", "--print"], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  assert.equal(actual, expected);
});

test("public source uses PaperSetGPT branding without legacy project identifiers", async () => {
  const files = [
    "../README.md",
    "../PRIVACY.md",
    "../AGENTS.md",
    "../package.json",
    "../docs/setup.md",
    "../docs/architecture.md",
    "../extension/manifest.json",
    "../extension/options.html",
    "../extension/content.css",
    "../extension/content.js",
    "../extension/fonts.css",
    "../extension/options.css",
    "../extension/options.js",
    "../browser-theme/manifest.json",
    "../native-theme/paperset-light.import.txt",
    "../scripts/configure-brave-profile.mjs",
    "../scripts/launch-brave.sh",
    "../scripts/qualify-live.mjs",
    "../scripts/copy-output-style.mjs",
    "../scripts/copy-theme.mjs",
    "../.agents/skills/paperset-output/SKILL.md"
  ];

  const legacyNames = [
    ["ChatGPT", "Brave", "Lite"].join(" "),
    ["chatgpt", "brave", "lite"].join("-"),
    ["ChatGPT", "Brave", "Lite"].join("-"),
    ["C", "B", "L", "_"].join(""),
    ["c", "b", "l", "-"].join("")
  ];

  for (const relative of files) {
    const source = await readFile(new URL(relative, import.meta.url), "utf8");
    for (const legacy of legacyNames) {
      assert.equal(source.includes(legacy), false, `${relative} exposes ${legacy}`);
    }
  }
});

test("output-style helper still derives exactly from the standalone PaperSet skill", async () => {
  const skill = await readFile(
    new URL("../.agents/skills/paperset-output/SKILL.md", import.meta.url),
    "utf8"
  );
  const expected = skill
    .replace(/^---\n[\s\S]*?\n---\n+/, "")
    .replace(/^# PaperSet output\n+/, "")
    .trim() + "\n";
  const actual = execFileSync(process.execPath, ["scripts/copy-output-style.mjs", "--print"], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  assert.equal(actual, expected);
  assert.match(skill, /name: paperset-output/);
  assert.match(actual, /Progressive reading/);
});

test("project license is GPL-3.0-or-later while bundled fonts retain OFL licensing", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  const license = await readFile(new URL("../LICENSE", import.meta.url), "utf8");
  const fontLicense = await readFile(new URL("../extension/fonts/OFL.txt", import.meta.url), "utf8");
  const monoFontLicense = await readFile(new URL("../extension/fonts/OFL-Mono.txt", import.meta.url), "utf8");

  assert.equal(packageJson.license, "GPL-3.0-or-later");
  assert.match(readme, /GPL-3\.0-or-later/);
  assert.match(license, /GNU GENERAL PUBLIC LICENSE/);
  assert.match(fontLicense, /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.match(monoFontLicense, /SIL OPEN FONT LICENSE Version 1\.1/);
});
