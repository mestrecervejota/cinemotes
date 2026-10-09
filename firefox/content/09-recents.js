'use strict';

// ─── Recentes ─────────────────────────────────────────────────────────────────
//
// Guarda os N últimos emotes usados (via autocomplete ou via menu).
// Persiste em chrome.storage.local. Cache em memória + write debounced.

const RECENTS_KEY       = 'cinemotes:recents';
const RECENTS_LIMIT     = 40;
const RECENTS_WRITE_MS  = 500;

let recentsList       = [];
let recentsWriteTimer = 0;
let recentsLoaded     = false;

function recentsLoad() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(RECENTS_KEY, (data) => {
        const arr = data?.[RECENTS_KEY];
        recentsList = Array.isArray(arr)
          ? arr.filter(c => typeof c === 'string')
          : [];
        recentsLoaded = true;
        // mantém a cache do menu em sincronia
        menuRecentCache = recentsList.slice();
        resolve();
      });
    } catch (e) {
      console.debug('[Cinemotes] recents load falhou:', e?.message);
      resolve();
    }
  });
}

function recentsPersist() {
  try {
    chrome.storage.local.set({ [RECENTS_KEY]: recentsList });
  } catch (e) {
    console.debug('[Cinemotes] recents write falhou:', e?.message);
  }
}

function recentsSchedulePersist() {
  clearTimeout(recentsWriteTimer);
  recentsWriteTimer = setTimeout(recentsPersist, RECENTS_WRITE_MS);
}

// Chamada sempre que um emote é inserido no chat (via menu ou autocomplete).
function recentsPush(code) {
  if (!code) return;
  const i = recentsList.indexOf(code);
  if (i >= 0) recentsList.splice(i, 1);
  recentsList.unshift(code);
  if (recentsList.length > RECENTS_LIMIT) {
    recentsList.length = RECENTS_LIMIT;
  }
  menuRecentCache = recentsList.slice();
  recentsSchedulePersist();

  // Se o menu estiver aberto na tab "Recentes", atualiza na hora
  if (menuOpen && menuActiveTab === 'recent') {
    menuRenderResults();
  }
}

recentsLoad();