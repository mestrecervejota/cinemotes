'use strict';

// ─── Constantes ───────────────────────────────────────────────────────────────

const CHAT_SELECTOR    = 'div[data-testid="virtuoso-item-list"]';
const MESSAGE_SELECTOR = 'div[data-item-index]';

const RESERVED_CHANNELS = new Set([
  'settings', 'explore', 'login', 'register',
  'admin', 'messages', 'notifications', 'home',
  'following', 'subscriptions', 'embed', 'user'
]);

const PROVIDER_PRIORITY = { 'BTTV': 3, 'FFZ': 2, '7TV': 1, 'Cinefy': 0 };

const CHAT_POLL_INTERVAL     = 800;
const URL_POLL_INTERVAL      = 5000;
const PARSER_BUDGET_MS       = 6;
const INIT_DEBOUNCE_MS       = 150;
const SW_MESSAGE_TIMEOUT     = 12000;
const MAX_EMOTE_CODE_LEN     = 32;
const TOOLTIP_WIDTH          = 180;

const SW_MAX_ATTEMPTS        = 2;
const SW_RETRY_BACKOFF_MS    = 300;

const CHANNEL_NAME_RE = /^[a-z0-9_]{1,25}$/;

const SKIP_SELECTOR = 'script,style,a,code,pre,.bttv-emote';

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

// dns-prefetch é mais barato que preconnect e suficiente para APIs
// que serão chamadas em breve (troca de canal, resolução de ID).
const API_DNS_PREFETCHES = [
  'https://api.betterttv.net',
  'https://api.frankerfacez.com',
  'https://7tv.io',
  'https://decapi.me',
  'https://api.ivr.fi',
  'https://api.cinefy.gg'
];

// ─── Classificação de caracteres (tabela pré-computada) ──────────────────────

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

// ─── Utilitários de URL / página ──────────────────────────────────────────────

function normalizeUrl(url) {
  if (!url) return '';
  return url.startsWith('//') ? `https:${url}` : url;
}

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
  for (const host of API_DNS_PREFETCHES) {
    if (document.querySelector(`link[rel="dns-prefetch"][href="${host}"]`)) continue;
    const l = document.createElement('link');
    l.rel = 'dns-prefetch';
    l.href = host;
    document.head.appendChild(l);
  }
}