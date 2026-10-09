'use strict';

// ─── Estado — maps de emotes ──────────────────────────────────────────────────

const globalEmotes           = new Map();  // code → data
const globalEmotesByProvider = new Map();  // provider → Array<{code,data}>
const channelEmotes          = new Map();
const channelEmotesByProvider = new Map();
const emotes                 = new Map();  // mapa unificado (trie source)

// ─── Tabela de primeiros caracteres ───────────────────────────────────────────
// ASCII em Uint8Array(128) → consulta O(1) sem hash. Unicode (raro) cai no Set.

const emoteFirstCharASCII    = new Uint8Array(128);
const emoteFirstCharNonASCII = new Set();
let   hasAnyFirstChars       = false;

// ─── Trie de códigos ──────────────────────────────────────────────────────────

let   emoteTrieRoot     = { children: new Map(), emote: null };
let   knownGlobalCodes  = new Set();
let   emoteVersion      = 0;
let   processedNodes    = new WeakMap();  // TextNode → version

const injectedImages        = new Set();
const channelInjectedImages = new Set();

// ─── Estado de poda ───────────────────────────────────────────────────────────

let   pruneScheduled  = false;
let   pruneCounter    = 0;
const pendingRemovals = [];

// ─── Ciclo de vida ────────────────────────────────────────────────────────────

let   currentChannel  = null;
let   currentUrl      = location.href;
let   chatObserver    = null;
let   observedChat    = null;
let   chatPollTimeout = null;
let   initToken       = 0;
let   initDebounceId  = null;

// ─── Port (SW bridge) ────────────────────────────────────────────────────────

let   activePort      = null;

// ─── Fila de parse ────────────────────────────────────────────────────────────

const parseQueue     = new Set();
let   parseScheduled = false;

// ─── Tooltip ──────────────────────────────────────────────────────────────────

let tooltipRafId        = 0;
let tooltipPreviewToken = 0;
let activeTooltipImg    = null;

// ─── Consulta rápida "isto pode conter emote?" ────────────────────────────────

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