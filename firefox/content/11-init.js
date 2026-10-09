'use strict';

// ─── Reset de state ───────────────────────────────────────────────────────────
//
// Limpa o estado de canal e reconstrói a trie preservando os globais
// (globais são estáveis entre canais, não mudam de canal pra canal).
// Isso torna a troca de canal O(#globais em cache) em vez de O(#rede+triagem).

function resetState() {
  try { restoreChannelEmotesToText(); }
  catch (e) { console.warn('[Cinemotes] restore falhou:', e); }

  channelEmotesByProvider.clear();
  channelEmotes.clear();

  // Reconstrói globalEmotes a partir do cache de providers (preservado).
  globalEmotes.clear();
  for (const arr of globalEmotesByProvider.values()) {
    for (const { code, data } of arr) addToMap(globalEmotes, code, data);
  }
  knownGlobalCodes = new Set(globalEmotes.keys());

  emoteTrieRoot = { children: new Map(), emote: null };
  clearFirstChars();
  emotes.clear();
  rebuildFromGlobalsOnly();

  processedNodes = new WeakMap();
  parseQueue.clear();
  pendingRemovals.length = 0;
  emoteVersion++;
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

  resetState();

  let globalsArrived  = false;
  let channelArrived  = !currentChannel;
  let observerStarted = false;

  const startObserverOnce = () => {
    if (observerStarted) return;
    if (!globalsArrived) return;
    if (!channelArrived) return;
    observerStarted = true;
    initChatObserver();
  };

  const onGlobals = (provider, globals) => {
    if (token !== initToken) return;
    const addedNew = applyGlobalsProviderInternal(provider, globals);
    if (addedNew) emoteVersion++;
  };

  const onGlobalsDone = () => {
    if (token !== initToken) return;
    globalsArrived = true;
    startObserverOnce();
  };

  const onChannel = (channel) => {
    if (token !== initToken) return;

    // Agrupa por provider para preservar prioridade no rebuild.
    const byProv = new Map();
    if (Array.isArray(channel)) {
      for (const { code, data } of channel) {
        const p = data.provider || 'unknown';
        if (!byProv.has(p)) byProv.set(p, []);
        byProv.get(p).push({ code, data });
      }
    }
    // Sobrescreve apenas entradas da SW; Cinefy (do main-world) fica intacto.
    for (const p of byProv.keys()) {
      channelEmotesByProvider.set(p, byProv.get(p));
    }
    rebuildChannelEmotes();
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
    globalsArrived = true;
    channelArrived = true;
    startObserverOnce();
  } catch (err) {
    if (token !== initToken) return;
    console.error('[Cinemotes] Falha ao inicializar:', err);
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

function checkUrlChange() {
  if (urlCheckScheduled) return;
  urlCheckScheduled = true;

  const run = () => {
    urlCheckScheduled = false;
    if (location.href === currentUrl) return;
    currentUrl = location.href;
    if (getChannelFromUrl() !== currentChannel) scheduleInit();
  };

  if (document.hidden) setTimeout(run, 0);
  else requestAnimationFrame(run);
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

// Fallback para navegacao SPA sem Navigation API.
if (!hasNavigationApi) {
  setInterval(checkUrlChange, URL_POLL_INTERVAL);
}

window.addEventListener('popstate',   checkUrlChange);
window.addEventListener('hashchange', checkUrlChange);

// ─── Bootstrap ────────────────────────────────────────────────────────────────

injectPreconnects();
init();