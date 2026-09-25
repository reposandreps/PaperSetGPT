import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const themeUrl = new URL("../native-theme/paperset-light.import.txt", import.meta.url);
const theme = await readFile(themeUrl, "utf8");

if (process.argv.includes("--print")) {
  process.stdout.write(theme);
  process.exit(0);
}

if (process.platform !== "darwin") {
  throw new Error("Clipboard copy currently supports macOS only; use --print elsewhere.");
}

execFileSync("pbcopy", { input: theme });
process.stdout.write("PaperSet native theme copied to the clipboard.\n");
