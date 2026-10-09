'use strict';

// ─── Prioridade e merge nos maps ──────────────────────────────────────────────
//
// Regra: canal > global (bônus de 100). Dentro do mesmo escopo, BTTV > FFZ >
// 7TV > Cinefy (definido em PROVIDER_PRIORITY no 00-core.js).

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

// Aplica um provider de globais com caminho incremental quando possível.
// Se o provider removeu algum código, rebuild total (precisa remover folhas
// da trie). Caso contrário, só insere o delta.
function applyGlobalsProviderInternal(provider, list) {
  if (!provider) return false;

  const prevList = globalEmotesByProvider.get(provider) || [];
  const nextList = Array.isArray(list) ? list : [];
  globalEmotesByProvider.set(provider, nextList);

  let removedFromProvider = false;
  if (prevList.length > 0) {
    const nextCodes = new Set();
    for (const e of nextList) nextCodes.add(e.code);
    for (const e of prevList) {
      if (!nextCodes.has(e.code)) { removedFromProvider = true; break; }
    }
  }

  if (removedFromProvider) {
    globalEmotes.clear();
    for (const arr of globalEmotesByProvider.values()) {
      for (const { code, data } of arr) addToMap(globalEmotes, code, data);
    }
    knownGlobalCodes = new Set(globalEmotes.keys());
    rebuildFromGlobalsOnly();
    insertChannelEmotes();
    return true;
  }

  for (const { code, data } of nextList) {
    addToMap(globalEmotes, code, data);
  }

  if (emotes.size === 0) {
    knownGlobalCodes = new Set(globalEmotes.keys());
    rebuildFromGlobalsOnly();
    insertChannelEmotes();
    return true;
  }

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

// ─── Providers de canal (BTTV/FFZ/7TV/Cinefy no mesmo canal) ──────────────────
//
// Cada provider tem sua própria lista de emotes do canal. Rebuild consolida
// tudo no `channelEmotes` respeitando prioridade, e depois insere na trie.

function applyChannelProviderInternal(provider, list) {
  if (!provider) return false;
  channelEmotesByProvider.set(provider, Array.isArray(list) ? list : []);
  return rebuildChannelEmotes();
}

function rebuildChannelEmotes() {
  channelEmotes.clear();
  for (const arr of channelEmotesByProvider.values()) {
    for (const { code, data } of arr) addToMap(channelEmotes, code, data);
  }
  insertChannelEmotes();
  return true;
}