import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const launcher = fs.readFileSync(new URL('../scripts/launch-brave.sh', import.meta.url), 'utf8');
const qualifier = fs.readFileSync(new URL('../scripts/qualify-live.mjs', import.meta.url), 'utf8');

test('launcher preserves Chromium security boundaries', () => {
  for (const unsafeFlag of ['--no-sandbox', '--disable-site-isolation-trials', '--disable-web-security']) {
    assert.equal(launcher.includes(unsafeFlag), false, `launcher must not include ${unsafeFlag}`);
  }
  assert.match(launcher, /Brave Browser\.app/);
  assert.match(launcher, /Brave-Browser/);
  assert.match(launcher, /--profile-directory=/);
  assert.match(launcher, /--new-window/);
  assert.equal(launcher.includes('--app='), false, 'launchers must use normal tabbed Brave windows');
  assert.match(
    launcher,
    /args=\([\s\S]*--user-data-dir="\$QA_ROOT"[\s\S]*--load-extension="\$EXTENSION_DIR,\$THEME_DIR"/
  );
});

test('qualification CDP is loopback-only and does not inspect authentication data', () => {
  assert.match(launcher, /--remote-debugging-address=127\.0\.0\.1/);
  assert.match(qualifier, /127\.0\.0\.1/);
  for (const forbidden of ['Network.getCookies', 'Storage.getCookies', 'Network.setBlockedURLs', 'Fetch.enable']) {
    assert.equal(qualifier.includes(forbidden), false, `qualifier must not use ${forbidden}`);
  }
});

test('launcher separates production from qualification browser state', () => {
  assert.match(launcher, /PROFILE="\$\{PAPERSET_PROFILE_DIRECTORY:-\}"/);
  assert.match(launcher, /meta\?\.name === "ChatGPT"/);
  assert.match(launcher, /PROFILE="\$\{PROFILE:-ChatGPT\}"/);
  assert.equal(launcher.includes("Profile 1"), false);
  assert.match(
    launcher,
    /QA_ROOT="\$\{PAPERSET_QA_ROOT:-\$HOME\/Library\/Application Support\/BraveSoftware\/PaperSetGPT-QA\}"/
  );
  assert.match(launcher, /QA_PROFILE="\$\{PAPERSET_QA_PROFILE_DIRECTORY:-Default\}"/);
  assert.match(launcher, /--user-data-dir="\$QA_ROOT"/);
  assert.match(launcher, /--load-extension="\$EXTENSION_DIR,\$THEME_DIR"/);
  assert.match(launcher, /rm -f "\$THEME_DIR\/Cached Theme\.pak"/);
  assert.equal(
    launcher.includes('Close all Brave windows before qualification'),
    false,
    'qualification must not require restarting the daily shared Brave root'
  );
  assert.equal(launcher.includes('--no-extension'), false, 'qualification always uses the current local components');
});

test('qualifier selects a loaded, stable ChatGPT target and records navigation timing', () => {
  assert.match(qualifier, /expression: 'location\.href'/);
  assert.match(qualifier, /No loaded ChatGPT page target/);
  assert.match(qualifier, /stableTurnSamples/);
  assert.match(qualifier, /timed out after/);
  assert.match(qualifier, /performance\.getEntriesByType\('navigation'\)/);
  assert.match(qualifier, /performance\.getEntriesByType\('paint'\)/);
});
