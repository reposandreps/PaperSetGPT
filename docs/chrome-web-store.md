---
type: how-to
status: current
source_of_truth: extension/manifest.json
---

# Publish the PaperSetGPT extension to the Chrome Web Store

> **Covers:** The Chrome Web Store package, listing copy, privacy declarations, assets, and manual dashboard submission for the extension in `extension/`.
> **Elsewhere:** The broader PaperSetGPT Brave profile, native ChatGPT theme, and optional output style are documented in `setup.md`.

The Chrome Web Store item is the **browser extension only**. It provides local readability and lightweight rendering controls on ChatGPT pages. The separate Brave profile setup, Brave browser theme, native ChatGPT theme import, and optional output-style instructions are not installed by the Chrome Web Store item.

## Build the upload package

Run:

    npm test
    npm run store:package

The generated upload file is:

    .artifacts/chrome-web-store/papersetgpt-chrome-web-store-v<version>.zip

`manifest.json` is at the ZP root. The package also includes the project licence and third-party notices. `.artifacts/` is ignored by Git.

## Store listing

**Name:** PaperSetGPT

**Summary:** Readability and lightweight rendering controls for ChatGPT.

**Detailed description:**

PaperSetGPT makes long ChatGPT sessions easier to read without replacing ChatGPT's own interface or colour system.

It adds locally bundled Atkinson Hyperlegible reading fonts, an optional conversation-text colour override, safe off-screen rendering containment, image loading/decoding hints, optional effect reduction, and optional old-turn hibernation. Settings stay in local Chrome extension storage.

The extension runs only on ChatGPT pages, has no analytics or telemetry, does not send extension-originated network requests, and does not transmit conversation content. PaperSetGPT is independent and unofficial and is not affiliated with OpenAI or Google.

The wider open-source PaperSetGPT repository also contains an optional Brave profile, Brave theme, native ChatGPT theme, and output-style guidance. Those extras are separate from the Chrome Web Store extension.

**Homepage:** https://github.com/reposandreps/PaperSetGPT

**Support:** https://github.com/reposandreps/PaperSetGPT/issues

**Privacy policy:** https://github.com/reposandreps/PaperSetGPT/blob/main/PRIVACY.md

## Graphic assets

- Store icon: `assets/brand/papersetgpt-typewriter-icon-128.png`
- Screenshot: `assets/store/papersetgpt-overview-640x400.jpg`
- Small promo tile: `assets/store/papersetgpt-promo-440x280.jpgg`
- Marquee promo image: optional; not currently supplied.

The package itself contains 16, 32, 48, and 128 px versions of the PaperSetGPT icon under `extension/icons/`.

## Privacy practices

**Single purpose**

Improve the readability and rendering behavior of ChatGPT pages with local typography, display, and rendering controls.

**`storage` permission justification**

PaperSetGPT uses Chrome extension storage only to save the user's PaperSetGPT display and rendering preferences locally between browser sessions.

**Site access justification**

PaperSetGPT runs only on `chatgpt.com` and the legacy `chat.openai.com` origin so it can identify ChatGPT conversation turns, text, and images and apply the user-selected reading and rendering behavior. It does not run on unrelated websites.

**Remote code**

Select **No, I am not using remote code.** All extension JavaScript, CSS, and fonts are packaged with the extension.

**User data**

The extension handles ChatGPT website content locally because the content script must inspect page structure to apply its user-facing features. It does not collect, retain, transmit, sell, or share conversation content, prompts, responses, account information, or browsing activity. Only PaperSetGPT's own settings are persisted in local extension storage.

**Dashboard data disclosure:** Select **Website content** because the extension uses ChatGPT page content locally to provide its reading and rendering features. That website content is not transmitted or retained by PaperSetGPT.

The privacy policy states the same behavior and includes the Chrome Web Store Limited Use disclosure.

## Distribution

Use **Public** visibility unless a staged/private test release is deliberately required.

The initial Web Store submission and any later code/package update require review. Store metadata and privacy declarations are managed separately from the ZIP package in the Developer Dashboard.
