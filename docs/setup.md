---
type: how-to
status: current
---

# Set up PaperSetGPT

> **Covers:** Public macOS installation, native ChatGPT theme import, the portable Brave profile, extension settings, optional browser-wide performance settings, and isolated qualification.
> **Elsewhere:** Runtime behavior and safety boundaries are defined in `architecture.md`.

## 1. Run the one-time profile setup

Requirements:

- macOS;
- Brave Browser in `/Applications` (override with `PAPERSET_BRAVE_APP` if needed);
- Node.js 22 or newer;
- Brave fully closed for a real setup run.

From the repository root:

    npm run setup

The configurator uses `config/brave-profile.json` as its allowlisted source of truth. It reuses a Brave profile whose display name is `ChatGPT`, or creates one when none exists.

The setup is safe to rerun. Before changing an existing profile it keeps one local backup of the relevant preference files. It refuses to touch a Brave user-data root while that root is running.

Use a read-only preview at any time:

    npm run setup -- --dry-run

## 2. Load the PaperSet extension once

The Brave browser theme is persisted automatically during setup. Brave does not provide a safe unattended path for persistently installing an unpacked ordinary extension.

After setup, Brave opens `brave://extensions` with Developer Mode enabled:

1. click **Load unpacked**;
2. choose this repository's `extension/` folder.

Keep the repository path stable. Sign in to ChatGPT interactively; never copy authentication files or cookies between profiles.

## 3. Import the native PaperSet ChatGPT theme

PaperSet does not recolour ChatGPT through extension CSS.

Copy the current native theme payload:

    npm run theme:copy

Then in ChatGPT:

1. open **Settings → Appearance**;
2. locate **Theme**;
3. use the import control;
4. paste the copied value;
5. confirm the import.

The source payload is `native-theme/paperset-light.import.txt`. If ChatGPT rejects the payload after a future UI/theme-format update, update the native payload rather than adding one-off colour selectors to the extension.

Theme import availability is controlled by ChatGPT. If the Appearance import control is not present on an account yet, the remaining Brave/profile, font, and performance parts of PaperSetGPT still work, but the PaperSet ChatGPT colour theme cannot be installed through the native route on that account.

## 4. Optional PaperSet output style

PaperSetGPT includes a standalone output-style skill at `.agents/skills/paperset-output/SKILL.md`.

On macOS:

    npm run output-style:copy

Paste it into ChatGPT Custom Instructions only if you want the progressive-reading and output-style guidance. PaperSetGPT does not automate ChatGPT account settings or silently modify prompts.

## 5. Reproduced ChatGPT-profile behavior

The portable Brave profile configuration reproduces:

- vertical tabs enabled and collapsed;
- collapsed vertical tabs hidden until invoked;
- 96 px expanded vertical-tab width, left-side placement, no tree tabs or vertical scrollbar;
- Forward and Sidebar controls available;
- bookmark, screenshot, Leo, VPN, Wallet, Brave News, and generic pinned toolbar actions removed;
- Home toolbar button hidden;
- homepage set to `https://chatgpt.com/`;
- new tabs configured to show the homepage;
- search suggestions, media routing, and Web Discovery disabled;
- New Tab background/branded images, Rewards, VPN, stats, and Together cards disabled.

The separate declarative Brave browser theme keeps dark-green frame/chrome with warm-cream toolbar/address surfaces and slate text/icons.

`config/brave-profile.json` contains no cookies, history, sessions, account state, local extension IDs, or machine-specific absolute paths.

## 6. Optional browser-wide performance settings

The normal setup avoids settings shared by every profile in the same Brave user-data root.

To opt in:

    npm run setup -- --include-shared

This enables the previously qualified shared posture:

- Memory Saver enabled;
- Battery Saver enabled below its threshold;
- background-app continuation disabled;
- hardware acceleration enabled.

Page preloading/network prediction is not forced.

## 7. Launch the configured profile

The launcher detects the Brave profile whose display name is `ChatGPT`:

    npm run launch

Use `PAPERSET_PROFILE_DIRECTORY` to select a directory explicitly. `PAPERSET_BRAVE_ROOT` and `PAPERSET_BRAVE_APP` can override the normal macOS locations.

Production launch does not expose a debugging port.

## 8. Extension settings

Safe defaults:

- Reading font: bundled Atkinson Hyperlegible Next.
- Contain off-screen conversation turns: on.
- Lazy image/decode hints: on.
- Disable blur & smooth scrolling: off.
- Hibernate old turns: off.
- Recent-turn window for hibernation: 30.

**Containment and hibernation are different.** Containment uses `content-visibility: auto` and preserves ordinary flow/accessibility semantics. Hibernation is the optional aggressive mode that can temporarily hide far-away old turns and therefore may affect browser Find or accessibility.

The reading-font picker also offers Atkinson Hyperlegible Mono, ChatGPT default, and several locally installed system fonts. Code remains on the monospace stack.

## 9. Run isolated qualification

Qualification uses a retained isolated QA root at `~/Library/Application Support/BraveSoftware/PaperSetGPT-QA`, not the daily ChatGPT profile.

Launch it with qualification-only CDP access:

    bash scripts/launch-brave.sh --qualify

With a representative ChatGPT conversation open in the QA browser:

    npm run qualify

Use the isolated profile for automation and live compatibility checks. Do not restart or automate the user's active production profile.
