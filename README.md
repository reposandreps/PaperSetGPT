# PaperSetGPT

PaperSetGPT is a local macOS/Brave reading environment for ChatGPT. It combines a native ChatGPT PaperSet theme with readability-focused fonts, conservative rendering reductions, a minimal dedicated Brave profile, and optional output-style guidance.

PaperSetGPT is an independent, unofficial project and is not affiliated with OpenAI or Brave Software.

## Quick start

Requirements: **Brave Browser on macOS, Node.js 22+, and this repository cloned locally.**

1. Quit Brave completely.
2. From the repository root, run:

       npm run setup

   This creates or reuses a dedicated Brave profile named **ChatGPT**, configures the minimal vertical-tab/navigation setup, makes new tabs open ChatGPT, enables extension Developer Mode, and installs the PaperSetGPT Brave browser theme.

3. Brave reopens at `brave://extensions`. Click **Load unpacked** and choose this repository's `extension/` folder.
4. Copy the native PaperSet ChatGPT theme:

       npm run theme:copy

   In ChatGPT, open **Settings → Appearance**, use the **Theme import** control, paste the copied value, and confirm the import.
5. Open ChatGPT and sign in normally.

The extension deliberately does not recolour ChatGPT. ChatGPT's own native theme system owns application colours, so UI updates can continue to map components through OpenAI's semantic theme rules.

To preview the Brave setup without changing anything:

    npm run setup -- --dry-run

The normal setup changes only the dedicated ChatGPT profile. To reproduce the optional browser-wide performance posture too:

    npm run setup -- --include-shared

### Optional PaperSet output style

The repository includes a standalone agent skill for progressive reading, warm direct tone, and low-friction visual representations.

On macOS, copy its ChatGPT-ready body to the clipboard with:

    npm run output-style:copy

Paste it into ChatGPT Custom Instructions only if you want that output style. PaperSetGPT never edits ChatGPT account settings or prompts automatically.

## What is included

- `native-theme/` — the importable PaperSet light theme for ChatGPT's native theme system.
- `extension/` — local reading-font controls plus off-screen containment, image hints, optional effect reduction, and optional old-turn hibernation.
- `browser-theme/` — declarative warm Brave chrome theme.
- `config/brave-profile.json` — portable allowlisted Brave profile settings.
- `scripts/configure-brave-profile.mjs` — idempotent one-time macOS profile configurator.
- `.agents/skills/paperset-output/` — optional standalone guidance for progressive, readable agent responses.

Full setup and qualification guidance is in `docs/setup.md`. Runtime boundaries are in `docs/architecture.md`. PaperSetGPT's data-handling statement is in `PRIVACY.md`.

## Project boundaries

- No browser fork, telemetry, remote font/CDN dependency, or extension-originated network traffic.
- No copied cookies, sessions, history, passwords, account data, or whole browser profiles.
- The setup helper refuses to modify a Brave user-data root while it is running.
- Chromium sandboxing, site isolation, renderer isolation, Shields, and normal browser updates stay intact.
- ChatGPT owns application colours through its native theme system; the extension does not patch ChatGPT colour tokens or component colours.
- ChatGPT continues to own authentication, conversations, model traffic, and application behavior.

## License

PaperSetGPT is free software licensed under the GNU General Public License v3.0 or later (GPL-3.0-or-later). See `LICENSE`.

The bundled Atkinson fonts are separately licensed under SIL OFL 1.1; see `extension/fonts/OFL.txt` and `extension/fonts/OFL-Mono.txt`.
