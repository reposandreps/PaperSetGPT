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

  const booleanKeys = [
    "reduceEffects",
    "containTurns",
    "lazyImages",
    "hibernateOldTurns"
  ];

  const status = document.querySelector("#status");
  const readingFont = document.querySelector("#readingFont");
  const readingFontTrigger = document.querySelector("#readingFontTrigger");
  const readingFontLabel = document.querySelector("#readingFontLabel");
  const readingFontList = document.querySelector("#readingFontList");
  const readingFontOptions = Array.from(
    readingFontList.querySelectorAll('[role="option"]')
  );
  let statusTimer;

  function showStatus(message) {
    status.textContent = message;
    window.clearTimeout(statusTimer);
    statusTimer = window.setTimeout(() => {
      status.textContent = "";
    }, 1600);
  }

  function normalizedRecentTurns() {
    const field = document.querySelector("#keepRecentTurns");
    const parsed = Number.parseInt(field.value, 10);
    const value = Number.isFinite(parsed)
      ? Math.min(MAX_KEEP_RECENT_TURNS, Math.max(MIN_KEEP_RECENT_TURNS, parsed))
      : DEFAULT_SETTINGS.keepRecentTurns;
    field.value = String(value);
    return value;
  }

  function fontOption(value) {
    return readingFontOptions.find((option) => option.dataset.value === value) ||
      readingFontOptions[0];
  }

  function applyReadingFontPreview() {
    const selected = fontOption(readingFont.value);
    readingFont.value = selected.dataset.value;
    readingFontTrigger.dataset.font = selected.dataset.font;
    readingFontLabel.textContent = selected.textContent;

    for (const option of readingFontOptions) {
      const isSelected = option === selected;
      option.setAttribute("aria-selected", String(isSelected));
      option.tabIndex = isSelected ? 0 : -1;
    }
  }

  function closeReadingFontList({ restoreFocus = false } = {}) {
    readingFontList.hidden = true;
    readingFontTrigger.setAttribute("aria-expanded", "false");
    if (restoreFocus) {
      readingFontTrigger.focus();
    }
  }

  function openReadingFontList({ focus = "selected" } = {}) {
    readingFontList.hidden = false;
    readingFontTrigger.setAttribute("aria-expanded", "true");

    const selectedIndex = Math.max(0, readingFontOptions.indexOf(fontOption(readingFont.value)));
    const targetIndex = focus === "first"
      ? 0
      : focus === "last"
        ? readingFontOptions.length - 1
        : selectedIndex;
    readingFontOptions[targetIndex].focus();
  }

  function selectReadingFont(option) {
    if (!option?.dataset?.value) {
      return;
    }

    readingFont.value = option.dataset.value;
    applyReadingFontPreview();
    closeReadingFontList({ restoreFocus: true });
    readingFont.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function moveReadingFontFocus(current, offset) {
    const index = readingFontOptions.indexOf(current);
    if (index < 0) {
      return;
    }

    const next = (index + offset + readingFontOptions.length) % readingFontOptions.length;
    readingFontOptions[next].focus();
  }

  function settingsFromForm() {
    const next = {
      keepRecentTurns: normalizedRecentTurns(),
      readingFont: readingFont.value
    };

    for (const key of booleanKeys) {
      next[key] = document.querySelector("#" + key).checked;
    }

    return next;
  }

  function render(settings) {
    for (const key of booleanKeys) {
      document.querySelector("#" + key).checked = Boolean(settings[key]);
    }

    document.querySelector("#keepRecentTurns").value = String(settings.keepRecentTurns);
    readingFont.value = settings.readingFont;
    applyReadingFontPreview();
  }

  async function save() {
    const next = settingsFromForm();
    await chrome.storage.local.set(next);
    showStatus("Saved");
  }

  async function load() {
    const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
    render({ ...DEFAULT_SETTINGS, ...settings });
  }

  readingFontTrigger.addEventListener("click", () => {
    if (readingFontList.hidden) {
      openReadingFontList();
    } else {
      closeReadingFontList();
    }
  });

  readingFontTrigger.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openReadingFontList();
    }
  });

  readingFontList.addEventListener("click", (event) => {
    const option = event.target.closest('[role="option"]');
    if (option) {
      selectReadingFont(option);
    }
  });

  readingFontList.addEventListener("keydown", (event) => {
    const option = event.target.closest('[role="option"]');
    if (!option) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveReadingFontFocus(option, 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveReadingFontFocus(option, -1);
    } else if (event.key === "Home") {
      event.preventDefault();
      readingFontOptions[0].focus();
    } else if (event.key === "End") {
      event.preventDefault();
      readingFontOptions.at(-1).focus();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectReadingFont(option);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeReadingFontList({ restoreFocus: true });
    }
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".font-picker")) {
      closeReadingFontList();
    }
  });

  document.addEventListener("focusin", (event) => {
    if (!event.target.closest(".font-picker")) {
      closeReadingFontList();
    }
  });

  document.querySelector("#settings").addEventListener("change", () => {
    void save();
  });

  document.querySelector("#reset").addEventListener("click", async () => {
    await chrome.storage.local.set(DEFAULT_SETTINGS);
    render(DEFAULT_SETTINGS);
    showStatus("Defaults restored");
  });

  void load();
})();
