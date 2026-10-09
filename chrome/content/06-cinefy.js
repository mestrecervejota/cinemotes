'use strict';

// ─── Bridge do Cinefy (MAIN world → content script) ───────────────────────────
//
// Recebe via window.postMessage os emotes que o main-world.js interceptou
// dos fetch que o próprio React do Cinefy faz. Converte para o formato
// interno e aplica no state com a máquina já existente.
//
// Formato de chegada: { data: [{ id, code, name, animated, status }, ...] }
// Formato interno:    { code, data: { url, previewUrl, provider, scope, author } }

const CINEFY_CDN_BASE = 'https://cdn.cinefy.gg/emotes';

function convertCinefyEmote(raw, scope) {
  if (!raw?.id || !raw?.code) return null;
  return {
    code: raw.code,
    data: {
      url:        `${CINEFY_CDN_BASE}/${raw.id}/original?width=60`,
      previewUrl: `${CINEFY_CDN_BASE}/${raw.id}/original?width=180`,
      provider:   'Cinefy',
      scope,
      author:     'Cinefy'
    }
  };
}

function buildCinefyList(arr, scope) {
  const out = [];
  if (!Array.isArray(arr)) return out;
  for (const raw of arr) {
    const e = convertCinefyEmote(raw, scope);
    if (e) out.push(e);
  }
  return out;
}

// Globais: entram como um provider global comum (mesma máquina dos
// outros providers). Prioridade 0 (menor) já está em PROVIDER_PRIORITY.
function applyCinefyGlobals(payload) {
  const arr = Array.isArray(payload?.data) ? payload.data : [];
  if (!arr.length) return;
  const list = buildCinefyList(arr, 'Global');
  const addedNew = applyGlobalsProviderInternal('Cinefy', list);
  if (addedNew) emoteVersion++;
  console.log('[Cinemotes] globais do Cinefy:', list.length);
}

// Canal: entram via um "provider de canal" próprio, mesclado com os
// providers da SW no rebuild. Ignora respostas de canais antigos.
function applyCinefyChannel(channel, payload) {
  if (!channel) return;
  if (!currentChannel || channel !== currentChannel) return;
  const arr = Array.isArray(payload?.data) ? payload.data : [];
  const list = buildCinefyList(arr, 'Canal');
  applyChannelProviderInternal('Cinefy', list);
  emoteVersion++;
  console.log('[Cinemotes] emotes do Cinefy no canal:', list.length);
}

// Confirmação de recebimento — o main-world usa isso para parar de
// reenviar a mensagem do buffer.
function ack(kind, channel) {
  try {
    window.postMessage({
      source: 'cinemotes-content',
      type: 'CINEFY_EMOTES_ACK',
      kind,
      channel: channel || null
    }, '*');
  } catch {}
}

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const msg = event.data;
  if (!msg || msg.source !== 'cinemotes-main-world') return;
  if (msg.type !== 'CINEFY_EMOTES') return;

  try {
    if (msg.kind === 'global') {
      applyCinefyGlobals(msg.data);
      ack('global', null);
    } else if (msg.kind === 'channel') {
      applyCinefyChannel(msg.channel, msg.data);
      ack('channel', msg.channel);
    }
  } catch (e) {
    console.warn('[Cinemotes] falha ao aplicar emote do Cinefy:', e);
  }
});