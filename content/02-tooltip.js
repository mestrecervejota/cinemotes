'use strict';

// ─── Tooltip — construção do DOM ──────────────────────────────────────────────

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
  const root = document.documentElement || document.body;
  if (!root) return false;
  try {
    root.appendChild(tooltipEl);
    return true;
  } catch (e) {
    console.debug('[Cinemotes] appendChild tooltip falhou:', e?.message || e);
    return false;
  }
}

// ─── Preenchimento genérico ───────────────────────────────────────────────────

// Evita invalidar layout escrevendo o mesmo texto repetidamente.
function setText(el, value) {
  const v = value || '';
  if (el.textContent !== v) el.textContent = v;
}

function tooltipFill({ code, provider, scope, author, url, previewUrl }) {
  setText(tooltip.name, code);

  const scopeLabel = scope === 'Canal' ? 'Canal'
                   : scope === 'Global' ? 'Global'
                   : '';
  setText(tooltip.source, scopeLabel
    ? `${provider || ''} · ${scopeLabel}`
    : (provider || ''));
  setText(tooltip.author, author ? `by ${author}` : '');

  // Prefere previewUrl quando disponível; senão cai pro url.
  const nextSrc = previewUrl || url || '';
  if (nextSrc && tooltipPreview.getAttribute('src') !== nextSrc) {
    tooltipPreview.src = nextSrc;
  }
}

function tooltipPosition(el) {
  cancelAnimationFrame(tooltipRafId);
  tooltipRafId = requestAnimationFrame(() => {
    // Agrupa todas as leituras primeiro, depois todas as escritas,
    // para evitar layout thrashing.
    const rect = el.getBoundingClientRect();
    const h = tooltipEl.offsetHeight;

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
  // Idempotente: sai cedo se já está escondido, evitando style
  // invalidation repetida em eventos de scroll.
  if (!tooltipEl.classList.contains('visible')) return;
  cancelAnimationFrame(tooltipRafId);
  tooltipPreviewToken++;
  tooltipEl.classList.remove('visible');
  activeTooltipImg = null;
}

// ─── Preload em background ────────────────────────────────────────────────────
//
// Quando o usuário para o mouse sobre um emote, aproveitamos para baixar as
// previews de TODOS os emotes visíveis no chat. Deduplicamos por URL e
// limitamos a concorrência para não competir com o preview em foco.

const warmedUrls = new Set();
const warmQueue  = [];
const WARM_MAX_CONCURRENT = 5;
let warmInflight = 0;

function warmPump() {
  while (warmInflight < WARM_MAX_CONCURRENT && warmQueue.length) {
    const src = warmQueue.shift();
    warmInflight++;
    const pre = new Image();
    pre.decoding = 'async';
    pre.onload = pre.onerror = () => {
      warmInflight--;
      warmPump();
    };
    pre.src = src;
  }
}

function warmUrl(src) {
  if (!src || warmedUrls.has(src)) return;
  warmedUrls.add(src);
  warmQueue.push(src);
  warmPump();
}

function warmupVisibleEmotes() {
  if (!emotes || emotes.size === 0) return;
  const nodes = document.querySelectorAll('img.bttv-emote, img[src*="cdn.cinefy.gg/emotes/"]');
  for (const img of nodes) {
    const code = img.dataset?.emoteCode || img.alt;
    if (!code) continue;
    const emote = emotes.get(code);
    warmUrl(emote?.previewUrl || emote?.url);
  }
}

// Se o conjunto de emotes for reconstruído (novos providers/emotes),
// limpe o cache de URLs pré-aquecidas para permitir re-fetch.
function resetWarmCache() {
  warmedUrls.clear();
  warmQueue.length = 0;
}

// ─── Path 1 — emotes injetados pela extensão ──────────────────────────────────

function showTooltip(img) {
  const emote = emotes.get(img.dataset.emoteCode || img.alt);
  if (!emote) return;
  if (!ensureTooltipAttached()) return;

  tooltipFill({
    code:       emote.code,
    provider:   emote.provider,
    scope:      emote.scope,
    author:     emote.author,
    url:        emote.url,
    previewUrl: emote.previewUrl
  });
  tooltipPosition(img);
}

// ─── Path 2 — emotes nativos do Cinefy ────────────────────────────────────────
//
// O Cinefy renderiza <img alt="sasukeStare" src="https://cdn.cinefy.gg/emotes/...">.
// O código está no alt. O map `emotes` já tem esse código (chegou pelo bridge).

function isNativeCinefyEmote(el) {
  if (!el || el.nodeType !== 1) return false;
  if (el.tagName !== 'IMG') return false;
  const src = el.getAttribute('src') || '';
  if (!src.includes('cdn.cinefy.gg/emotes/')) return false;
  const code = (el.getAttribute('alt') || '').trim();
  return code.length > 0;
}

function showTooltipNative(el) {
  const code = (el.getAttribute('alt') || '').trim();
  if (!code) return false;

  const emote = emotes.get(code);
  if (!ensureTooltipAttached()) return false;

  if (emote) {
    tooltipFill({
      code:       emote.code,
      provider:   emote.provider,
      scope:      emote.scope,
      author:     emote.provider === 'Cinefy' ? null : emote.author,
      previewUrl: emote.previewUrl,
      url:        emote.url
    });
  } else {
    // Fallback: só nome + provider, sem preview (o emote não está no map)
    tooltipFill({ code, provider: 'Cinefy' });
  }
  tooltipPosition(el);
  return true;
}

// ─── Listeners ────────────────────────────────────────────────────────────────
//
// Em vez de reagir a pointerover/pointerout (que são voláteis — o virtuoso
// do Cinefy recria os <img> o tempo todo, gerando pointerout fantasma),
// usamos pointermove + elementFromPoint. A cada movimento descobrimos
// o elemento embaixo do cursor e decidimos o que mostrar.
//
// Throttle por requestAnimationFrame: no máximo um hit-test por frame.

let lastPointerKey = null;
let pointerRafId = 0;
let pendingPointer = null;

function pickEmoteAt(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el || el.nodeType !== 1) return null;

  if (el.classList?.contains('bttv-emote')) {
    return { el, code: el.dataset.emoteCode || el.alt, kind: 'bttv' };
  }
  if (isNativeCinefyEmote(el)) {
    return { el, code: (el.getAttribute('alt') || '').trim(), kind: 'native' };
  }
  return null;
}

function processPointer(x, y) {
  const found = pickEmoteAt(x, y);
  if (!found) {
    if (activeTooltipImg) hideTooltip();
    lastPointerKey = null;
    return;
  }

  const key = found.kind + ':' + found.code;
  if (key === lastPointerKey && activeTooltipImg) return;

  lastPointerKey = key;
  activeTooltipImg = found.el;

  if (found.kind === 'bttv') {
    showTooltip(found.el);
  } else {
    const ok = showTooltipNative(found.el);
    if (!ok) { activeTooltipImg = null; lastPointerKey = null; }
  }
}

function onPointerMove(e) {
  pendingPointer = { x: e.clientX, y: e.clientY };
  if (pointerRafId) return;
  pointerRafId = requestAnimationFrame(() => {
    pointerRafId = 0;
    const p = pendingPointer;
    pendingPointer = null;
    if (p) processPointer(p.x, p.y);
  });
}

document.addEventListener('pointermove', onPointerMove, { passive: true, capture: true });

window.addEventListener('scroll', hideTooltip, { capture: true, passive: true });
window.addEventListener('resize', hideTooltip, { passive: true });