'use strict';

// ─── Constantes ───────────────────────────────────────────────────────────────

const CHAT_SELECTOR    = 'div[data-testid="virtuoso-item-list"]';
const MESSAGE_SELECTOR = 'div[data-item-index]';

const RESERVED_CHANNELS = new Set([
  'settings', 'explore', 'login', 'register',
  'admin', 'messages', 'notifications', 'home',
  'following', 'subscriptions', 'embed', 'user'
]);

const PROVIDER_PRIORITY = { '7TV': 3, 'BTTV': 2, 'FFZ': 1 };

const CHAT_POLL_INTERVAL     = 800;
const URL_POLL_INTERVAL      = 5000;
const PARSER_BUDGET_MS       = 6;
const INIT_DEBOUNCE_MS       = 150;
const SW_MESSAGE_TIMEOUT     = 12000;
const MAX_EMOTE_CODE_LEN     = 32;
const TOOLTIP_PREVIEW_DELAY  = 60;
const TOOLTIP_WIDTH          = 180;

const SW_MAX_ATTEMPTS        = 2;
const SW_RETRY_BACKOFF_MS    = 300;

const CHANNEL_NAME_RE = /^[a-z0-9_]{1,25}$/;

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'A', 'CODE', 'PRE']);

const UNICODE_WS_CODES = new Set([
  0x1680,
  0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007,
  0x2008, 0x2009, 0x200A,
  0x2028, 0x2029, 0x202F, 0x205F,
  0x3000,
  0xFEFF
]);

const GLOBAL_STORAGE_PREFIX = 'globalCache:';

const CDN_PRECONNECTS = [
  'https://cdn.betterttv.net',
  'https://cdn.frankerfacez.com',
  'https://cdn.7tv.app'
];

// ─── Estado ───────────────────────────────────────────────────────────────────

const globalEmotes  = new Map();
const globalEmotesByProvider = new Map(); // provider → Array<{code,data}>
const channelEmotes = new Map();
const emotes        = new Map();

// Tabela de primeiros caracteres de códigos, separada entre ASCII
// (Uint8Array de 128 posições — consulta O(1) sem hash) e o raro caso
// Unicode (Set).
const emoteFirstCharASCII    = new Uint8Array(128);
const emoteFirstCharNonASCII = new Set();
let   hasAnyFirstChars       = false;

function markFirstChar(code) {
  const c = code.charCodeAt(0);
  hasAnyFirstChars = true;
  if (c < 128) emoteFirstCharASCII[c] = 1;
  else emoteFirstCharNonASCII.add(c);
}

function clearFirstChars() {
  hasAnyFirstChars = false;
  emoteFirstCharASCII.fill(0);
  emoteFirstCharNonASCII.clear();
}

let emoteTrieRoot = { children: new Map(), emote: null };

// Conjunto de códigos *globais* conhecidos. Usado para decidir se uma
// atualização pode ser incremental (só adição) ou exige rebuild completo.
let knownGlobalCodes = new Set();

let   emoteVersion    = 0;
// [FIX] WeakMap agora guarda apenas a `version` de cada text node já
// processado. A invalidação por mudança de conteúdo é feita pelo
// MutationObserver (com `characterDataOldValue: true`), que dá `delete`
// no nó sempre que o valor realmente muda.
let   processedNodes  = new WeakMap(); // TextNode → number (version)
const injectedImages  = new Set();
const channelInjectedImages = new Set();

let   pruneScheduled  = false;
let   pruneCounter    = 0;
const pendingRemovals = [];

let   currentChannel  = null;
let   currentUrl      = location.href;
let   chatObserver    = null;
let   observedChat    = null;
let   chatPollTimeout = null;
let   initToken       = 0;
let   initDebounceId  = null;

let   activePort      = null;

const parseQueue     = new Set();
let   parseScheduled = false;

let tooltipRafId        = 0;
let tooltipPreviewTimer = 0;
let activeTooltipImg    = null;

// ─── Tooltip (DOM) ────────────────────────────────────────────────────────────

const tooltipEl = document.createElement('div');
tooltipEl.id = 'emote-tooltip';

const tooltipPreview = document.createElement('img');
tooltipPreview.className = 'emote-tooltip-preview';
tooltipPreview.alt = '';

const tooltipName   = document.createElement('div');
tooltipName.className = 'emote-tooltip-name';

const tooltipSource = document.createElement('div');
tooltipSource.className = 'emote-tooltip-source';

const tooltipAuthor = document.createElement('div');
tooltipAuthor.className = 'emote-tooltip-author';

tooltipEl.append(tooltipPreview, tooltipName, tooltipSource, tooltipAuthor);

const tooltip = {
  preview: tooltipPreview,
  name:    tooltipName,
  source:  tooltipSource,
  author:  tooltipAuthor
};

function ensureTooltipAttached() {
  if (tooltipEl.isConnected) return true;
  if (!document.body) return false;
  try {
    document.body.appendChild(tooltipEl);
    return true;
  } catch (e) {
    console.debug('[Cinemotes] appendChild tooltip falhou:', e?.message || e);
    return false;
  }
}

// ─── Utilitários ──────────────────────────────────────────────────────────────

function getChannelFromUrl() {
  const name = location.pathname.split('/').find(Boolean)?.toLowerCase();
  if (!name) return null;
  if (RESERVED_CHANNELS.has(name)) return null;
  if (!CHANNEL_NAME_RE.test(name)) return null;
  return name;
}

function injectPreconnects() {
  for (const host of CDN_PRECONNECTS) {
    if (document.querySelector(`link[rel="preconnect"][href="${host}"]`)) continue;
    const l = document.createElement('link');
    l.rel = 'preconnect';
    l.href = host;
    l.crossOrigin = 'anonymous';
    document.head.appendChild(l);
  }
}

const CHAR_KIND = new Uint8Array(128);
(function initCharKind() {
  for (let c = 0; c < 128; c++) {
    let kind = 0;
    if (c === 32 || (c >= 9 && c <= 13)) kind |= 1;
    if (c >= 33 && c <= 126) {
      const isAlnum = (c >= 48 && c <= 57) ||
                      (c >= 65 && c <= 90) ||
                      (c >= 97 && c <= 122) ||
                      c === 95;
      kind |= isAlnum ? 4 : 2;
    }
    CHAR_KIND[c] = kind;
  }
})();

function isWhitespaceCode(c) {
  if (c < 128) return (CHAR_KIND[c] & 1) !== 0;
  return UNICODE_WS_CODES.has(c) || c === 160;
}

function isAsciiPunctCode(c) {
  if (c < 128) return (CHAR_KIND[c] & 2) !== 0;
  return false;
}

function isAlnumUnderscoreCode(c) {
  if (c < 128) return (CHAR_KIND[c] & 4) !== 0;
  return false;
}

function isBoundaryCode(c) {
  if (c < 128) return (CHAR_KIND[c] & 3) !== 0;
  return UNICODE_WS_CODES.has(c) || c === 160;
}

// Consulta O(1) para ASCII, sem hash. Só cai no Set quando o char é Unicode.
function textMayContainEmote(v) {
  if (!hasAnyFirstChars) return false;
  for (let i = 0; i < v.length; i++) {
    const c = v.charCodeAt(i);
    if (c < 128) {
      if (emoteFirstCharASCII[c]) return true;
    } else if (emoteFirstCharNonASCII.has(c)) {
      return true;
    }
  }
  return false;
}

function looksLikeNonEmoteShortText(v) {
  if (!v || v.length === 0 || v.length > 10) return false;
  for (let i = 0; i < v.length; i++) {
    const c = v.charCodeAt(i);
    const ok = (c >= 48 && c <= 57) || c === 58 || c === 46 || c === 44 ||
               c === 45 || c === 32 || c === 9 || c === 10 || c === 13;
    if (!ok) return false;
  }
  return true;
}

// ─── Prioridade e mesclagem ───────────────────────────────────────────────────

function emotePriority(provider, scope) {
  return (scope === 'Canal' ? 100 : 0) + (PROVIDER_PRIORITY[provider] || 0);
}

function addToMap(map, code, data) {
  if (!code || !data?.url) return;
  const existing = map.get(code);
  if (existing &&
      emotePriority(existing.provider, existing.scope) >=
      emotePriority(data.provider, data.scope)) return;
  data.code = code;
  map.set(code, data);
}

function insertEmoteRaw(code, emote) {
  if (!code || code.length > MAX_EMOTE_CODE_LEN) return;
  let node = emoteTrieRoot;
  for (let k = 0; k < code.length; k++) {
    const c = code.charCodeAt(k);
    let next = node.children.get(c);
    if (!next) {
      next = { children: new Map(), emote: null };
      node.children.set(c, next);
    }
    node = next;
  }
  node.emote = emote;
  markFirstChar(code);
  emotes.set(code, emote);
}

function rebuildFromGlobalsOnly() {
  emoteTrieRoot = { children: new Map(), emote: null };
  clearFirstChars();
  emotes.clear();
  for (const [code, emote] of globalEmotes) {
    insertEmoteRaw(code, emote);
  }
}

function insertChannelEmotes() {
  for (const [code, emote] of channelEmotes) {
    const existing = emotes.get(code);
    if (existing &&
        emotePriority(existing.provider, existing.scope) >=
        emotePriority(emote.provider, emote.scope)) continue;
    insertEmoteRaw(code, emote);
  }
}

// Aplica um provedor de globais com caminho incremental quando possível:
// - Se este provider *removeu* algum código (prevList ⊄ nextList), faz
//   rebuild total da trie (precisa remover folhas).
// - Caso contrário, só insere o delta no mapa de globais e na trie,
//   evitando realocar dezenas de milhares de objetos a cada provider.
function applyGlobalsProviderInternal(provider, list) {
  if (!provider) return false;

  const prevList = globalEmotesByProvider.get(provider) || [];
  const nextList = Array.isArray(list) ? list : [];
  globalEmotesByProvider.set(provider, nextList);

  // Detectar se este provider abandonou algum código.
  let removedFromProvider = false;
  if (prevList.length > 0) {
    const nextCodes = new Set();
    for (const e of nextList) nextCodes.add(e.code);
    for (const e of prevList) {
      if (!nextCodes.has(e.code)) { removedFromProvider = true; break; }
    }
  }

  if (removedFromProvider) {
    // Rebuild total do mapa unificado.
    globalEmotes.clear();
    for (const arr of globalEmotesByProvider.values()) {
      for (const { code, data } of arr) addToMap(globalEmotes, code, data);
    }
    knownGlobalCodes = new Set(globalEmotes.keys());
    rebuildFromGlobalsOnly();
    insertChannelEmotes();
    return true;
  }

  // Caminho incremental: apenas as entradas deste provider podem ter mudado.
  for (const { code, data } of nextList) {
    addToMap(globalEmotes, code, data);
  }

  // Primeira carga: precisa montar a trie a partir do zero.
  if (emotes.size === 0) {
    knownGlobalCodes = new Set(globalEmotes.keys());
    rebuildFromGlobalsOnly();
    insertChannelEmotes();
    return true;
  }

  // Delta no trie: só os códigos deste provider.
  let addedNew = false;
  for (const { code } of nextList) {
    if (!knownGlobalCodes.has(code)) {
      knownGlobalCodes.add(code);
      addedNew = true;
    }
    const emote = globalEmotes.get(code);
    if (!emote) continue;
    const existing = emotes.get(code);
    if (existing && existing.scope === 'Canal') continue;
    insertEmoteRaw(code, emote);
  }
  return addedNew;
}

// ─── Parser ───────────────────────────────────────────────────────────────────

function createEmoteImg(emote) {
  const img = document.createElement('img');
  img.className = 'bttv-emote';
  img.src = emote.url;
  img.alt = emote.code;
  img.dataset.emoteCode  = emote.code;
  img.dataset.emoteScope = emote.scope === 'Canal' ? 'channel' : 'global';
  img.loading  = 'lazy';
  img.decoding = 'async';

  img.addEventListener('error', () => {
    const p = img.parentNode;
    if (p) {
      const textNode = document.createTextNode(img.alt || '');
      try {
        p.replaceChild(textNode, img);
        processedNodes.set(textNode, emoteVersion);
      } catch (e) { console.debug('[Cinemotes] erro ao restaurar img:', e); }
    }
    injectedImages.delete(img);
    channelInjectedImages.delete(img);
    if (activeTooltipImg === img) hideTooltip();
  }, { once: true });

  injectedImages.add(img);
  if (emote.scope === 'Canal') channelInjectedImages.add(img);

  return img;
}

function replaceTextNode(textNode) {
  const raw = textNode.nodeValue;
  if (!raw) return;
  const rootChildren = emoteTrieRoot.children;
  if (rootChildren.size === 0) return;

  const len = raw.length;
  const frag = document.createDocumentFragment();

  let lastIndex = 0;
  let changed = false;
  let i = 0;

  while (i < len) {
    const c0 = raw.charCodeAt(i);
    if (isBoundaryCode(c0)) { i++; continue; }

    let tokenEnd = i + 1;
    while (tokenEnd < len && !isBoundaryCode(raw.charCodeAt(tokenEnd))) tokenEnd++;

    let node = rootChildren.get(c0);
    if (!node) { i = tokenEnd; continue; }

    let j = i + 1;
    let lastMatch = null;
    let lastMatchEnd = i;
    if (node.emote) {
      lastMatch = node.emote;
      lastMatchEnd = i + 1;
    }

    while (j < tokenEnd) {
      const next = node.children.get(raw.charCodeAt(j));
      if (!next) break;
      node = next;
      j++;
      if (node.emote) {
        lastMatch = node.emote;
        lastMatchEnd = j;
      }
    }

    if (lastMatch &&
        (lastMatchEnd === tokenEnd ||
         !isAlnumUnderscoreCode(raw.charCodeAt(lastMatchEnd)))) {
      if (i > lastIndex) {
        frag.appendChild(document.createTextNode(raw.slice(lastIndex, i)));
      }
      frag.appendChild(createEmoteImg(lastMatch));
      changed = true;
      lastIndex = lastMatchEnd;
      i = lastMatchEnd;
      continue;
    }
    i = tokenEnd;
  }

  if (!changed) return;

  if (lastIndex < len) frag.appendChild(document.createTextNode(raw.slice(lastIndex)));

  for (const child of frag.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      processedNodes.set(child, emoteVersion);
    }
  }

  const parent = textNode.parentNode;
  if (!parent) return;

  try {
    parent.replaceChild(frag, textNode);
  } catch (e) {
    console.debug('[Cinemotes] replaceChild falhou:', e?.message || e);
  }
}

// Cache positivo **e negativo** de skippable. O caminho de aceitação é o
// mais comum, então guardar o resultado negativo elimina um `closest()` por
// text node a cada reparse.
const skippableCache    = new WeakSet();
const nonSkippableCache = new WeakSet();

const SKIP_SELECTOR = 'script,style,a,code,pre,.bttv-emote';

function isSkippableParent(parent) {
  if (!parent) return true;
  if (skippableCache.has(parent)) return true;
  if (nonSkippableCache.has(parent)) return false;
  if (parent.closest?.(SKIP_SELECTOR)) {
    skippableCache.add(parent);
    return true;
  }
  nonSkippableCache.add(parent);
  return false;
}

function parseMessage(message, deadline) {
  if (!message?.isConnected) return true;
  if (emoteTrieRoot.children.size === 0) return true;
  if (!hasAnyFirstChars) return true;

  const version = emoteVersion;
  const walker = document.createTreeWalker(message, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const v = node.nodeValue;
      if (!v || !v.length) return NodeFilter.FILTER_REJECT;
      // [FIX] Comparação direta contra a version — a invalidação por
      // mudança de texto é feita no MutationObserver.
      if (processedNodes.get(node) === version) {
        return NodeFilter.FILTER_REJECT;
      }
      if (isSkippableParent(node.parentElement)) return NodeFilter.FILTER_REJECT;
      if (!textMayContainEmote(v)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const nodes = [];
  let walkAborted = false;
  let n;
  while ((n = walker.nextNode())) {
    if (deadline && performance.now() > deadline) {
      walkAborted = true;
      break;
    }
    nodes.push(n);
  }

  for (const node of nodes) {
    if (!node.isConnected) continue;
    if (deadline && performance.now() > deadline) return false;
    replaceTextNode(node);
    if (node.isConnected) {
      processedNodes.set(node, version);
    }
  }
  return !walkAborted;
}

// ─── Fila de parse (rAF + deadline) ───────────────────────────────────────────

// Se a aba está em background, `requestAnimationFrame` não dispara.
// Fallback para `setTimeout` (16ms) garante progresso.
function scheduleParseFlush() {
  if (document.hidden) {
    setTimeout(flushParseQueue, 16);
  } else {
    requestAnimationFrame(flushParseQueue);
  }
}

function scheduleParse(message) {
  if (!message || !message.isConnected) return;
  parseQueue.add(message);
  if (parseScheduled) return;
  parseScheduled = true;
  scheduleParseFlush();
}

function flushParseQueue() {
  parseScheduled = false;
  if (!parseQueue.size) return;

  const batch = [...parseQueue];
  parseQueue.clear();

  const deadline = performance.now() + PARSER_BUDGET_MS;
  let i = 0;

  for (; i < batch.length; i++) {
    if (performance.now() > deadline) break;
    const m = batch[i];
    if (!m.isConnected) continue;
    if (!parseMessage(m, deadline)) {
      parseQueue.add(m);
      i++;
      break;
    }
  }

  for (; i < batch.length; i++) parseQueue.add(batch[i]);

  if (parseQueue.size && !parseScheduled) {
    parseScheduled = true;
    scheduleParseFlush();
  }
}

// ─── Poda de imagens ──────────────────────────────────────────────────────────

function runPrune() {
  if (pendingRemovals.length) {
    for (const root of pendingRemovals) {
      if (root.classList?.contains('bttv-emote')) {
        if (injectedImages.delete(root)) {
          channelInjectedImages.delete(root);
          if (activeTooltipImg === root) hideTooltip();
        }
        continue;
      }
      const imgs = root.getElementsByClassName?.('bttv-emote');
      if (imgs && imgs.length) {
        for (let i = 0; i < imgs.length; i++) {
          const img = imgs[i];
          if (injectedImages.delete(img)) {
            channelInjectedImages.delete(img);
            if (activeTooltipImg === img) hideTooltip();
          }
        }
      }
    }
    pendingRemovals.length = 0;
  }

  if ((++pruneCounter & 255) !== 0) return;
  if (injectedImages.size < 100) return;
  for (const img of injectedImages) {
    if (!img.isConnected) {
      injectedImages.delete(img);
      channelInjectedImages.delete(img);
      if (activeTooltipImg === img) hideTooltip();
    }
  }
}

function schedulePrune() {
  if (pruneScheduled) return;
  pruneScheduled = true;

  const run = () => {
    pruneScheduled = false;
    runPrune();
  };

  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 3000 });
  } else {
    setTimeout(run, 1500);
  }
}

function queueRemovals(nodes) {
  for (const n of nodes) {
    if (n.nodeType === Node.ELEMENT_NODE) pendingRemovals.push(n);
  }
  schedulePrune();
}

// ─── Tooltip (lógica) ─────────────────────────────────────────────────────────

function showTooltip(img) {
  const emote = emotes.get(img.dataset.emoteCode || img.alt);
  if (!emote) return;
  if (!ensureTooltipAttached()) return;

  tooltip.name.textContent   = emote.code;
  tooltip.source.textContent = `${emote.provider} (${emote.scope})`;
  tooltip.author.textContent = emote.author ? `by ${emote.author}` : '';

  clearTimeout(tooltipPreviewTimer);
  const previewSrc = emote.previewUrl || emote.url;
  tooltipPreviewTimer = setTimeout(() => {
    if (tooltipPreview.src !== previewSrc) tooltipPreview.src = previewSrc;
  }, TOOLTIP_PREVIEW_DELAY);

  cancelAnimationFrame(tooltipRafId);
  tooltipRafId = requestAnimationFrame(() => {
    const h = tooltipEl.offsetHeight;
    const rect = img.getBoundingClientRect();

    const left = Math.max(10, Math.min(
      rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2,
      window.innerWidth - TOOLTIP_WIDTH - 10
    ));
    const top = rect.top - h - 10 < 10
      ? rect.bottom + 10
      : rect.top - h - 10;

    tooltipEl.style.left = `${left}px`;
    tooltipEl.style.top  = `${top}px`;
    tooltipEl.classList.add('visible');
  });
}

function hideTooltip() {
  cancelAnimationFrame(tooltipRafId);
  clearTimeout(tooltipPreviewTimer);
  tooltipEl.classList.remove('visible');
  activeTooltipImg = null;
}

document.addEventListener('pointerover', (e) => {
  const t = e.target;
  if (!t || t.nodeType !== 1) return;
  if (!t.classList.contains('bttv-emote')) return;
  if (activeTooltipImg === t) return;
  activeTooltipImg = t;
  showTooltip(t);
}, { passive: true });

document.addEventListener('pointerout', (e) => {
  const t = e.target;
  if (!t || t.nodeType !== 1) return;
  if (!t.classList.contains('bttv-emote')) return;
  if (t !== activeTooltipImg) return;
  hideTooltip();
}, { passive: true });

window.addEventListener('scroll', hideTooltip, { capture: true, passive: true });
window.addEventListener('resize', hideTooltip, { passive: true });

// ─── Comunicação com o SW via port ───────────────────────────────────────────
//
// Protocolo incremental:
//   SW → client: { type: 'GLOBALS', provider, globals }
//   SW → client: { type: 'GLOBALS_DONE' }
//   SW → client: { type: 'CHANNEL', channel }

class PortError extends Error {
  constructor(message, { retryable = false } = {}) {
    super(message);
    this.retryable = retryable;
  }
}

function fetchEmotesOnce(channel, onUpdate) {
  if (activePort) {
    try { activePort.disconnect(); } catch {}
    activePort = null;
  }

  return new Promise((resolve, reject) => {
    let port;
    try {
      port = chrome.runtime.connect({ name: 'cinemotes' });
    } catch (e) {
      reject(new PortError(e?.message || 'connect failed'));
      return;
    }
    activePort = port;

    let settled = false;
    let gotChannel = false;
    let globalsDone = false;
    const result = { globals: [], channel: [] };
    const globalByProvider = new Map();

    const release = () => {
      if (activePort === port) activePort = null;
      try { port.disconnect(); } catch {}
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      release();
      resolve(result);
    };

    const fail = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      release();
      reject(err);
    };

    const checkFinish = () => {
      if (globalsDone && gotChannel) finish();
    };

    const timer = setTimeout(
      () => fail(new PortError('background timeout', { retryable: false })),
      SW_MESSAGE_TIMEOUT
    );

    port.onMessage.addListener(msg => {
      if (settled) return;
      if (msg?.type === 'GLOBALS') {
        const prov = msg.provider || 'unknown';
        const list = Array.isArray(msg.globals) ? msg.globals : [];
        globalByProvider.set(prov, list);
        try { onUpdate?.({ type: 'GLOBALS', provider: prov, globals: list }); } catch {}
      } else if (msg?.type === 'GLOBALS_DONE') {
        globalsDone = true;
        result.globals = [];
        for (const list of globalByProvider.values()) {
          for (const e of list) result.globals.push(e);
        }
        try { onUpdate?.({ type: 'GLOBALS_DONE' }); } catch {}
        checkFinish();
      } else if (msg?.type === 'CHANNEL') {
        result.channel = Array.isArray(msg.channel) ? msg.channel : [];
        gotChannel = true;
        try { onUpdate?.({ type: 'CHANNEL', channel: result.channel }); } catch {}
        checkFinish();
      } else if (msg?.type === 'ERROR') {
        fail(new PortError(msg.error || 'background error', { retryable: false }));
        return;
      }
    });

    port.onDisconnect.addListener(() => {
      if (settled) return;
      if (gotChannel || globalsDone || globalByProvider.size > 0) {
        finish();
      } else {
        const err = chrome.runtime.lastError;
        fail(new PortError(err?.message || 'port disconnected', { retryable: true }));
      }
    });

    try {
      port.postMessage({ type: 'FETCH_EMOTES', channel });
    } catch (e) {
      fail(new PortError(e?.message || 'postMessage failed', { retryable: true }));
    }
  });
}

async function fetchEmotesStreaming(channel, onUpdate) {
  let lastErr = null;
  for (let attempt = 0; attempt < SW_MAX_ATTEMPTS; attempt++) {
    try {
      return await fetchEmotesOnce(channel, onUpdate);
    } catch (e) {
      lastErr = e;
      if (!(e instanceof PortError) || !e.retryable) throw e;
      if (attempt + 1 >= SW_MAX_ATTEMPTS) break;
      await new Promise(r => setTimeout(r, SW_RETRY_BACKOFF_MS));
    }
  }
  throw lastErr || new PortError('background unavailable');
}

// ─── Observador do chat ───────────────────────────────────────────────────────

// Filtro barato para a varredura inicial: descarta mensagens que não contêm
// sequer um primeiro caractere de emote. Uma única passada O(n) de string,
// antes de construir um TreeWalker inteiro.
function scheduleParseInitial(chat) {
  chat.querySelectorAll(MESSAGE_SELECTOR).forEach(m => {
    if (!m.isConnected) return;
    const t = m.textContent;
    if (!t || !textMayContainEmote(t)) return;
    scheduleParse(m);
  });
}

function initChatObserver() {
  clearTimeout(chatPollTimeout);
  chatPollTimeout = null;

  const chat = document.querySelector(CHAT_SELECTOR);
  if (!chat) {
    chatPollTimeout = setTimeout(initChatObserver, CHAT_POLL_INTERVAL);
    return;
  }

  if (observedChat === chat && chatObserver) {
    scheduleParseInitial(chat);
    return;
  }

  chatObserver?.disconnect();
  observedChat = chat;
  scheduleParseInitial(chat);

  chatObserver = new MutationObserver(mutations => {
    for (const m of mutations) {
      if (m.type === 'characterData') {
        const target = m.target;
        if (!target || target.nodeType !== Node.TEXT_NODE) continue;

        // Sem mudança real (o setter foi chamado mas o valor é idêntico).
        if (m.oldValue === target.nodeValue) continue;

        // Invalida a version cacheada — o parser precisa reprocessar.
        processedNodes.delete(target);

        const parent = target.parentElement;
        if (!parent || isSkippableParent(parent)) continue;

        const msg = parent.closest(MESSAGE_SELECTOR);
        if (!msg) continue;

        const v = target.nodeValue;
        if (looksLikeNonEmoteShortText(v)) continue;
        if (!textMayContainEmote(v)) continue;
        scheduleParse(msg);
        continue;
      }

      if (m.type !== 'childList') continue;

      if (activeTooltipImg && !activeTooltipImg.isConnected) hideTooltip();
      if (m.removedNodes?.length) queueRemovals(m.removedNodes);

      const addedNodes = m.addedNodes;
      if (!addedNodes || !addedNodes.length) continue;

      for (const added of addedNodes) {
        if (added.nodeType === Node.TEXT_NODE) {
          const parent = added.parentElement;
          if (!parent || isSkippableParent(parent)) continue;
          const msg = parent.closest(MESSAGE_SELECTOR);
          if (msg) scheduleParse(msg);
          continue;
        }

        if (added.nodeType !== Node.ELEMENT_NODE) continue;
        if (added.classList?.contains('bttv-emote')) continue;

        if (added.matches?.(MESSAGE_SELECTOR)) {
          scheduleParse(added);
        } else {
          added.querySelectorAll?.(MESSAGE_SELECTOR).forEach(scheduleParse);
          const closest = added.closest?.(MESSAGE_SELECTOR);
          if (closest) scheduleParse(closest);
        }
      }
    }
  });

  chatObserver.observe(chat, {
    childList:             true,
    subtree:               true,
    characterData:         true,
    characterDataOldValue: true
  });
}

// ─── Restauração seletiva (só emotes de canal) ────────────────────────────────

// Restaura imagens de canal em texto. Não chamamos `parent.normalize()`:
// o parser lida bem com text nodes adjacentes, e o normalize re-percorria
// a subtree inteira a cada troca de canal.
function restoreChannelEmotesToText() {
  for (const img of channelInjectedImages) {
    const p = img.parentNode;
    if (!p) {
      channelInjectedImages.delete(img);
      injectedImages.delete(img);
      if (activeTooltipImg === img) hideTooltip();
      continue;
    }
    try {
      const textNode = document.createTextNode(img.alt || '');
      p.replaceChild(textNode, img);
    } catch (e) {
      console.debug('[Cinemotes] restore img falhou:', e?.message || e);
    }
    channelInjectedImages.delete(img);
    injectedImages.delete(img);
    if (activeTooltipImg === img) hideTooltip();
  }
}

// ─── Inicialização ────────────────────────────────────────────────────────────

async function init() {
  const token = ++initToken;

  clearTimeout(chatPollTimeout);
  chatPollTimeout = null;
  chatObserver?.disconnect();
  chatObserver = null;
  observedChat = null;

  currentChannel = getChannelFromUrl();

  let prepared        = false;
  let globalsArrived  = false;
  // Se não há canal na URL, não precisamos esperar pelo CHANNEL.
  let channelArrived  = !currentChannel;
  let observerStarted = false;

  // Inicia o observer **uma única vez** por init — só quando tivermos o
  // conjunto completo (globais + canal). Antes, `onGlobalsDone` e
  // `onChannel` disparavam `initChatObserver` separadamente, causando dois
  // `querySelectorAll(MESSAGE_SELECTOR).forEach(scheduleParse)` em cada
  // troca de canal.
  const startObserverOnce = () => {
    if (observerStarted) return;
    if (!globalsArrived) return;
    if (!channelArrived) return;
    observerStarted = true;
    initChatObserver();
  };

  const prepare = () => {
    if (prepared) return;
    prepared = true;
    try { restoreChannelEmotesToText(); }
    catch (e) { console.warn('[Cinemotes] restore falhou:', e); }
    globalEmotesByProvider.clear();
    globalEmotes.clear();
    channelEmotes.clear();
    knownGlobalCodes.clear();
    emoteTrieRoot = { children: new Map(), emote: null };
    clearFirstChars();
    emotes.clear();
    processedNodes = new WeakMap();
    parseQueue.clear();
    pendingRemovals.length = 0;
    emoteVersion++;
  };

  const onGlobals = (provider, globals) => {
    if (token !== initToken) return;
    prepare();
    const addedNew = applyGlobalsProviderInternal(provider, globals);
    if (addedNew) emoteVersion++;
  };

  const onGlobalsDone = () => {
    if (token !== initToken) return;
    globalsArrived = true;
    if (!prepared) prepare();
    startObserverOnce();
  };

  const onChannel = (channel) => {
    if (token !== initToken) return;
    prepare();
    channelEmotes.clear();
    if (Array.isArray(channel)) {
      for (const { code, data } of channel) addToMap(channelEmotes, code, data);
    }
    insertChannelEmotes();
    emoteVersion++;
    channelArrived = true;
    startObserverOnce();
  };

  try {
    await fetchEmotesStreaming(currentChannel, (update) => {
      if (token !== initToken) return;
      if (update.type === 'GLOBALS') {
        onGlobals(update.provider, update.globals);
      } else if (update.type === 'GLOBALS_DONE') {
        onGlobalsDone();
      } else if (update.type === 'CHANNEL') {
        onChannel(update.channel);
      }
    });

    if (token !== initToken) return;

    if (!prepared) {
      // Port fechou sem enviar nada — cai no caminho de bootstrap.
      prepare();
      rebuildFromGlobalsOnly();
      insertChannelEmotes();
    }
    // Caso extremo: port resolveu sem enviar GLOBALS_DONE / CHANNEL.
    globalsArrived = true;
    channelArrived = true;
    startObserverOnce();
  } catch (err) {
    if (token !== initToken) return;
    console.error('[Cinemotes] Falha ao inicializar:', err);
    if (!prepared) {
      prepare();
      rebuildFromGlobalsOnly();
      insertChannelEmotes();
    }
    globalsArrived = true;
    channelArrived = true;
    startObserverOnce();
  }
}

function scheduleInit() {
  clearTimeout(initDebounceId);
  initDebounceId = setTimeout(init, INIT_DEBOUNCE_MS);
}

// ─── Detecção de mudança de URL ───────────────────────────────────────────────

let urlCheckScheduled = false;

// Fallback para `setTimeout` quando `document.hidden`: rAF não dispara em
// abas em background, e antes isso deixava `urlCheckScheduled=true` preso
// para sempre — navegações em background eram perdidas até a aba voltar.
function checkUrlChange() {
  if (urlCheckScheduled) return;
  urlCheckScheduled = true;

  const run = () => {
    urlCheckScheduled = false;
    if (location.href === currentUrl) return;
    currentUrl = location.href;
    if (getChannelFromUrl() !== currentChannel) scheduleInit();
  };

  if (document.hidden) {
    setTimeout(run, 0);
  } else {
    requestAnimationFrame(run);
  }
}

let hasNavigationApi = false;
if (window.navigation?.addEventListener) {
  try {
    window.navigation.addEventListener('navigatesuccess', checkUrlChange);
    hasNavigationApi = true;
  } catch (e) {
    console.debug('[Cinemotes] Navigation API indisponível:', e);
  }
}

if (!hasNavigationApi) {
  try {
    const origPush    = history.pushState;
    const origReplace = history.replaceState;
    history.pushState = function (...args) {
      const ret = origPush.apply(this, args);
      checkUrlChange();
      return ret;
    };
    history.replaceState = function (...args) {
      const ret = origReplace.apply(this, args);
      checkUrlChange();
      return ret;
    };
  } catch (e) {
    console.debug('[Cinemotes] patch de history falhou, usando polling:', e);
    setInterval(checkUrlChange, URL_POLL_INTERVAL);
  }
}

window.addEventListener('popstate',   checkUrlChange);
window.addEventListener('hashchange', checkUrlChange);

// ─── Bootstrap ────────────────────────────────────────────────────────────────

injectPreconnects();
init();