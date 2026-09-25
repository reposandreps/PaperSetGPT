(() => {
  "use strict";

  const MIN_KEEP_RECENT_TURNS = 5;
  const MAX_KEEP_RECENT_TURNS = 100;
  const DEFAULT_SETTINGS = Object.freeze({
    reduceEffects: false,
    containTurns: true,
    lazyImages: true,
    hibernateOldTurns: false,
    keepRecentTurns: 30,
    readingFont: "atkinson"
  });

  const READING_FONT_CLASS_BY_SETTING = Object.freeze({
    atkinson: "paperset-font-atkinson",
    "atkinson-mono": "paperset-font-atkinson-mono",
    verdana: "paperset-font-verdana",
    "open-sans": "paperset-font-open-sans",
    arial: "paperset-font-arial",
    tahoma: "paperset-font-tahoma",
    trebuchet: "paperset-font-trebuchet",
    calibri: "paperset-font-calibri",
    "century-gothic": "paperset-font-century-gothic"
  });
  const READING_FONT_CLASSES = Object.freeze(
    Object.values(READING_FONT_CLASS_BY_SETTING)
  );
  const TURN_TEST_ID_SELECTOR = '[data-testid^="conversation-turn-"]';
  const MESSAGE_MARKER_SELECTOR = "[data-message-author-role]";
  const TURN_CLASS = "paperset-turn";
  const HIBERNATED_CLASS = "paperset-hibernated";
  const ADDED_LOADING_ATTR = "data-paperset-added-loading";
  const ADDED_DECODING_ATTR = "data-paperset-added-decoding";
  const BUNDLED_FONT_STYLESHEET_ID = "paperset-bundled-fonts";

  let settings = { ...DEFAULT_SETTINGS };
  let mutationObserver;
  let intersectionObserver;
  let refreshQueued = false;
  const knownTurns = new Set();
  const oldTurns = new Set();

  function root() {
    return document.documentElement;
  }

  function waitForDocumentElement() {
    if (root()) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        if (!root()) {
          return;
        }

        observer.disconnect();
        resolve();
      });

      observer.observe(document, { childList: true });
    });
  }

  function installBundledFontStylesheet() {
    if (document.getElementById(BUNDLED_FONT_STYLESHEET_ID)) {
      return;
    }

    const link = document.createElement("link");
    link.id = BUNDLED_FONT_STYLESHEET_ID;
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("fonts.css");
    root().appendChild(link);
  }

  function applyRootClasses() {
    const html = root();
    if (!html) {
      return;
    }

    html.classList.toggle("paperset-reduce-effects", settings.reduceEffects);
    html.classList.toggle("paperset-contain-turns", settings.containTurns);
    html.classList.toggle("paperset-hibernate-old", settings.hibernateOldTurns);
    html.classList.remove(...READING_FONT_CLASSES);

    const readingFontClass = READING_FONT_CLASS_BY_SETTING[settings.readingFont];
    if (readingFontClass) {
      html.classList.add(readingFontClass);
    }
  }

  function normalizeKeepRecent(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
      return DEFAULT_SETTINGS.keepRecentTurns;
    }

    return Math.min(
      MAX_KEEP_RECENT_TURNS,
      Math.max(MIN_KEEP_RECENT_TURNS, parsed)
    );
  }

  function isTurnRoot(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    if (element.matches(TURN_TEST_ID_SELECTOR)) {
      return true;
    }

    return element.tagName === "ARTICLE" &&
      Boolean(element.querySelector(MESSAGE_MARKER_SELECTOR));
  }

  function turnRootFor(element) {
    if (!(element instanceof Element)) {
      return null;
    }

    if (element.matches(TURN_TEST_ID_SELECTOR)) {
      return element;
    }

    if (element.matches(MESSAGE_MARKER_SELECTOR)) {
      return element.closest(TURN_TEST_ID_SELECTOR) || element.closest("article");
    }

    return null;
  }

  function applyImageHint(image) {
    if (!(image instanceof HTMLImageElement)) {
      return;
    }

    if (!image.hasAttribute("loading")) {
      image.setAttribute("loading", "lazy");
      image.setAttribute(ADDED_LOADING_ATTR, "");
    }

    if (!image.hasAttribute("decoding")) {
      image.setAttribute("decoding", "async");
      image.setAttribute(ADDED_DECODING_ATTR, "");
    }
  }

  function removeImageHint(image) {
    if (!(image instanceof HTMLImageElement)) {
      return;
    }

    if (image.hasAttribute(ADDED_LOADING_ATTR)) {
      image.removeAttribute("loading");
      image.removeAttribute(ADDED_LOADING_ATTR);
    }

    if (image.hasAttribute(ADDED_DECODING_ATTR)) {
      image.removeAttribute("decoding");
      image.removeAttribute(ADDED_DECODING_ATTR);
    }
  }

  function syncImageHintsWithin(node) {
    if (!(node instanceof Element || node instanceof Document)) {
      return;
    }

    const sync = settings.lazyImages ? applyImageHint : removeImageHint;

    if (node instanceof HTMLImageElement) {
      sync(node);
    }

    node.querySelectorAll?.("img").forEach(sync);
  }

  function registerTurn(turn) {
    if (!(turn instanceof HTMLElement) || knownTurns.has(turn)) {
      return;
    }

    knownTurns.add(turn);
    turn.classList.add(TURN_CLASS);
    intersectionObserver?.observe(turn);
  }

  function registerFromNode(node) {
    if (!(node instanceof Element || node instanceof Document)) {
      return;
    }

    if (node instanceof Element) {
      if (isTurnRoot(node)) {
        registerTurn(node);
      }

      const directRoot = turnRootFor(node);
      if (directRoot) {
        registerTurn(directRoot);
      }
    }

    node.querySelectorAll?.(TURN_TEST_ID_SELECTOR).forEach(registerTurn);
    node.querySelectorAll?.(MESSAGE_MARKER_SELECTOR).forEach((marker) => {
      const turn = turnRootFor(marker);
      if (turn) {
        registerTurn(turn);
      }
    });

    syncImageHintsWithin(node);
  }

  function wakeTurn(turn) {
    if (!(turn instanceof HTMLElement)) {
      return;
    }

    turn.classList.remove(HIBERNATED_CLASS);
    turn.style.removeProperty("--paperset-turn-height");
  }

  function hibernateTurn(turn, measuredHeight) {
    if (!(turn instanceof HTMLElement) || !settings.hibernateOldTurns || !oldTurns.has(turn)) {
      return;
    }

    const height = Math.max(
      1,
      Math.round(measuredHeight || turn.getBoundingClientRect().height)
    );

    turn.style.setProperty("--paperset-turn-height", `${height}px`);
    turn.classList.add(HIBERNATED_CLASS);
  }

  function rebuildIntersectionObserver() {
    intersectionObserver?.disconnect();
    intersectionObserver = undefined;

    // Safe off-screen containment is pure CSS. Only optional hibernation needs viewport observation.
    if (!settings.hibernateOldTurns) {
      return;
    }

    intersectionObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const turn = entry.target;
        if (!(turn instanceof HTMLElement)) {
          continue;
        }

        if (!oldTurns.has(turn) || entry.isIntersecting) {
          wakeTurn(turn);
          continue;
        }

        hibernateTurn(turn, entry.boundingClientRect.height);
      }
    }, {
      root: null,
      rootMargin: "1200px 0px",
      threshold: 0
    });

    for (const turn of knownTurns) {
      if (turn.isConnected) {
        intersectionObserver.observe(turn);
      }
    }
  }

  function refreshTurnPolicy() {
    for (const turn of knownTurns) {
      if (!turn.isConnected) {
        knownTurns.delete(turn);
        oldTurns.delete(turn);
      }
    }

    const orderedTurns = Array.from(document.querySelectorAll(`.${TURN_CLASS}`));
    const keepRecent = normalizeKeepRecent(settings.keepRecentTurns);
    const oldCount = Math.max(0, orderedTurns.length - keepRecent);

    oldTurns.clear();
    orderedTurns.forEach((turn, index) => {
      if (index < oldCount) {
        oldTurns.add(turn);
      } else {
        wakeTurn(turn);
      }
    });

    if (!settings.hibernateOldTurns) {
      orderedTurns.forEach(wakeTurn);
    }
  }

  function queueRefresh() {
    if (refreshQueued) {
      return;
    }

    refreshQueued = true;
    const run = () => {
      refreshQueued = false;
      refreshTurnPolicy();
    };

    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(run, { timeout: 500 });
    } else {
      window.setTimeout(run, 50);
    }
  }

  function observePage() {
    mutationObserver?.disconnect();

    mutationObserver = new MutationObserver((mutations) => {
      let sawStructuralChange = false;

      for (const mutation of mutations) {
        if (mutation.removedNodes.length > 0) {
          sawStructuralChange = true;
        }

        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) {
            continue;
          }

          registerFromNode(node);
          sawStructuralChange = true;
        }
      }

      if (sawStructuralChange) {
        queueRefresh();
      }
    });

    mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  async function loadSettings() {
    const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
    settings = {
      ...DEFAULT_SETTINGS,
      ...stored,
      keepRecentTurns: normalizeKeepRecent(stored.keepRecentTurns)
    };
  }

  async function boot() {
    try {
      await loadSettings();
      await waitForDocumentElement();
      installBundledFontStylesheet();
      applyRootClasses();
      registerFromNode(document);
      refreshTurnPolicy();
      rebuildIntersectionObserver();
      observePage();
    } catch (error) {
      console.warn("PaperSetGPT disabled after initialization error.", error);
    }
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }

    for (const [key, change] of Object.entries(changes)) {
      if (key in DEFAULT_SETTINGS) {
        settings[key] = key === "keepRecentTurns"
          ? normalizeKeepRecent(change.newValue)
          : change.newValue;
      }
    }

    applyRootClasses();
    registerFromNode(document);
    refreshTurnPolicy();
    rebuildIntersectionObserver();
  });

  void boot();
})();
