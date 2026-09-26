#!/usr/bin/env node

import { cp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");
const EXTENSION_DIR = path.join(ROOT, "extension");
const ARTIFACT_DIR = path.join(ROOT, ".artifacts", "chrome-web-store");

const manifest = JSON.parse(
  await readFile(path.join(EXTENSION_DIR, "manifest.json"), "utf8"),
);
const version = manifest.version;
if (!/^\d+(?:\.\d+){0,3}$/.test(version)) {
  throw new Error(`Invalid Chrome extension version: ${version}`);
}

const stageDir = path.join(ARTIFACT_DIR, `papersetgpt-v${version}`);
const zipPath = path.join(
  ARTIFACT_DIR,
  `papersetgpt-chrome-web-store-v${version}.zip`,
);

await rm(stageDir, { recursive: true, force: true });
await rm(zipPath, { force: true });
await mkdir(stageDir, { recursive: true });

for (const entry of await readdir(EXTENSION_DIR)) {
  await cp(
    path.join(EXTENSION_DIR, entry),
    path.join(stageDir, entry),
    { recursive: true },
  );
}

for (const file of ["LICENSE", "THIRD_PARTY_NOTICES.md"]) {
  await cp(path.join(ROOT, file), path.join(stageDir, file));
}

const result = spawnSync(
  "zip",
  ["-X", "-q", "-r", zipPath, "."],
  { cwd: stageDir, stdio: "inherit" },
);
if (result.status !== 0) {
  throw new Error(`zip failed with exit code ${result.status ?? "unknown"}`);
}

console.log(zipPath);
