'use strict';

// ─── Criação de <img> ─────────────────────────────────────────────────────────

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

// ─── Substituição de um text node por imagens + texto ─────────────────────────

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
    // Fronteira de busca: só whitespace. Pontuação pode fazer parte
    // de um código de emote (ex.: "D:", ":-)", "o.O").
    if (isWhitespaceCode(raw.charCodeAt(i))) { i++; continue; }

    // Fim da "palavra" — até o próximo whitespace.
    let wordEnd = i + 1;
    while (wordEnd < len && !isWhitespaceCode(raw.charCodeAt(wordEnd))) wordEnd++;

    // Tenta casar em cada posição dentro da palavra.
    let pos = i;
    while (pos < wordEnd) {
      // Match não pode começar no meio de um trecho alfanumérico.
      if (pos > i && isAlnumUnderscoreCode(raw.charCodeAt(pos - 1))) {
        pos++;
        continue;
      }

      const c0 = raw.charCodeAt(pos);
      const root = rootChildren.get(c0);
      if (!root) { pos++; continue; }

      let node = root;
      let j = pos + 1;
      let lastMatch = null;
      let lastMatchEnd = pos;
      if (node.emote) {
        lastMatch = node.emote;
        lastMatchEnd = pos + 1;
      }

      while (j < wordEnd) {
        const next = node.children.get(raw.charCodeAt(j));
        if (!next) break;
        node = next;
        j++;
        if (node.emote) {
          lastMatch = node.emote;
          lastMatchEnd = j;
        }
      }

      if (lastMatch) {
        const nextChar = lastMatchEnd < wordEnd ? raw.charCodeAt(lastMatchEnd) : -1;
        const lastChar = raw.charCodeAt(lastMatchEnd - 1);

        // Aceita se: termina a palavra, OU o que vem depois não é
        // alfanumérico (Kappa!), OU o match termina em pontuação (D:).
        const nextOk = nextChar === -1 || !isAlnumUnderscoreCode(nextChar);
        const endsOk = !isAlnumUnderscoreCode(lastChar);

        if (nextOk || endsOk) {
          if (pos > lastIndex) {
            frag.appendChild(document.createTextNode(raw.slice(lastIndex, pos)));
          }
          frag.appendChild(createEmoteImg(lastMatch));
          lastIndex = lastMatchEnd;
          pos = lastMatchEnd;
          changed = true;
          continue;
        }
      }
      pos++;
    }

    i = wordEnd;
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

// ─── Filtro de parents "skippable" (a, code, pre, etc.) ──────────────────────
//
// Antes: `parent.closest(SKIP_SELECTOR)` sempre, mesmo com cache negativo,
// custava caro em mensagens com muitos spans inline. Agora: checa tag name
// inline primeiro (O(1)) antes de cair no `closest()`.

const skippableCache    = new WeakSet();
const nonSkippableCache = new WeakSet();

function isSkippableParent(parent) {
  if (!parent) return true;
  if (skippableCache.has(parent)) return true;
  if (nonSkippableCache.has(parent)) return false;

  const tag = parent.tagName;
  if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'A' ||
      tag === 'CODE'   || tag === 'PRE') {
    skippableCache.add(parent);
    return true;
  }
  if (parent.classList?.contains('bttv-emote')) {
    skippableCache.add(parent);
    return true;
  }
  if (parent.closest?.(SKIP_SELECTOR)) {
    skippableCache.add(parent);
    return true;
  }
  nonSkippableCache.add(parent);
  return false;
}

// ─── Parse de uma mensagem ────────────────────────────────────────────────────

function parseMessage(message, deadline) {
  if (!message?.isConnected) return true;
  if (emoteTrieRoot.children.size === 0) return true;
  if (!hasAnyFirstChars) return true;

  const version = emoteVersion;
  const walker = document.createTreeWalker(message, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const v = node.nodeValue;
      if (!v || !v.length) return NodeFilter.FILTER_REJECT;
      if (processedNodes.get(node) === version) return NodeFilter.FILTER_REJECT;
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
  }
  return !walkAborted;
}

// ─── Fila de parse (rAF + deadline) ───────────────────────────────────────────

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