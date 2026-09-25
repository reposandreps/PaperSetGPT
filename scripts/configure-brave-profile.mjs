#!/usr/bin/env node

import { copyFile, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const SCRIPT_FILE = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(SCRIPT_FILE);
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const CONFIG_PATH = path.join(REPO_ROOT, "config", "brave-profile.json");
const DEFAULT_BRAVE_APP = "/Applications/Brave Browser.app";
const DEFAULT_BRAVE_ROOT = path.join(
  process.env.HOME || "",
  "Library/Application Support/BraveSoftware/Brave-Browser",
);
const DEFAULT_PORT = 9231;

// Public config is intentionally limited to these reviewed preference surfaces.
export const PROFILE_SETTINGS_ALLOWLIST = new Set([
  "brave.tabs.vertical_tabs_enabled",
  "brave.tabs.vertical_tabs_hide_completely_when_collapsed",
  "brave.tabs.vertical_tabs_show_toggle_button",
  "brave.tabs.tree_tabs_enabled",
  "brave.tabs.vertical_tabs_expanded_state_per_window",
  "brave.show_bookmarks_button",
  "brave.show_side_panel_button",
  "brave.ai_chat.show_toolbar_button",
  "brave.brave_vpn.show_button",
  "brave.wallet.show_wallet_icon_on_toolbar",
  "brave.today.should_show_toolbar_button",
  "browser.show_forward_button",
  "browser.show_home_button",
  "brave.new_tab_page.shows_options",
  "homepage",
  "homepage_is_newtabpage",
  "toolbar.pinned_actions",
  "search.suggest_enabled",
  "brave.enable_media_router_on_restart",
  "brave.web_discovery_enabled",
  "brave.new_tab_page.show_background_image",
  "brave.new_tab_page.show_branded_background_image",
  "brave.new_tab_page.show_rewards",
  "brave.new_tab_page.show_brave_vpn",
  "brave.new_tab_page.show_stats",
  "brave.new_tab_page.show_together",
]);

// Raw writes happen only after Brave closes; keep protected/tracked prefs out of this list.
export const RAW_PROFILE_ALLOWLIST = new Set([
  "brave.tabs.vertical_tabs_collapsed",
  "brave.tabs.vertical_tabs_expanded_width",
  "brave.tabs.vertical_tabs_floating_enabled",
  "brave.tabs.vertical_tabs_on_right",
  "brave.tabs.vertical_tabs_show_scrollbar",
  "brave.show_screenshot_button",
  "media_router.enable_media_router",
  "tab_search.pinned_to_tabstrip",
]);

export const SHARED_SETTINGS_ALLOWLIST = new Set([
  "background_mode.enabled",
  "hardware_acceleration_mode.enabled",
  "performance_tuning.high_efficiency_mode.state",
  "performance_tuning.battery_saver_mode.state",
]);

const FORBIDDEN_CONFIG_PATTERN =
  /(cookie|history|session|autofill|credential|password|account|identity|sync|token|extension.?id|\/users\/)/i;

export function parseArgs(argv) {
  const options = {
    dryRun: false,
    includeShared: false,
    noOpen: false,
    profileDirectory: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--include-shared") {
      options.includeShared = true;
    } else if (arg === "--no-open") {
      options.noOpen = true;
    } else if (arg === "--profile-directory") {
      const value = argv[++i];
      if (!value || value.startsWith("--")) {
        throw new Error("--profile-directory requires a value");
      }
      options.profileDirectory = value;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error("Unknown argument: " + arg);
    }
  }
  return options;
}

export function validateConfig(config) {
  if (!config || config.version !== 1) {
    throw new Error("Unsupported or missing brave-profile config version");
  }
  if (typeof config.profileName !== "string" || !config.profileName.trim()) {
    throw new Error("profileName must be a non-empty string");
  }
  if (
    typeof config.defaultProfileDirectory !== "string" ||
    !config.defaultProfileDirectory.trim() ||
    /[\\/]/.test(config.defaultProfileDirectory)
  ) {
    throw new Error("defaultProfileDirectory must be a directory name");
  }

  const sections = [
    ["profileSettings", config.profileSettings, PROFILE_SETTINGS_ALLOWLIST],
    ["rawProfilePreferences", config.rawProfilePreferences, RAW_PROFILE_ALLOWLIST],
    ["sharedSettings", config.sharedSettings, SHARED_SETTINGS_ALLOWLIST],
  ];

  for (const [name, value, allowlist] of sections) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(name + " must be an object");
    }
    for (const [key, setting] of Object.entries(value)) {
      if (!allowlist.has(key)) {
        throw new Error(name + " contains unsupported preference: " + key);
      }
      if (FORBIDDEN_CONFIG_PATTERN.test(key)) {
        throw new Error(name + " contains forbidden preference: " + key);
      }
      if (
        !(
          setting === null ||
          ["string", "number", "boolean"].includes(typeof setting) ||
          Array.isArray(setting)
        )
      ) {
        throw new Error(name + "." + key + " has unsupported value type");
      }
    }
  }

  for (const key of Object.keys(config.rawProfilePreferences)) {
    if (
      key === "homepage" ||
      key === "homepage_is_newtabpage" ||
      key === "browser.show_home_button" ||
      key.startsWith("extensions.")
    ) {
      throw new Error("Protected preference must not be raw-edited: " + key);
    }
  }
  return config;
}

export function getPath(object, dottedPath) {
  let current = object;
  for (const segment of dottedPath.split(".")) {
    if (!current || typeof current !== "object" || !(segment in current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

export function setPath(object, dottedPath, value) {
  const segments = dottedPath.split(".");
  let current = object;
  for (const segment of segments.slice(0, -1)) {
    if (
      !current[segment] ||
      typeof current[segment] !== "object" ||
      Array.isArray(current[segment])
    ) {
      current[segment] = {};
    }
    current = current[segment];
  }
  current[segments.at(-1)] = structuredClone(value);
  return object;
}

export function mergeDottedPreferences(object, preferences) {
  for (const [key, value] of Object.entries(preferences)) {
    setPath(object, key, value);
  }
  return object;
}

export function detectProfileDirectory(
  localState,
  profileName,
  defaultDirectory,
  explicitDirectory = null,
) {
  if (explicitDirectory) {
    if (/[\\/]/.test(explicitDirectory)) {
      throw new Error("--profile-directory must be a directory name");
    }
    return explicitDirectory;
  }

  const infoCache = localState?.profile?.info_cache ?? {};
  const matches = Object.entries(infoCache)
    .filter(([, metadata]) => metadata?.name === profileName)
    .map(([directory]) => directory);

  if (matches.length > 1) {
    throw new Error(
      'More than one Brave profile is named "' +
        profileName +
        '". Use --profile-directory.',
    );
  }
  if (matches.length === 1) {
    return matches[0];
  }

  const fallbackMetadata = infoCache[defaultDirectory];
  if (fallbackMetadata?.name && fallbackMetadata.name !== profileName) {
    throw new Error(
      'Profile directory "' +
        defaultDirectory +
        '" already belongs to "' +
        fallbackMetadata.name +
        '". Use --profile-directory or rename that profile.',
    );
  }
  return defaultDirectory;
}

function normalizeRoot(value) {
  return path.resolve(value.replace(/^~(?=\/)/, process.env.HOME || "~"));
}

function extractUserDataRoot(line) {
  const marker = "--user-data-dir=";
  const start = line.indexOf(marker);
  if (start < 0) {
    return null;
  }
  let value = line.slice(start + marker.length);
  if (value.startsWith('"')) {
    const end = value.indexOf('"', 1);
    return end < 0 ? value.slice(1) : value.slice(1, end);
  }
  if (value.startsWith("'")) {
    const end = value.indexOf("'", 1);
    return end < 0 ? value.slice(1) : value.slice(1, end);
  }
  const nextFlag = value.indexOf(" --");
  if (nextFlag >= 0) {
    value = value.slice(0, nextFlag);
  }
  return value.trim();
}

export function rootIsInUse(
  processText,
  braveBinary,
  root,
  defaultRoot = DEFAULT_BRAVE_ROOT,
) {
  const normalizedRoot = normalizeRoot(root);
  const normalizedDefault = normalizeRoot(defaultRoot);

  return processText.split("\n").some((line) => {
    if (!line.includes(braveBinary)) {
      return false;
    }
    const configuredRoot = extractUserDataRoot(line);
    const normalizedConfigured = configuredRoot
      ? normalizeRoot(configuredRoot)
      : null;

    if (normalizedRoot === normalizedDefault) {
      return normalizedConfigured === null || normalizedConfigured === normalizedRoot;
    }
    return normalizedConfigured === normalizedRoot;
  });
}

async function readJson(file, fallback = {}) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return structuredClone(fallback);
    }
    throw error;
  }
}

async function writeJsonAtomic(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = file + ".papersetgpt.tmp-" + process.pid;
  await writeFile(temp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  await rename(temp, file);
}

async function backupOnce(file) {
  if (!existsSync(file)) {
    return;
  }
  const backup = file + ".papersetgpt.bak";
  if (!existsSync(backup)) {
    await copyFile(file, backup);
  }
}

function valuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function waitForCdp(port, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://127.0.0.1:" + port + "/json/version");
      if (response.ok) {
        return await response.json();
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Brave setup browser did not expose CDP on port " + port);
}

async function cdpPage(port) {
  const targets = await (
    await fetch("http://127.0.0.1:" + port + "/json/list")
  ).json();
  const target = targets.find((item) => item.type === "page");
  if (!target) {
    throw new Error("Brave setup page target was not found");
  }

  const websocket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    websocket.addEventListener("open", resolve, { once: true });
    websocket.addEventListener("error", reject, { once: true });
  });

  let nextId = 0;
  const pending = new Map();
  websocket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) {
      return;
    }
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) {
      reject(new Error(message.error.message || JSON.stringify(message.error)));
    } else {
      resolve(message.result);
    }
  });

  const call = (method, params = {}) => {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      websocket.send(JSON.stringify({ id, method, params }));
    });
  };
  return { websocket, call };
}

async function navigateAndWait(call, url, expectedFragment) {
  await call("Page.enable");
  await call("Page.navigate", { url });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const result = await call("Runtime.evaluate", {
      expression: "location.href",
      returnByValue: true,
    });
    const href = result.result?.value || "";
    if (href.includes(expectedFragment)) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return href;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out navigating setup page to " + url);
}

async function applySettingsPrivate(call, preferences, label) {
  if (Object.keys(preferences).length === 0) {
    return;
  }

  const fn = async function apply(preferences) {
    const out = {};
    for (const [key, value] of Object.entries(preferences)) {
      const before = await new Promise((resolve) =>
        chrome.settingsPrivate.getPref(key, resolve),
      );
      if (!before) {
        out[key] = { ok: false, error: "preference unavailable" };
        continue;
      }
      const saved = await new Promise((resolve) =>
        chrome.settingsPrivate.setPref(key, value, "", resolve),
      );
      const after = await new Promise((resolve) =>
        chrome.settingsPrivate.getPref(key, resolve),
      );
      out[key] = {
        ok:
          saved === true &&
          JSON.stringify(after?.value) === JSON.stringify(value),
        value: after?.value,
        type: after?.type,
      };
    }
    return out;
  };

  const response = await call("Runtime.evaluate", {
    expression: "(" + fn.toString() + ")(" + JSON.stringify(preferences) + ")",
    returnByValue: true,
    awaitPromise: true,
  });
  const results = response.result?.value ?? {};
  const failures = Object.entries(results).filter(([, value]) => !value?.ok);
  if (failures.length > 0) {
    const details = failures
      .map(
        ([key, value]) =>
          key + ": " + (value?.error || JSON.stringify(value?.value)),
      )
      .join(", ");
    throw new Error("Could not apply " + label + ": " + details);
  }
}

async function enableDeveloperMode(call) {
  await navigateAndWait(call, "brave://extensions/", "extensions");
  const expression =
    "new Promise(async (resolve) => {" +
    "const before=await chrome.developerPrivate.getProfileConfiguration();" +
    "await chrome.developerPrivate.updateProfileConfiguration({inDeveloperMode:true});" +
    "const after=await chrome.developerPrivate.getProfileConfiguration();" +
    "resolve({before:before.inDeveloperMode,after:after.inDeveloperMode,canLoadUnpacked:after.canLoadUnpacked});" +
    "})";
  const response = await call("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  const value = response.result?.value;
  if (!value?.after || value?.canLoadUnpacked === false) {
    throw new Error("Could not enable extension Developer Mode");
  }
}

async function closeSetupBrowser(call, websocket, child) {
  try {
    await call("Browser.close");
  } catch {}
  websocket.close();

  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  child.kill("SIGTERM");
  throw new Error("Setup browser did not close cleanly");
}

export async function loadConfig(file = CONFIG_PATH) {
  return validateConfig(JSON.parse(await readFile(file, "utf8")));
}

export function helpText() {
  return [
    "Usage: npm run brave:setup -- [options]",
    "",
    "Options:",
    "  --dry-run                 Show the target and settings without changing Brave.",
    "  --include-shared          Also apply browser-wide performance settings.",
    "  --profile-directory NAME  Configure this Brave profile directory explicitly.",
    "  --no-open                 Do not reopen brave://extensions after setup.",
    "  -h, --help                Show this help.",
    "",
    "Brave must be fully closed for a real setup run.",
  ].join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(helpText());
    return;
  }

  const config = await loadConfig();
  const braveApp = process.env.PAPERSET_BRAVE_APP || DEFAULT_BRAVE_APP;
  const braveBinary = path.join(braveApp, "Contents/MacOS/Brave Browser");
  const braveRoot = normalizeRoot(
    process.env.PAPERSET_BRAVE_ROOT || DEFAULT_BRAVE_ROOT,
  );
  const localStateFile = path.join(braveRoot, "Local State");
  const localState = await readJson(localStateFile, {});
  const profileDirectory = detectProfileDirectory(
    localState,
    config.profileName,
    config.defaultProfileDirectory,
    options.profileDirectory,
  );
  const profileRoot = path.join(braveRoot, profileDirectory);
  const profileExists = existsSync(path.join(profileRoot, "Preferences"));

  console.log("Brave root: " + braveRoot);
  console.log(
    "Profile: " + profileDirectory + (profileExists ? "" : " (will create)"),
  );
  console.log(
    "Profile settings: " + Object.keys(config.profileSettings).length,
  );
  console.log(
    "Shared browser settings: " +
      (options.includeShared ? "included" : "skipped"),
  );
  console.log("Browser theme: installed/persisted from browser-theme/");
  console.log(
    "ChatGPT extension: one manual Load unpacked selection remains",
  );

  if (options.dryRun) {
    console.log("Dry run: no files or browser state changed.");
    return;
  }

  if (process.platform !== "darwin") {
    throw new Error(
      "Automated Brave profile setup is currently qualified only on macOS",
    );
  }
  if (!existsSync(braveBinary)) {
    throw new Error("Brave was not found at " + braveBinary);
  }
  if (typeof WebSocket !== "function") {
    throw new Error(
      "Node 22 or newer is required (global WebSocket unavailable)",
    );
  }

  const processText = execFileSync("ps", ["-axo", "command="], {
    encoding: "utf8",
  });
  // The default macOS root is implicit in a normal Brave process, so an active
  // main browser process without --user-data-dir must block setup too.
  if (rootIsInUse(processText, braveBinary, braveRoot)) {
    throw new Error(
      "This Brave user-data root is currently in use. Quit Brave completely and rerun setup. No browser was changed.",
    );
  }

  const port = Number.parseInt(
    process.env.PAPERSET_SETUP_CDP_PORT || String(DEFAULT_PORT),
    10,
  );
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(
      "PAPERSET_SETUP_CDP_PORT must be a valid non-privileged TCP port",
    );
  }
  try {
    const response = await fetch(
      "http://127.0.0.1:" + port + "/json/version",
    );
    if (response.ok) {
      throw new Error("Setup CDP port " + port + " is already in use");
    }
  } catch (error) {
    if (String(error?.message || "").includes("already in use")) {
      throw error;
    }
  }

  await mkdir(braveRoot, { recursive: true });
  await backupOnce(localStateFile);
  await backupOnce(path.join(profileRoot, "Preferences"));
  await backupOnce(path.join(profileRoot, "Secure Preferences"));

  const themeDirectory = path.join(REPO_ROOT, "browser-theme");
  const cachedTheme = path.join(themeDirectory, "Cached Theme.pak");
  try {
    await unlink(cachedTheme);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  const child = spawn(
    braveBinary,
    [
      "--user-data-dir=" + braveRoot,
      "--profile-directory=" + profileDirectory,
      "--no-first-run",
      "--no-default-browser-check",
      "--new-window",
      "--load-extension=" + themeDirectory,
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=" + port,
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  let connection;
  try {
    await waitForCdp(port);
    connection = await cdpPage(port);
    await navigateAndWait(
      connection.call,
      "brave://settings/appearance",
      "settings",
    );
    await applySettingsPrivate(
      connection.call,
      config.profileSettings,
      "profile settings",
    );
    if (options.includeShared) {
      await applySettingsPrivate(
        connection.call,
        config.sharedSettings,
        "shared browser settings",
      );
    }
    await enableDeveloperMode(connection.call);
    await closeSetupBrowser(
      connection.call,
      connection.websocket,
      child,
    );
  } catch (error) {
    if (connection?.websocket) {
      connection.websocket.close();
    }
    if (child.exitCode === null) {
      child.kill("SIGTERM");
    }
    throw error;
  }

  // Only RAW_PROFILE_ALLOWLIST reaches this post-close block. Protected prefs
  // were applied through Brave settingsPrivate so its integrity MACs stay valid.
  const preferencesFile = path.join(profileRoot, "Preferences");
  const preferences = await readJson(preferencesFile, {});
  mergeDottedPreferences(preferences, config.rawProfilePreferences);
  await writeJsonAtomic(preferencesFile, preferences);

  const updatedLocalState = await readJson(localStateFile, {});
  updatedLocalState.profile ??= {};
  updatedLocalState.profile.info_cache ??= {};
  updatedLocalState.profile.info_cache[profileDirectory] ??= {};
  updatedLocalState.profile.info_cache[profileDirectory].name =
    config.profileName;
  await writeJsonAtomic(localStateFile, updatedLocalState);

  const finalPreferences = await readJson(preferencesFile, {});
  for (const [key, value] of Object.entries(
    config.rawProfilePreferences,
  )) {
    if (!valuesEqual(getPath(finalPreferences, key), value)) {
      throw new Error(
        "Raw profile preference verification failed: " + key,
      );
    }
  }

  const finalLocalState = await readJson(localStateFile, {});
  if (
    finalLocalState?.profile?.info_cache?.[profileDirectory]?.name !==
    config.profileName
  ) {
    throw new Error("Profile display-name verification failed");
  }

  const theme = finalPreferences?.extensions?.theme;
  if (
    !theme?.id ||
    path.resolve(theme.pack || "") !== path.resolve(themeDirectory)
  ) {
    throw new Error(
      "Browser theme did not persist in the configured profile",
    );
  }

  console.log("Profile setup complete.");
  console.log("Browser theme active: " + theme.id);
  if (options.includeShared) {
    console.log(
      "Shared performance settings applied to this Brave user-data root.",
    );
  }
  console.log(
    "Remaining step: click Load unpacked and choose the repository extension/ folder.",
  );
  console.log(
    "Optional output style: run npm run output-style:copy and paste it into ChatGPT Custom Instructions.",
  );

  if (!options.noOpen) {
    const launcher = spawn(
      braveBinary,
      [
        "--user-data-dir=" + braveRoot,
        "--profile-directory=" + profileDirectory,
        "--no-first-run",
        "--no-default-browser-check",
        "--new-window",
        "brave://extensions/",
      ],
      { detached: true, stdio: "ignore" },
    );
    launcher.unref();
  }
}

const isDirect =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirect) {
  main().catch((error) => {
    console.error("Setup failed: " + error.message);
    process.exitCode = 1;
  });
}
