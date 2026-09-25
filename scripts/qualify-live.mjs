import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const host = process.env.PAPERSET_CDP_HOST ?? '127.0.0.1';
const port = process.env.PAPERSET_CDP_PORT ?? '9229';
const baseUrl = `http://${host}:${port}`;
const outDir = path.resolve(process.env.PAPERSET_ARTIFACT_DIR ?? '.artifacts/qualification');

if (typeof WebSocket !== 'function') {
  throw new Error('This qualifier requires a Node.js runtime with the built-in WebSocket client.');
}

async function readJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

class CdpSession {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 0;
    this.pending = new Map();
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      clearTimeout(waiter.timer);
      if (message.error) waiter.reject(new Error(`${waiter.method}: ${message.error.message}`));
      else waiter.resolve(message.result ?? {});
    });
  }

  call(method, params = {}, timeoutMs = 5000) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method}: timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, method, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    for (const waiter of this.pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error(`${waiter.method}: CDP session closed`));
    }
    this.pending.clear();
    this.socket.close();
  }
}

const [browser, targets] = await Promise.all([
  readJson(`${baseUrl}/json/version`),
  readJson(`${baseUrl}/json/list`),
]);

const candidateTargets = targets.filter(
  (item) => item.type === 'page' && /^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(item.url)
);
let target;
let cdp;
for (const candidate of candidateTargets) {
  const candidateCdp = new CdpSession(candidate.webSocketDebuggerUrl);
  await candidateCdp.open();
  const location = await candidateCdp.call('Runtime.evaluate', {
    expression: 'location.href',
    returnByValue: true,
  });
  if (/^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(location.result?.value ?? '')) {
    target = candidate;
    cdp = candidateCdp;
    break;
  }
  candidateCdp.close();
}
if (!target || !cdp) {
  throw new Error('No loaded ChatGPT page target is exposed by the qualification browser.');
}

await Promise.all([cdp.call('Page.enable'), cdp.call('Performance.enable')]);

const readinessDeadline = Date.now() + 25000;
let readiness;
let stableTurnSamples = 0;
let lastVisibleTurnCount = -1;
do {
  const readinessResult = await cdp.call('Runtime.evaluate', {
    expression: `(() => {
      const href = location.href;
      const isConversation = /\\/c\\//.test(href);
      const turnCount = document.querySelectorAll('[data-testid^="conversation-turn-"]').length;
      const messageCount = document.querySelectorAll('[data-message-author-role]').length;
      const composer = Boolean(document.querySelector('textarea, [contenteditable="true"]'));
      return { href, isConversation, turnCount, messageCount, composer, performanceNow: performance.now() };
    })()`,
    returnByValue: true,
  });
  readiness = readinessResult.result?.value ?? null;
  const usable = readiness?.composer &&
    (!readiness.isConversation || readiness.turnCount > 0 || readiness.messageCount > 0);
  const visibleTurnCount = readiness?.turnCount || readiness?.messageCount || 0;
  if (usable) {
    if (!readiness.isConversation) {
      stableTurnSamples = 5;
      break;
    }
    if (visibleTurnCount === lastVisibleTurnCount) {
      stableTurnSamples += 1;
    } else {
      lastVisibleTurnCount = visibleTurnCount;
      stableTurnSamples = 1;
    }
    if (stableTurnSamples >= 5) {
      break;
    }
  } else {
    stableTurnSamples = 0;
    lastVisibleTurnCount = -1;
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
} while (Date.now() < readinessDeadline);
if (!readiness?.composer ||
    (readiness.isConversation &&
      (readiness.turnCount === 0 && readiness.messageCount === 0 || stableTurnSamples < 5))) {
  cdp.close();
  throw new Error('ChatGPT target did not reach a stable usable qualification state within 25 seconds.');
}
readiness = { ...readiness, stableTurnSamples };

const pageProbe = `(() => {
  const rootStyle = getComputedStyle(document.documentElement);
  const testIds = Array.from(document.querySelectorAll('[data-testid]'), (node) => node.getAttribute('data-testid'))
    .filter((value) => value && /sidebar|history|nav/i.test(value));
  return {
    title: document.title,
    url: location.href,
    readyState: document.readyState,
    viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
    documentHeight: document.documentElement.scrollHeight,
    elementCount: document.getElementsByTagName('*').length,
    turnCount: document.querySelectorAll('[data-testid^="conversation-turn-"]').length,
    messageCount: document.querySelectorAll('[data-message-author-role]').length,
    imageCount: document.images.length,
    editableCount: document.querySelectorAll('textarea, [contenteditable="true"]').length,
    extension: {
      softTheme: document.documentElement.classList.contains('paperset-theme-soft'),
      reduceEffects: document.documentElement.classList.contains('paperset-reduce-effects'),
      containTurns: document.documentElement.classList.contains('paperset-contain-turns'),
      hibernateOldTurns: document.documentElement.classList.contains('paperset-hibernate-old'),
      decoratedTurns: document.querySelectorAll('.paperset-turn').length,
      hibernatedTurns: document.querySelectorAll('.paperset-hibernated').length,
    },
    theme: {
      background: rootStyle.getPropertyValue('--paperset-bg').trim(),
      surface: rootStyle.getPropertyValue('--paperset-surface').trim(),
      text: rootStyle.getPropertyValue('--paperset-text').trim(),
    },
    sidebar: {
      matchingTestIds: Array.from(new Set(testIds)).sort(),
      navElements: document.querySelectorAll('nav, aside').length,
    },
    navigation: (() => {
      const entry = performance.getEntriesByType('navigation')[0];
      if (!entry) return null;
      return {
        type: entry.type,
        startTime: entry.startTime,
        domContentLoadedEventEnd: entry.domContentLoadedEventEnd,
        loadEventEnd: entry.loadEventEnd,
        duration: entry.duration,
        transferSize: entry.transferSize,
        encodedBodySize: entry.encodedBodySize,
        decodedBodySize: entry.decodedBodySize,
      };
    })(),
    paint: Object.fromEntries(
      performance.getEntriesByType('paint').map((entry) => [entry.name, entry.startTime])
    ),
    storageKeys: Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter(Boolean).sort(),
  };
})()`;

const [domCounters, heap, performance, evaluated, screenshot] = await Promise.all([
  cdp.call('Memory.getDOMCounters'),
  cdp.call('Runtime.getHeapUsage'),
  cdp.call('Performance.getMetrics'),
  cdp.call('Runtime.evaluate', { expression: pageProbe, returnByValue: true }),
  cdp.call('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false }),
]);
cdp.close();

const metrics = Object.fromEntries(performance.metrics.map(({ name, value }) => [name, value]));
const report = {
  capturedAt: new Date().toISOString(),
  browser: browser.Browser,
  protocolVersion: browser['Protocol-Version'],
  target: { id: target.id, url: target.url, title: target.title },
  readiness,
  page: evaluated.result?.value ?? null,
  domCounters,
  heap,
  performance: Object.fromEntries([
    'Timestamp',
    'Documents',
    'Frames',
    'JSEventListeners',
    'Nodes',
    'LayoutCount',
    'RecalcStyleCount',
    'LayoutDuration',
    'RecalcStyleDuration',
    'ScriptDuration',
    'TaskDuration',
    'JSHeapUsedSize',
    'JSHeapTotalSize',
  ].filter((name) => name in metrics).map((name) => [name, metrics[name]])),
};

await fs.mkdir(outDir, { recursive: true });
const stamp = report.capturedAt.replace(/[:.]/g, '-');
const jsonPath = path.join(outDir, `${stamp}.json`);
const pngPath = path.join(outDir, `${stamp}.png`);
await Promise.all([
  fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`),
  fs.writeFile(pngPath, Buffer.from(screenshot.data, 'base64')),
]);

console.log(JSON.stringify({ report: jsonPath, screenshot: pngPath, summary: report }, null, 2));
