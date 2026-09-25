#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const skillUrl = new URL(
  "../.agents/skills/paperset-output/SKILL.md",
  import.meta.url,
);
const printOnly = process.argv.includes("--print");

let text = await readFile(skillUrl, "utf8");
text = text
  .replace(/^---\n[\s\S]*?\n---\n+/, "")
  .replace(/^# PaperSet output\n+/, "")
  .trim() + "\n";

if (printOnly) {
  process.stdout.write(text);
  process.exit(0);
}

if (process.platform !== "darwin") {
  throw new Error(
    "Clipboard copy currently supports macOS only. Run with --print to output the instructions instead.",
  );
}

const result = spawnSync("/usr/bin/pbcopy", [], {
  input: text,
  encoding: "utf8",
});

if (result.error || result.status !== 0) {
  throw result.error ?? new Error("pbcopy exited with status " + result.status);
}

console.log(
  "Copied the PaperSetGPT output style. Paste it into ChatGPT Custom Instructions if you want the optional progressive-reading style.",
);
