'use strict';
cinemotesDebug('autocomplete-script-loaded');

// ─── Autocomplete próprio ─────────────────────────────────────────────────────
//
// Quando o usuário digita ":" + texto no campo de chat, abrimos nosso popup
// (com emotes do Cinefy + BTTV + FFZ + 7TV) e escondemos o popup nativo
// do Cinefy. A inserção usa o setter nativo de input/textarea para que o
// React do Cinefy perceba a mudança.

const AC_MAX_RESULTS    = 60;
const AC_DEBOUNCE_MS    = 40;
const AC_WIDTH          = 320;
const AC_MAX_HEIGHT     = 260;
const AC_ITEM_HEIGHT    = 34;
const AC_PANEL_ID       = 'cinemotes-autocomplete';
const AC_HIGHLIGHT_CLS  = 'cinemotes-ac-highlighted';
const AC_PANEL_CLS      = 'cinemotes-ac-panel';
const AC_ITEM_CLS       = 'cinemotes-ac-item';
const AC_BODY_OPEN_CLS = 'cinemotes-ac-open';

// ─── Estado ───────────────────────────────────────────────────────────────────

let acPanel          = null;
let acResults        = [];
let acSelectedIndex  = 0;
let acOpen           = false;
let acDebounceTimer  = 0;
let acLastQuery      = '';
let acObserver       = null;
let acBoundInput     = null;
const acInputsWithListeners = new WeakSet();

// ─── Construção do DOM ────────────────────────────────────────────────────────

function acEnsurePanel() {
  if (acPanel) return;
  acPanel = document.createElement('div');
  acPanel.id = AC_PANEL_ID;
  acPanel.className = AC_PANEL_CLS;
  acPanel.setAttribute('role', 'listbox');
  document.body.appendChild(acPanel);
  acPanel.addEventListener('mousedown', (e) => {
    const item = e.target.closest(`.${AC_ITEM_CLS}`);
    if (!item) return;
    e.preventDefault();
    const idx = Number(item.dataset.idx);
    const emote = acResults[idx];
    if (emote) acApplyEmote(emote);
  });
}

// ─── Detecção de input do chat ────────────────────────────────────────────────

function acFindChatInput() {
  const sel = [
    '[contenteditable="true"][aria-label="Enviar mensagem"]',
    'textarea[aria-label="Enviar mensagem"]',
    'textarea[placeholder]',
    'input[type="text"][placeholder]',
    'div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"]',
    '[role="textbox"]'
  ];
  for (const s of sel) {
    const all = document.querySelectorAll(s);
    for (const el of all) {
      // Ignora inputs que moram dentro de UI nossa
      if (el.closest('#cinemotes-menu')) continue;
      if (el.closest('#cinemotes-autocomplete')) continue;
      return el;
    }
  }
  return null;
}

// ─── Trigger: ":letra(s)" ─────────────────────────────────────────────────────

function acParseTrigger(input) {
  if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
    const pos = input.selectionStart;
    if (pos !== input.selectionEnd) return null;
    const v = input.value;

    let i = pos - 1;
    while (i >= 0 && /[a-zA-Z0-9_]/.test(v[i])) i--;
    if (i < 0 || v[i] !== ':') return null;
    if (i > 0 && !/[\s\n]/.test(v[i - 1])) return null;

    return { start: i, end: pos, query: v.slice(i + 1, pos) };
  }

  if (input.isContentEditable) {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return null;
    const caret = selection.getRangeAt(0);
    if (!caret.collapsed || !input.contains(caret.startContainer)) return null;

    // Firefox can place the caret on a paragraph or editor element,
    // instead of on its text node. Read the text up to the DOM caret.
    const container = caret.startContainer.nodeType === Node.ELEMENT_NODE
      ? caret.startContainer : caret.startContainer.parentElement;
    const paragraph = container?.closest?.('p, li, div');
    const scope = paragraph && input.contains(paragraph) ? paragraph : input;
    const prefix = document.createRange();
    prefix.selectNodeContents(scope);
    prefix.setEnd(caret.startContainer, caret.startOffset);
    const text = prefix.toString();
    const match = /(?:^|\s):([a-zA-Z0-9_]*)$/.exec(text);
    if (!match) return null;
    const query = match[1];
    const start = text.length - query.length - 1;

    // Map the text offset back to a DOM position. The resulting range
    // replaces just the trigger, preserving the editor's other markup.
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    let offset = 0;
    let node;
    while ((node = walker.nextNode())) {
      const length = node.nodeValue.length;
      if (start < offset + length) {
        const replacement = caret.cloneRange();
        replacement.setStart(node, start - offset);
        return { range: replacement, query };
      }
      offset += length;
    }
    return null;
  }

  return null;
}

// ─── Busca de emotes ──────────────────────────────────────────────────────────

function acSearch(query) {
  if (!query) return [];
  const q = query.toLowerCase();

  const canal = [];
  const globais = [];

  for (const [code, data] of emotes) {
    if (!code.toLowerCase().includes(q)) continue;
    const entry = { code, data };
    if (data.scope === 'Canal') canal.push(entry);
    else globais.push(entry);
  }

  // Ordenação dentro de cada grupo: primeiro os que COMEÇAM com a query,
  // depois os que apenas contêm. Dentro de cada sub-grupo, prioridade.
  const subRank = (code) => code.toLowerCase().startsWith(q) ? 0 : 1;

  const byPriority = (a, b) => {
    const ra = subRank(a.code);
    const rb = subRank(b.code);
    if (ra !== rb) return ra - rb;
    const pa = emotePriority(a.data.provider, a.data.scope);
    const pb = emotePriority(b.data.provider, b.data.scope);
    if (pa !== pb) return pb - pa;
    return a.code.localeCompare(b.code);
  };
  canal.sort(byPriority);
  globais.sort(byPriority);

  return canal.concat(globais).slice(0, AC_MAX_RESULTS);
}

// ─── Render do painel ─────────────────────────────────────────────────────────

function acRender() {
  if (!acPanel) return;
  if (!acResults.length) {
    acPanel.innerHTML = '<div class="cinemotes-ac-empty">Nenhum emote</div>';
    return;
  }

  let html = '';
  for (let i = 0; i < acResults.length; i++) {
    const e = acResults[i];
    const scopeLabel = e.data.scope === 'Canal' ? 'canal' : 'global';
    html +=
      `<div class="${AC_ITEM_CLS}" role="option" data-idx="${i}">` +
        `<img loading="lazy" decoding="async" src="${e.data.url}" alt="">` +
        `<span class="cinemotes-ac-code">${e.code}</span>` +
        `<span class="cinemotes-ac-meta">${e.data.provider} · ${scopeLabel}</span>` +
      `</div>`;
  }
  acPanel.innerHTML = html;
  acSetSelected(0);
}

function acSetSelected(idx) {
  if (!acPanel) return;
  const items = acPanel.querySelectorAll(`.${AC_ITEM_CLS}`);
  if (!items.length) return;

  // Navegação circular: wrap-around explícito.
  const n = items.length;
  if (idx < 0) idx = n - 1;
  if (idx >= n) idx = 0;

  acSelectedIndex = idx;
  for (let i = 0; i < n; i++) {
    if (i === acSelectedIndex) {
      items[i].classList.add(AC_HIGHLIGHT_CLS);
      items[i].scrollIntoView({ block: 'nearest' });
    } else {
      items[i].classList.remove(AC_HIGHLIGHT_CLS);
    }
  }
}

// ─── Posicionamento ───────────────────────────────────────────────────────────

function acPosition(input) {
  if (!acPanel) return;
  const rect = input.getBoundingClientRect();
  const panelH = Math.min(AC_MAX_HEIGHT, acResults.length * AC_ITEM_HEIGHT + 8);

  let left = rect.left;
  if (left + AC_WIDTH > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - AC_WIDTH - 8);
  }
  let top = rect.top - panelH - 6;
  if (top < 8) top = rect.bottom + 6;

  acPanel.style.left = `${left}px`;
  acPanel.style.top  = `${top}px`;
  acPanel.style.width = `${AC_WIDTH}px`;
  acPanel.style.maxHeight = `${AC_MAX_HEIGHT}px`;
}

// ─── Esconder popup nativo (via CSS com !important) ───────────────────────────
//
// O approach anterior (style.display = 'none' inline) é frágil: o React
// re-renderiza o popup a cada letra digitada e restaura o `display`.
// Agora usamos uma classe no <body> combinada com uma regra CSS com
// `!important` — esta vence inline styles e sobrevive a re-renders.

function acShowNativeSuppression() {
  document.body.classList.add(AC_BODY_OPEN_CLS);
}

function acHideNativeSuppression() {
  document.body.classList.remove(AC_BODY_OPEN_CLS);
}

function acOpenFor(input, query) {
  acEnsurePanel();
  acLastQuery = query;
  acResults = acSearch(query);
  cinemotesDebug('search-results', { queryLength: query.length, catalogSize: emotes.size, results: acResults.length });
  acRender();
  acPosition(input);
  acPanel.style.display = 'block';
  cinemotesDebug('panel-open', { display: getComputedStyle(acPanel).display, visibility: getComputedStyle(acPanel).visibility, rect: { x: acPanel.getBoundingClientRect().x, y: acPanel.getBoundingClientRect().y, width: acPanel.getBoundingClientRect().width, height: acPanel.getBoundingClientRect().height } });
  acOpen = true;
  acShowNativeSuppression();
}

function acClose() {
  if (!acOpen && !acPanel) return;
  acOpen = false;
  acLastQuery = '';
  acResults = [];
  acSelectedIndex = 0;
  if (acPanel) {
    acPanel.style.display = 'none';
    acPanel.innerHTML = '';
  }
  acHideNativeSuppression();
}

// ─── Inserção no input ────────────────────────────────────────────────────────

function acInsertIntoInput(input, trigger, code) {
  if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
    const before = input.value.slice(0, trigger.start);
    const after  = input.value.slice(trigger.end);
    const newText = before + code + ' ' + after;

    const proto = input.tagName === 'TEXTAREA'
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(input, newText);
    input.dispatchEvent(new Event('input', { bubbles: true }));

    const cursor = trigger.start + code.length + 1;
    input.setSelectionRange(cursor, cursor);
    return true;
  }

  if (input.isContentEditable && trigger.range) {
    const replacement = trigger.range;
    if (!input.contains(replacement.startContainer) ||
        !input.contains(replacement.endContainer)) return false;
    const text = document.createTextNode(code + ' ');
    replacement.deleteContents();
    replacement.insertNode(text);
    const caret = document.createRange();
    caret.setStart(text, text.nodeValue.length);
    caret.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(caret);
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    return true;
  }

  if (input.isContentEditable && trigger.node) {
    const textNode = trigger.node;
    const text = textNode.nodeValue;
    const before = text.slice(0, trigger.start);
    const after  = text.slice(trigger.end);
    const newText = before + code + ' ' + after;
    textNode.nodeValue = newText;

    const range = document.createRange();
    const newOffset = (before + code + ' ').length;
    range.setStart(textNode, Math.min(newOffset, newText.length));
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    return true;
  }

  return false;
}

function acApplyEmote(emote) {
  const input = acFindChatInput();
  if (!input) { acClose(); return; }

  const trigger = acParseTrigger(input);
  if (!trigger) { acClose(); return; }

  const ok = acInsertIntoInput(input, trigger, emote.code);
  if (ok) {
    recentsPush(emote.code);
    acClose();
  }
}

// ─── Eventos ──────────────────────────────────────────────────────────────────

function acScheduleUpdate() {
  clearTimeout(acDebounceTimer);
  acDebounceTimer = setTimeout(acUpdateFromInput, AC_DEBOUNCE_MS);
}

function acUpdateFromInput() {
  cinemotesDebug('update-start', { catalogSize: emotes.size });
  const input = acFindChatInput();
  if (!input) { acClose(); return; }

  const selection = window.getSelection();
  cinemotesDebug('selection', {
    input: cinemotesDescribeInput(input),
    rangeCount: selection?.rangeCount,
    anchorType: selection?.anchorNode?.nodeType,
    anchorInsideInput: !!selection?.anchorNode && input.contains(selection.anchorNode),
    collapsed: selection?.isCollapsed,
    activeIsInput: document.activeElement === input
  });
  const trigger = acParseTrigger(input);
  cinemotesDebug('trigger', { found: !!trigger, queryLength: trigger?.query?.length || 0 });
  if (!trigger || !trigger.query) {
    acClose();
    return;
  }
  if (trigger.query === acLastQuery && acOpen) {
    acPosition(input);
    return;
  }
  acOpenFor(input, trigger.query);
}

function acOnInputEvent(e) {
  const input = e.target;
  if (!input) return;
  if (input !== acFindChatInput()) {
    cinemotesDebug('input-event-rejected', { target: cinemotesDescribeInput(input), selected: cinemotesDescribeInput(acFindChatInput()) });
    return;
  }
  cinemotesDebug('input-event-accepted', { inputType: e.inputType, composing: e.isComposing });
  acScheduleUpdate();
}

function acOnKeyDown(e) {
  if (!acOpen) return;
  const key = e.key;

  if (key === 'ArrowDown') {
    e.preventDefault();
    e.stopImmediatePropagation();
    acSetSelected(acSelectedIndex + 1);
    return;
  }
  if (key === 'ArrowUp') {
    e.preventDefault();
    e.stopImmediatePropagation();
    acSetSelected(acSelectedIndex - 1);
    return;
  }
  if (key === 'Enter' || key === 'Tab') {
    if (!acResults.length) return;
    const emote = acResults[acSelectedIndex];
    if (!emote) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    acApplyEmote(emote);
    return;
  }
    if (key === 'Escape') {
    e.preventDefault();
    // NÃO chamamos stopImmediatePropagation aqui: precisamos que o
    // Cinefy receba o Esc também, para fechar o popup dele no estado do
    // React. Sem isso, o popup dele fica "preso" — invisível (CSS), mas
    // sempre voltando quando nosso autocomplete fecha.
    acClose();
    return;
  }
}

// ─── Observers e bootstrap ────────────────────────────────────────────────────

function acAttachInput(input) {
  if (acBoundInput !== input) {
    cinemotesDebug('input-changed', { input: cinemotesDescribeInput(input) });
    acClose();
  }
  acBoundInput = input;
  if (!input || acInputsWithListeners.has(input)) return;
  acInputsWithListeners.add(input);
  cinemotesDebug('input-bound', cinemotesDescribeInput(input));
  input.addEventListener('input', acOnInputEvent, true);
  input.addEventListener('keydown', acOnKeyDown, true);
  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (acBoundInput === input && acOpen) acClose();
    }, 150);
  });
}

function acInstallObserver() {
  if (acObserver) return;
  acObserver = new MutationObserver(() => {
    acAttachInput(acFindChatInput());
  });
  acObserver.observe(document.body, { childList: true, subtree: true });
}

function acBindInput() {
  cinemotesDebug('binding-start', { input: cinemotesDescribeInput(acFindChatInput()), catalogSize: emotes.size });
  acInstallObserver();
  acAttachInput(acFindChatInput());
}

document.addEventListener('click', (e) => {
  if (!acOpen) return;
  if (acPanel && acPanel.contains(e.target)) return;
  if (e.target === acFindChatInput()) return;
  acClose();
}, true);

document.addEventListener('pointerdown', (e) => {
  if (!acOpen) return;
  if (acPanel && acPanel.contains(e.target)) return;
  if (e.target === acFindChatInput()) return;
  acClose();
}, true);

// Capture events on the document to diagnose missing editor listeners.
let acDiagnosticEventCount = 0;
document.addEventListener('input', event => {
  const el = event.target;
  if (!el?.isContentEditable && !['INPUT', 'TEXTAREA'].includes(el?.tagName)) return;
  if (el.closest?.('#cinemotes-menu, #cinemotes-autocomplete')) return;
  if (++acDiagnosticEventCount > 30) return;
  cinemotesDebug('document-input', {
    target: cinemotesDescribeInput(el),
    matchesSelectedInput: el === acFindChatInput(),
    matchesBoundInput: el === acBoundInput,
    inputType: event.inputType
  });
}, true);
setTimeout(() => {
  try { acBindInput(); } catch (error) {
    console.error('[Cinemotes/Firefox] binding-error', error.message, error.stack);
  }
}, 600);