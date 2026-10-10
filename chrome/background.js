'use strict';

// ─── Constantes ───────────────────────────────────────────────────────────────

const FETCH_TIMEOUT       = 3500;
const GLOBAL_CACHE_TTL    = 60 * 60 * 1000;       // 1h
const ID_CACHE_TTL        = 24 * 60 * 60 * 1000;  // 24h
const CHANNEL_EMOTES_TTL          = 5 * 60 * 1000; // 5min
const CHANNEL_EMOTES_PARTIAL_TTL  = 30 * 1000;     // 30s quando algum provider falha
const GLOBAL_FAIL_TTL     = 30 * 1000;
const ID_FAIL_TTL         = 30 * 1000;

const ID_BACKUP_DELAY_MS  = 600;

const ID_CACHE_MAX        = 500;
const CHANNEL_CACHE_MAX   = 200;
const ID_FAIL_CACHE_MAX   = 500;
const PRUNE_TRIGGER_RATIO = 0.9;

const SESSION_PREFIX_ID   = 'id:';
const SESSION_PREFIX_CH   = 'ch:';                // legado — só para limpeza
const SESSION_CLEANUP_INTERVAL = 10 * 60 * 1000;  // 10min
const SESSION_WRITE_FLUSH_MS   = 150;             // batching de escritas

const CINEMOTES_API_URL = 'https://ragnardragus.github.io/cineemote-api/cinemotesCE.json';
const CINEMOTES_CACHE_TTL = 5 * 60 * 1000; // Refresh on the next catalog request after 5 minutes.

const GLOBAL_PROVIDERS      = ['bttv', 'ffz', '7tv', 'cinemotes'];
const GLOBAL_STORAGE_PREFIX = 'globalCache:';
const LEGACY_STORAGE_KEY    = 'globalCache';       // formato v1.1.0, limpamos

const PORT_NAME = 'cinemotes';

// ─── Estado ───────────────────────────────────────────────────────────────────

const memGlobalCache = new Map();   // provider → { ts, staging, sig }
const globalInflight = new Map();   // provider → Promise
const globalFailTs   = new Map();   // provider → ts

const idCache = new Map();            // channelName → { id, ts }
const idFailCache = new Map();        // channelName → { ts } (negative cache)
const idInflight = new Map();         // channelName → Promise<string|null>

const channelEmoteCache = new Map();  // channelId  → { ts, staging, partial }
const channelInflight = new Map();    // channelId  → Promise

// ─── Session storage (sobrevive à morte do SW MV3) ───────────────────────────

const hasSession = !!(chrome.storage && chrome.storage.session);

let lastSessionCleanup = 0;

// Escritas em storage.session são agrupadas numa janela curta.
const pendingSessionWrites = new Map();
let   sessionFlushTimer    = 0;

function flushSessionWrites() {
  sessionFlushTimer = 0;
  if (pendingSessionWrites.size === 0) return;
  const payload = {};
  for (const [k, v] of pendingSessionWrites) payload[k] = v;
  pendingSessionWrites.clear();
  try {
    const p = chrome.storage.session.set(payload);
    if (p && typeof p.catch === 'function') {
      p.catch(e => console.debug('[Cinemotes/SW] session write falhou:', e?.message || e));
    }
  } catch (e) {
    console.debug('[Cinemotes/SW] session write sync falhou:', e?.message || e);
  }
}

async function readSessionId(key) {
  if (!hasSession) return null;
  try {
    const sessionKey = SESSION_PREFIX_ID + key;
    const stored = await chrome.storage.session.get(sessionKey);
    const entry = stored?.[sessionKey];
    if (entry &&
        typeof entry.ts === 'number' &&
        typeof entry.id === 'string') {
      return entry;
    }
  } catch (e) {
    console.debug('[Cinemotes/SW] session read falhou:', e?.message || e);
  }
  return null;
}

function persistSession(key, entry) {
  if (!hasSession) return;
  pendingSessionWrites.set(key, entry);
  if (sessionFlushTimer) return;
  sessionFlushTimer = setTimeout(flushSessionWrites, SESSION_WRITE_FLUSH_MS);
}

function maybeCleanSession() {
  if (!hasSession) return;
  const now = Date.now();
  if (now - lastSessionCleanup < SESSION_CLEANUP_INTERVAL) return;
  lastSessionCleanup = now;
  (async () => {
    try {
      const all = await chrome.storage.session.get(null);
      const toRemove = [];
      for (const [k, v] of Object.entries(all || {})) {
        if (!v || typeof v.ts !== 'number') { toRemove.push(k); continue; }
        if (k.startsWith(SESSION_PREFIX_ID)) {
          if (now - v.ts > ID_CACHE_TTL) toRemove.push(k);
        } else if (k.startsWith(SESSION_PREFIX_CH)) {
          toRemove.push(k);
        }
      }
      if (toRemove.length) await chrome.storage.session.remove(toRemove);
    } catch (e) {
      console.debug('[Cinemotes/SW] session cleanup falhou:', e?.message || e);
    }
  })();
}

// ─── Utilitários ──────────────────────────────────────────────────────────────

const normalizeUrl = url =>
  !url ? '' : url.startsWith('//') ? `https:${url}` : url;

async function fetchWithTimeout(url, { signal, timeout = FETCH_TIMEOUT, cache = 'default' } = {}) {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    return await fetch(url, { signal: ctrl.signal, credentials: 'omit', cache });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

function pruneMap(map, ttl, maxSize) {
  const now = Date.now();
  for (const [key, entry] of map) {
    const ts = entry?.ts;
    if (typeof ts !== 'number' || now - ts > ttl) map.delete(key);
  }
  if (map.size > maxSize) {
    const excess = map.size - maxSize;
    let i = 0;
    for (const key of map.keys()) {
      if (i++ >= excess) break;
      map.delete(key);
    }
  }
}

function maybePruneMap(map, ttl, maxSize) {
  if (map.size <= maxSize * PRUNE_TRIGGER_RATIO) return;
  pruneMap(map, ttl, maxSize);
}

function touchLru(map, key) {
  if (!map.has(key)) return;
  const v = map.get(key);
  map.delete(key);
  map.set(key, v);
}

function stagingSignature(staging) {
  if (!Array.isArray(staging) || staging.length === 0) return '0';
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < staging.length; i++) {
    const e = staging[i];
    const s = (e?.code || '') + '\x00' + (e?.data?.url || '');
    for (let k = 0; k < s.length; k++) {
      h ^= s.charCodeAt(k);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x1f;
    h = Math.imul(h, 0x01000193);
  }
  return `${staging.length}:${(h >>> 0).toString(36)}`;
}

// ─── Resolução de ID: primário + backup com atraso ────────────────────────────

async function fetchTwitchIdSequenced(username, outerSignal) {
  const user = encodeURIComponent(username);
  const ctrl = new AbortController();
  const onOuterAbort = () => ctrl.abort();
  if (outerSignal) {
    if (outerSignal.aborted) ctrl.abort();
    else outerSignal.addEventListener('abort', onOuterAbort, { once: true });
  }

  return new Promise(resolve => {
    let settled = false;
    let backupStarted = false;
    let primaryDone = false;
    let backupDone = false;
    let backupTimer = null;
    let primaryId = null;
    let backupId = null;

    const cleanup = () => {
      if (backupTimer) clearTimeout(backupTimer);
      try { outerSignal?.removeEventListener('abort', onOuterAbort); } catch {}
    };

    const settle = (id) => {
      if (settled) return;
      settled = true;
      try { ctrl.abort(); } catch {}
      cleanup();
      resolve(id);
    };

    const maybeSettle = () => {
      if (primaryId) return settle(primaryId);
      if (backupId)  return settle(backupId);
      if (primaryDone && backupDone) return settle(null);
      if (primaryDone && !backupStarted) startBackup();
    };

    const tryDecapi = async () => {
      const r = await fetchWithTimeout(
        `https://decapi.me/twitch/id/${user}`,
        { signal: ctrl.signal }
      );
      if (!r.ok) throw new Error('decapi http');
      const id = (await r.text()).trim();
      if (!/^\d+$/.test(id)) throw new Error('decapi: id inválido');
      return id;
    };

    const tryIvr = async () => {
      const r = await fetchWithTimeout(
        `https://api.ivr.fi/v2/twitch/user?login=${user}`,
        { signal: ctrl.signal }
      );
      if (!r.ok) throw new Error('ivr http');
      const id = (await r.json())?.[0]?.id;
      if (!id) throw new Error('ivr: id ausente');
      return id;
    };

    const startBackup = () => {
      if (backupStarted || settled) return;
      backupStarted = true;
      if (backupTimer) { clearTimeout(backupTimer); backupTimer = null; }
      tryIvr().then(
        id => { backupId = id; backupDone = true; maybeSettle(); },
        () => { backupDone = true; maybeSettle(); }
      );
    };

    if (outerSignal?.aborted) { settle(null); return; }

    tryDecapi().then(
      id => { primaryId = id; primaryDone = true; maybeSettle(); },
      () => { primaryDone = true; maybeSettle(); }
    );

    backupTimer = setTimeout(startBackup, ID_BACKUP_DELAY_MS);
  });
}

async function getTwitchId(username, signal) {
  if (!username) return null;

  const key = username.toLowerCase();
  const now = Date.now();

  const cached = idCache.get(key);
  if (cached) {
    if (now - cached.ts < ID_CACHE_TTL) {
      touchLru(idCache, key);
      return cached.id;
    }
    idCache.delete(key);
  }

  const sessionEntry = await readSessionId(key);
  if (sessionEntry) {
    if (now - sessionEntry.ts < ID_CACHE_TTL) {
      idCache.set(key, sessionEntry);
      idFailCache.delete(key);
      touchLru(idCache, key);
      return sessionEntry.id;
    }
    if (hasSession) {
      try {
        const p = chrome.storage.session.remove(SESSION_PREFIX_ID + key);
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch {}
    }
  }

  const failEntry = idFailCache.get(key);
  if (failEntry) {
    if (now - failEntry.ts < ID_FAIL_TTL) return null;
    idFailCache.delete(key);
  }

  const inflight = idInflight.get(key);
  if (inflight) return inflight;

  const promise = (async () => {
    const id = await fetchTwitchIdSequenced(username, signal);
    if (id) {
      const entry = { id, ts: Date.now() };
      idCache.set(key, entry);
      idFailCache.delete(key);
      persistSession(SESSION_PREFIX_ID + key, entry);
      maybePruneMap(idCache, ID_CACHE_TTL, ID_CACHE_MAX);
      maybeCleanSession();
    } else {
      idFailCache.set(key, { ts: Date.now() });
      maybePruneMap(idFailCache, ID_FAIL_TTL, ID_FAIL_CACHE_MAX);
    }
    return id;
  })();

  idInflight.set(key, promise);
  try {
    return await promise;
  } finally {
    idInflight.delete(key);
  }
}

// ─── Construtores de staging ──────────────────────────────────────────────────

function buildBTTV(list, scope, channelName) {
  const out = [];
  if (!Array.isArray(list)) return out;
  for (const e of list) {
    if (!e?.code || !e?.id) continue;
    out.push({
      code: e.code,
      data: {
        url:        `https://cdn.betterttv.net/emote/${e.id}/1x.webp`,
        previewUrl: `https://cdn.betterttv.net/emote/${e.id}/3x.webp`,
        provider:   'BTTV',
        scope,
        author:     e.user?.displayName || e.user?.name ||
                    (scope === 'Canal' ? channelName : 'BetterTTV')
      }
    });
  }
  return out;
}

function buildFFZ(sets, scope, channelName) {
  const out = [];
  if (!sets) return out;
  for (const set of Object.values(sets)) {
    for (const e of set.emoticons || []) {
      const url = e.urls?.['1'] || e.urls?.['2'] || e.urls?.['4'] ||
                  (e.urls && Object.values(e.urls)[0]);
      if (!url) continue;
      out.push({
        code: e.name,
        data: {
          url:        normalizeUrl(url),
          previewUrl: normalizeUrl(e.urls?.['4'] || e.urls?.[2] || url),
          provider:   'FFZ',
          scope,
          author:     e.owner?.display_name || e.owner?.name ||
                      (scope === 'Canal' ? channelName : 'FrankerFaceZ')
        }
      });
    }
  }
  return out;
}

function build7TV(list, scope, channelName) {
  const out = [];
  if (!Array.isArray(list)) return out;
  for (const e of list) {
    const base = normalizeUrl(e.data?.host?.url);
    if (!base || !e.name) continue;
    out.push({
      code: e.name,
      data: {
        url:        `${base}/1x.webp`,
        previewUrl: `${base}/3x.webp`,
        provider:   '7TV',
        scope,
        author:     e.data?.owner?.display_name || e.data?.owner?.username ||
                    (scope === 'Canal' ? channelName : '7TV')
      }
    });
  }
  return out;
}

// ─── Globais ─────────────────────────────────────────────────────────────────

// Retorna { staging, sig } — a assinatura é computada na mesma passada,
// evitando uma segunda varredura O(N) em cada refresh.
// Remote catalog keeps the same fields as the original CSV.
function buildCinemotes(list) {
  if (!Array.isArray(list)) throw new Error('Cinemotes API: expected an array');
  const out = [], seen = new Set();
  for (const emote of list) {
    const code = typeof emote?.emote_name === 'string' ? emote.emote_name.trim() : '';
    if (!/^[a-zA-Z0-9_]{1,32}$/.test(code) || seen.has(code)) continue;
    try {
      if (typeof emote.url !== 'string') continue;
      const url = new URL(emote.url.trim());
      if (url.protocol !== 'https:' || url.username || url.password) continue;
      seen.add(code);
      out.push({ code, data: {
        url: url.href, previewUrl: url.href, provider: 'Cinemotes', scope: 'Global',
        author: typeof emote.author === 'string' ? emote.author.trim() : '',
        channel: typeof emote.channel === 'string' && emote.channel.trim() ? emote.channel.trim() : 'GlobalCE'
      } });
    } catch {}
  }
  if (list.length && !out.length) throw new Error('Cinemotes API: no valid emotes');
  return out;
}

async function buildProviderGlobal(provider) {
  let staging = [];

  if (provider === 'cinemotes') {
    const r = await fetchWithTimeout(CINEMOTES_API_URL, { cache: 'no-cache' });
    if (!r.ok) throw new Error('Cinemotes API: HTTP ' + r.status);
    staging = buildCinemotes(await r.json());
  } else if (provider === 'bttv') {
    try {
      const r = await fetchWithTimeout('https://api.betterttv.net/3/cached/emotes/global');
      if (r.ok) staging = buildBTTV(await r.json(), 'Global', null);
    } catch (e) {
      console.debug('[Cinemotes/SW] BTTV global falhou:', e?.message || e);
    }
  } else if (provider === 'ffz') {
    try {
      const r = await fetchWithTimeout('https://api.frankerfacez.com/v1/set/global');
      if (r.ok) staging = buildFFZ((await r.json()).sets, 'Global', null);
    } catch (e) {
      console.debug('[Cinemotes/SW] FFZ global falhou:', e?.message || e);
    }
  } else if (provider === '7tv') {
    try {
      const r = await fetchWithTimeout('https://7tv.io/v3/emote-sets/global');
      if (r.ok) staging = build7TV((await r.json()).emotes, 'Global', null);
    } catch (e) {
      console.debug('[Cinemotes/SW] 7TV global falhou:', e?.message || e);
    }
  }

  return { staging, sig: stagingSignature(staging) };
}

// Keep the last valid response, including an intentionally empty catalog.
async function fetchCinemotesGlobal() {
  const provider = 'cinemotes';
  const existing = globalInflight.get(provider);
  if (existing) return existing;
  const promise = (async () => {
    let cached = memGlobalCache.get(provider);
    if (!cached) {
      try {
        const key = GLOBAL_STORAGE_PREFIX + provider;
        const stored = await chrome.storage.local.get(key);
        const entry = stored?.[key];
        if (entry && typeof entry.ts === 'number' && Array.isArray(entry.staging)) cached = entry;
      } catch (error) {
        console.debug('[Cinemotes] catalog cache read failed:', error.message);
      }
    }
    if (cached) memGlobalCache.set(provider, cached);
    const now = Date.now();
    if (cached && now - cached.ts < CINEMOTES_CACHE_TTL) return cached.staging;
    const failedAt = globalFailTs.get(provider);
    if (failedAt && now - failedAt < GLOBAL_FAIL_TTL) return cached?.staging || [];
    try {
      const { staging, sig } = await buildProviderGlobal(provider);
      const entry = { ts: Date.now(), staging, sig };
      memGlobalCache.set(provider, entry);
      globalFailTs.delete(provider);
      try {
        await chrome.storage.local.set({ [GLOBAL_STORAGE_PREFIX + provider]: entry });
      } catch (error) {
        console.warn('[Cinemotes] catalog cache write failed:', error.message);
      }
      return staging;
    } catch (error) {
      globalFailTs.set(provider, Date.now());
      console.warn('[Cinemotes] remote catalog unavailable; using last valid catalog:', error.message);
      return cached?.staging || [];
    }
  })();
  globalInflight.set(provider, promise);
  try { return await promise; }
  finally { globalInflight.delete(provider); }
}

async function fetchProviderGlobal(provider) {
  if (provider === 'cinemotes') return fetchCinemotesGlobal();
  const now = Date.now();

  const cached = memGlobalCache.get(provider);
  if (cached) {
    if (now - cached.ts < GLOBAL_CACHE_TTL) return cached.staging;
    memGlobalCache.delete(provider);
  }

  const failTs = globalFailTs.get(provider) || 0;
  if (failTs) {
    if (now - failTs < GLOBAL_FAIL_TTL) return [];
    globalFailTs.delete(provider);
  }

  const existing = globalInflight.get(provider);
  if (existing) return existing;

  const promise = (async () => {
    let storedEntry = null;
    try {
      const key = GLOBAL_STORAGE_PREFIX + provider;
      const stored = await chrome.storage.local.get(key);
      const entry = stored?.[key];
      if (entry &&
          Date.now() - entry.ts < GLOBAL_CACHE_TTL &&
          Array.isArray(entry.staging) &&
          entry.staging.length > 0) {
        memGlobalCache.set(provider, entry);
        return entry.staging;
      }
      storedEntry = entry || null;
    } catch (e) {
      console.debug('[Cinemotes/SW] storage read falhou:', e?.message || e);
    }

    const { staging, sig } = await buildProviderGlobal(provider);
    const ts = Date.now();

    if (staging.length > 0) {
      const entry = { ts, staging, sig };
      memGlobalCache.set(provider, entry);
      globalFailTs.delete(provider);

      const storedExpired = !storedEntry ||
        typeof storedEntry.ts !== 'number' ||
        (Date.now() - storedEntry.ts) >= GLOBAL_CACHE_TTL;
      const storedSigChanged = !storedEntry || storedEntry.sig !== sig;
      const needsWrite = storedExpired || storedSigChanged;

      if (needsWrite) {
        try {
          await chrome.storage.local.set({ [GLOBAL_STORAGE_PREFIX + provider]: entry });
        } catch (e) {
          console.debug('[Cinemotes/SW] storage write falhou:', e?.message || e);
        }
      }
    } else {
      globalFailTs.set(provider, Date.now());
    }
    return staging;
  })().catch(e => {
    console.debug('[Cinemotes/SW] fetchProviderGlobal rejeitou:', e?.message || e);
    return [];
  });

  globalInflight.set(provider, promise);
  try {
    return await promise;
  } finally {
    globalInflight.delete(provider);
  }
}

// ─── Emotes do canal ─────────────────────────────────────────────────────────

async function fetchChannelStaging(channelId, channelName) {
  if (!channelId) return [];

  const cached = channelEmoteCache.get(channelId);
  if (cached) {
    const ttl = cached.partial ? CHANNEL_EMOTES_PARTIAL_TTL : CHANNEL_EMOTES_TTL;
    if (Date.now() - cached.ts < ttl) {
      touchLru(channelEmoteCache, channelId);
      return cached.staging;
    }
    channelEmoteCache.delete(channelId);
  }

  const inflight = channelInflight.get(channelId);
  if (inflight) return inflight;

  const promise = (async () => {
    const staging = [];
    let successCount = 0;

    const [bttvList, ffzList, sevenList] = await Promise.all([
      (async () => {
        try {
          const r = await fetchWithTimeout(`https://api.betterttv.net/3/cached/users/twitch/${channelId}`);
          if (!r.ok) return null;
          const data = await r.json();
          const out = [];
          for (const e of buildBTTV(data.channelEmotes, 'Canal', channelName)) out.push(e);
          for (const e of buildBTTV(data.sharedEmotes,  'Canal', channelName)) out.push(e);
          return out;
        } catch (e) {
          console.debug('[Cinemotes/SW] BTTV canal falhou:', e?.message || e);
          return null;
        }
      })(),
      (async () => {
        try {
          const r = await fetchWithTimeout(`https://api.frankerfacez.com/v1/room/id/${channelId}`);
          if (!r.ok) return null;
          return buildFFZ((await r.json()).sets, 'Canal', channelName);
        } catch (e) {
          console.debug('[Cinemotes/SW] FFZ canal falhou:', e?.message || e);
          return null;
        }
      })(),
      (async () => {
        try {
          const r = await fetchWithTimeout(`https://7tv.io/v3/users/twitch/${channelId}`);
          if (!r.ok) return null;
          return build7TV((await r.json()).emote_set?.emotes, 'Canal', channelName);
        } catch (e) {
          console.debug('[Cinemotes/SW] 7TV canal falhou:', e?.message || e);
          return null;
        }
      })()
    ]);

    if (bttvList)  { successCount++; for (const e of bttvList)  staging.push(e); }
    if (ffzList)   { successCount++; for (const e of ffzList)   staging.push(e); }
    if (sevenList) { successCount++; for (const e of sevenList) staging.push(e); }

    const partial = successCount < 3;
    const entry = { ts: Date.now(), staging, partial };
    channelEmoteCache.set(channelId, entry);
    maybePruneMap(channelEmoteCache, CHANNEL_EMOTES_TTL, CHANNEL_CACHE_MAX);
    return staging;
  })();

  channelInflight.set(channelId, promise);
  try {
    return await promise;
  } finally {
    channelInflight.delete(channelId);
  }
}

// ─── Port: streaming globais + canal ─────────────────────────────────────────

function handleEmotesPort(port) {
  let aborted = false;
  let currentToken = 0;

  port.onDisconnect.addListener(() => { aborted = true; });

  port.onMessage.addListener(msg => {
    if (msg?.type === 'PING') {
      try { port.postMessage({ type: 'PONG' }); } catch {}
      return;
    }
    if (msg?.type !== 'FETCH_EMOTES') return;

    const token = ++currentToken;
    const channelName = msg.channel;

    const safePost = (payload) => {
      if (aborted || token !== currentToken) return;
      try { port.postMessage(payload); } catch {}
    };

    const globalsPromises = GLOBAL_PROVIDERS.map(provider =>
      fetchProviderGlobal(provider).then(list => {
        safePost({ type: 'GLOBALS', provider, globals: list });
      })
    );

    Promise.allSettled(globalsPromises).then(() => {
      safePost({ type: 'GLOBALS_DONE' });
    });

    if (!channelName) {
      safePost({ type: 'CHANNEL', channel: [] });
      return;
    }

    (async () => {
      const id = await getTwitchId(channelName);
      if (!id) return [];
      return fetchChannelStaging(id, channelName);
    })()
      .then(channel => safePost({ type: 'CHANNEL', channel }))
      .catch(err => {
        console.debug('[Cinemotes/SW] canal falhou:', err?.message || err);
        safePost({ type: 'CHANNEL', channel: [] });
      });
  });
}

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== PORT_NAME) return;
  handleEmotesPort(port);
});

// ─── Invalidação cross-contexto ──────────────────────────────────────────────

if (chrome.storage?.onChanged?.addListener) {
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      for (const [key, change] of Object.entries(changes)) {
        if (!key.startsWith(GLOBAL_STORAGE_PREFIX)) continue;
        const provider = key.slice(GLOBAL_STORAGE_PREFIX.length);
        if (!GLOBAL_PROVIDERS.includes(provider)) continue;

        const nv = change?.newValue;
        if (!nv || typeof nv.ts !== 'number' || !Array.isArray(nv.staging)) continue;

        const cur = memGlobalCache.get(provider);
        if (!cur || nv.ts > cur.ts) {
          memGlobalCache.set(provider, nv);
          globalFailTs.delete(provider);
        }
      }
    });
  } catch (e) {
    console.debug('[Cinemotes/SW] storage.onChanged indisponível:', e?.message || e);
  }
}

if (hasSession && chrome.storage.session?.onChanged?.addListener) {
  try {
    chrome.storage.session.onChanged.addListener((changes) => {
      for (const [key, change] of Object.entries(changes || {})) {
        if (!key.startsWith(SESSION_PREFIX_ID)) continue;
        const channelKey = key.slice(SESSION_PREFIX_ID.length);
        const nv = change?.newValue;
        if (!nv || typeof nv.ts !== 'number' || typeof nv.id !== 'string') continue;

        const existing = idCache.get(channelKey);
        if (!existing || nv.ts > existing.ts) {
          idCache.set(channelKey, nv);
          idFailCache.delete(channelKey);
          maybePruneMap(idCache, ID_CACHE_TTL, ID_CACHE_MAX);
        }
      }
    });
  } catch (e) {
    console.debug('[Cinemotes/SW] session.onChanged indisponível:', e?.message || e);
  }
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

try {
  chrome.storage.local.remove(LEGACY_STORAGE_KEY, () => { void chrome.runtime.lastError; });
} catch {}