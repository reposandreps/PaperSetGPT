---
type: explanation
status: current
---

# Architecture

> **Covers:** Current runtime boundary and optimization strategy.
> **Elsewhere:** Installation and Brave-profile configuration are defined in `setup.md`.

PaperSetGPT uses one ordinary Brave installation and one dedicated `ChatGPT` profile. ChatGPT's native theme system owns application colours. A small Manifest V3 extension owns reading-font selection and bounded rendering optimizations, while a separate declarative Brave theme owns browser chrome.

`config/brave-profile.json` and `scripts/configure-brave-profile.mjs` reproduce the allowlisted browser profile without copying a user's profile database or personal browser state.

## Runtime boundary

The ChatGPT extension has no background service worker and no build step. Its only permission is `storage`, used for local reading and rendering preferences. Declared content scripts run only on:

- `https://chatgpt.com/*`
- `https://chat.openai.com/*`

The extension makes no network requests. It does not own ChatGPT colours, account settings, authentication, conversations, model traffic, or application state.

`native-theme/paperset-light.import.txt` is the source of truth for the PaperSet ChatGPT colour theme. The current native import format starts with `codex-theme-v1:` and carries the base surface, foreground/ink, accent, contrast, and supported semantic colours. Secondary ChatGPT surfaces and component states are intentionally derived by ChatGPT rather than reproduced with extension selectors. Reading-text colour remains native by default. An optional extension override is limited to semantic conversation prose through one root custom property and bounded message-prose selectors; application chrome, links, code, citations, controls, tool cards, and the composer remain native-themed.

The optional `.agents/skills/paperset-output/` guidance is also outside the browser runtime. PaperSetGPT may copy it for manual Custom Instructions use but never injects it into conversations.

For local qualification, `scripts/launch-brave.sh --qualify` starts a retained isolated QA user-data root with Chromium DevTools Protocol on loopback. Production launch remains on the standard shared Brave root and does not expose a debugging port.

## Profile boundary

The `ChatGPT` profile has its own cookies, local/session storage, IndexedDB, session state, site permissions, extensions, and profile theme. None of that personal state is exported.

The setup helper changes only named, allowlisted preferences and persists the declarative Brave browser theme. Shared browser settings are changed only with `--include-shared`.

## Optimization rule

Optimize **work avoided**, not UI removed after the work already happened.

Prefer, in order:

1. ChatGPT or Brave native state that prevents unnecessary work.
2. Browser primitives that avoid layout, paint, decode, or compositing.
3. Small reversible extension behavior only where native controls do not cover the requirement.
4. No cosmetic DOM intervention merely to make the interface look different.

A ChatGPT frontend change must fail open.

## Native ChatGPT theme

PaperSet colours are now expressed through ChatGPT's own theme import rather than CSS overrides against private application DOM.

The shipped light theme currently uses:

- PaperSet cream as the native surface;
- PaperSet slate as foreground/ink;
- PaperSet green as the custom accent;
- native contrast to derive secondary surfaces;
- semantic added/removed/skill colours where the native format supports them.

The extension settings page remains visually branded with the PaperSet palette, but those colours are local to the extension UI and do not recolour ChatGPT.

If ChatGPT changes its theme serialization, update the native payload and validation. Do not reintroduce component-by-component colour selectors merely to preserve an old serialization format.

## Reading font

The extension bundles Atkinson Hyperlegible Next and Atkinson Hyperlegible Mono locally under SIL OFL 1.1 and exposes a reading-font picker. Ordinary ChatGPT text can use the selected reading face while `pre`, `code`, `kbd`, and `samp` keep ChatGPT's monospace stack.

No font is fetched from a CDN. Selecting **ChatGPT default** removes the PaperSet font class and leaves ChatGPT's own font choice in control.

## Off-screen turn containment

This is the safe default long-conversation optimization.

Conversation turns are identified conservatively from ChatGPT turn test IDs or message-author markers and receive one PaperSet class. CSS then applies:

    content-visibility: auto;
    contain-intrinsic-size: auto 240px;

Chromium may skip rendering sufficiently distant turns while preserving normal document flow. This mode does **not** hide turns and does **not** require viewport observation.

If ChatGPT changes its private turn DOM and no supported turn root is found, containment simply stops applying.

## Optional old-turn hibernation

Hibernation is separate from containment and is disabled by default.

When enabled, only then does PaperSetGPT create an `IntersectionObserver`. Turns older than the configured recent-turn window are tracked relative to the viewport. Far-away old turns use `content-visibility: hidden`; their measured height is retained with an intrinsic block size so the document does not intentionally collapse.

Turns are restored before they approach the viewport. Because hidden content can affect browser Find and accessibility, hibernation remains an explicit experimental option.

## Images

Image optimization adds browser-native `loading="lazy"` and `decoding="async"` hints only when an image has not already defined those attributes. PaperSet marks only attributes it added, so disabling the option removes its own hints without overwriting page-owned values.

The extension does not remove URLs or intercept requests, so these hints are not guaranteed network blocking.

## Optional effect reduction

Effect reduction remains off by default. When enabled it disables smooth scrolling and backdrop blur through a narrow CSS hook. It is performance-only and independent of ChatGPT's native **Reduce motion** setting.

## Default posture

- native PaperSet ChatGPT theme: imported manually;
- reading font: bundled Atkinson Hyperlegible Next;
- off-screen turn containment: on;
- lazy image/decode hints: on;
- targeted effect reduction: off;
- old-turn hibernation: off;
- recent turns retained when hibernation is enabled: 30.

## Compatibility rule

Private ChatGPT DOM selectors are used only for bounded performance behavior that cannot be expressed through native theme settings. They must fail open and must never replace, delete, serialize, or take ownership of ChatGPT message content.
