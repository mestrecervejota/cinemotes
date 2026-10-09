'use strict';

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
const AC_NATIVE_HIDE_ATTR = 'data-cinemotes-hidden-native';
const AC_BODY_OPEN_CLS = 'cinemotes-ac-open';
const AC_STYLE_TAG_ID  = 'cinemotes-ac-native-hide';

// ─── Estado ───────────────────────────────────────────────────────────────────

let acPanel          = null;
let acResults        = [];
let acSelectedIndex  = 0;
let acOpen           = false;
let acDebounceTimer  = 0;
let acLastQuery      = '';
let acObserver       = null;
let acBoundInput     = null;
let acNativeObserverStarted = false;

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
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (!range.collapsed) return null;
    if (!input.contains(range.startContainer)) return null;

    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return null;
    const text = node.nodeValue;
    const off  = range.startOffset;
    let i = off - 1;
    while (i >= 0 && /[a-zA-Z0-9_]/.test(text[i])) i--;
    if (i < 0 || text[i] !== ':') return null;
    if (i > 0 && !/[\s\n]/.test(text[i - 1])) return null;
    return {
      node,
      start: i,
      end: off,
      query: text.slice(i + 1, off)
    };
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


// ─── Abrir/fechar ─────────────────────────────────────────────────────────────

function acOpenFor(input, query) {
  acEnsurePanel();
  acLastQuery = query;
  acResults = acSearch(query);
  acRender();
  acPosition(input);
  acPanel.style.display = 'block';
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
  recentsPush(emote.code);
  if (ok) acClose();
}

// ─── Eventos ──────────────────────────────────────────────────────────────────

function acScheduleUpdate() {
  clearTimeout(acDebounceTimer);
  acDebounceTimer = setTimeout(acUpdateFromInput, AC_DEBOUNCE_MS);
}

function acUpdateFromInput() {
  const input = acFindChatInput();
  if (!input) { acClose(); return; }

  const trigger = acParseTrigger(input);
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
  if (input !== acFindChatInput()) return;
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

function acInstallObserver() {
  if (acObserver) return;
  acObserver = new MutationObserver(() => {
    const input = acFindChatInput();
    if (!input) { acClose(); return; }
    if (acBoundInput !== input) {
      acBoundInput = input;
    }
  });
  acObserver.observe(document.body, { childList: true, subtree: true });
}

function acBindInput() {
  const input = acFindChatInput();
  if (!input) {
    setTimeout(acBindInput, 500);
    return;
  }
  acBoundInput = input;

  input.addEventListener('input', acOnInputEvent, true);
  input.addEventListener('keydown', acOnKeyDown, true);
  input.addEventListener('blur', () => {
    setTimeout(() => { if (acOpen) acClose(); }, 150);
  });

  acInstallObserver();
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

setTimeout(acBindInput, 600);