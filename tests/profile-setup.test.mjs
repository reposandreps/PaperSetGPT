import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  PROFILE_SETTINGS_ALLOWLIST,
  RAW_PROFILE_ALLOWLIST,
  SHARED_SETTINGS_ALLOWLIST,
  detectProfileDirectory,
  getPath,
  loadConfig,
  mergeDottedPreferences,
  rootIsInUse,
  validateConfig,
} from "../scripts/configure-brave-profile.mjs";

const config = await loadConfig();
const setupScript = new URL(
  "../scripts/configure-brave-profile.mjs",
  import.meta.url,
);

test("public Brave profile config is allowlisted and contains no personal state", () => {
  assert.equal(config.version, 1);
  assert.equal(config.profileName, "ChatGPT");
  assert.equal(config.defaultProfileDirectory, "ChatGPT");
  assert.deepEqual(
    new Set(Object.keys(config.profileSettings)),
    PROFILE_SETTINGS_ALLOWLIST,
  );
  assert.deepEqual(
    new Set(Object.keys(config.rawProfilePreferences)),
    RAW_PROFILE_ALLOWLIST,
  );
  assert.deepEqual(
    new Set(Object.keys(config.sharedSettings)),
    SHARED_SETTINGS_ALLOWLIST,
  );

  const serialized = JSON.stringify(config);
  for (const forbidden of [
    "/Users/",
    "Profile 1",
    "cookie",
    "history",
    "session",
    "autofill",
    "credential",
    "password",
    "account",
    "sync",
    "token",
    "extensionId",
  ]) {
    assert.equal(
      serialized.toLowerCase().includes(forbidden.toLowerCase()),
      false,
      "config must not contain " + forbidden,
    );
  }

  assert.equal(config.profileSettings.homepage, "https://chatgpt.com/");
  assert.equal(config.profileSettings["brave.new_tab_page.shows_options"], 1);
  assert.equal(config.profileSettings["browser.show_home_button"], false);
  assert.deepEqual(config.profileSettings["toolbar.pinned_actions"], []);
  assert.equal(config.rawProfilePreferences["brave.tabs.vertical_tabs_collapsed"], true);
  assert.equal(config.rawProfilePreferences["brave.tabs.vertical_tabs_expanded_width"], 96);
});

test("protected Brave preferences cannot enter the raw-edit section", () => {
  for (const protectedKey of [
    "homepage",
    "homepage_is_newtabpage",
    "browser.show_home_button",
    "extensions.ui.developer_mode",
  ]) {
    const candidate = structuredClone(config);
    candidate.rawProfilePreferences[protectedKey] = true;
    assert.throws(() => validateConfig(candidate));
  }
});

test("profile detection reuses a display-name ChatGPT profile and otherwise uses the public directory", () => {
  const localState = {
    profile: {
      info_cache: {
        "Profile 1": { name: "ChatGPT" },
        Default: { name: "Personal" },
      },
    },
  };
  assert.equal(
    detectProfileDirectory(localState, "ChatGPT", "ChatGPT"),
    "Profile 1",
  );
  assert.equal(
    detectProfileDirectory({}, "ChatGPT", "ChatGPT"),
    "ChatGPT",
  );
  assert.equal(
    detectProfileDirectory(localState, "ChatGPT", "ChatGPT", "Explicit"),
    "Explicit",
  );
});

test("raw preference merge is deterministic and idempotent", () => {
  const first = mergeDottedPreferences(
    { unrelated: { keep: true } },
    config.rawProfilePreferences,
  );
  const snapshot = structuredClone(first);
  mergeDottedPreferences(first, config.rawProfilePreferences);
  assert.deepEqual(first, snapshot);
  assert.equal(getPath(first, "unrelated.keep"), true);
  assert.equal(getPath(first, "brave.show_screenshot_button"), false);
});

test("running-root guard distinguishes default and isolated Brave roots", () => {
  const binary = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
  const defaultRoot = "/Users/example/Library/Application Support/BraveSoftware/Brave-Browser";
  const customRoot = "/tmp/chatgpt-brave";
  const processText = [
    binary + " --profile-directory=Default",
    binary + " --user-data-dir=/tmp/other-root --profile-directory=Default",
  ].join("\n");

  assert.equal(
    rootIsInUse(processText, binary, defaultRoot, defaultRoot),
    true,
  );
  assert.equal(
    rootIsInUse(processText, binary, customRoot, defaultRoot),
    false,
  );
  assert.equal(
    rootIsInUse(
      binary + " --user-data-dir=" + customRoot + " --profile-directory=Default",
      binary,
      customRoot,
      defaultRoot,
    ),
    true,
  );
});

test("dry-run does not create or mutate the requested Brave root", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "paperset-dry-run-"));
  const braveRoot = path.join(temp, "never-created");
  const output = execFileSync(
    process.execPath,
    [
      setupScript.pathname,
      "--dry-run",
      "--profile-directory",
      "DryRunProfile",
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PAPERSET_BRAVE_ROOT: braveRoot,
        PAPERSET_BRAVE_APP: "/does/not/need/to/exist",
      },
    },
  );

  assert.match(output, /Dry run: no files or browser state changed/);
  assert.equal(existsSync(braveRoot), false);
});

test("public-facing repository guidance has no private planner or machine-local dependency", () => {
  const files = [
    new URL("../AGENTS.md", import.meta.url),
    new URL("../README.md", import.meta.url),
    new URL("../docs/architecture.md", import.meta.url),
    new URL("../docs/setup.md", import.meta.url),
  ];
  const privatePlannerName = ["day", "shift"].join("-");

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    assert.equal(text.includes(privatePlannerName), false);
    assert.equal(text.includes("/Users/"), false);
  }
});
