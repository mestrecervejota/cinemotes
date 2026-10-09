'use strict';

// ─── Port: comunicação com o service worker ───────────────────────────────────
//
// Protocolo:
//   client → SW: { type: 'FETCH_EMOTES', channel }
//   SW → client: { type: 'GLOBALS', provider, globals }
//   SW → client: { type: 'GLOBALS_DONE' }
//   SW → client: { type: 'CHANNEL', channel }

class PortError extends Error {
  constructor(message, { retryable = false } = {}) {
    super(message);
    this.retryable = retryable;
  }
}

function fetchEmotesOnce(channel, onUpdate) {
  if (activePort) {
    try { activePort.disconnect(); } catch {}
    activePort = null;
  }

  return new Promise((resolve, reject) => {
    let port;
    try {
      port = chrome.runtime.connect({ name: 'cinemotes' });
    } catch (e) {
      reject(new PortError(e?.message || 'connect failed'));
      return;
    }
    activePort = port;

    let settled = false;
    let gotChannel = false;
    let globalsDone = false;
    const result = { globals: [], channel: [] };
    const globalByProvider = new Map();

    const release = () => {
      if (activePort === port) activePort = null;
      try { port.disconnect(); } catch {}
    };

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      release();
      resolve(result);
    };

    const fail = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      release();
      reject(err);
    };

    const checkFinish = () => {
      if (globalsDone && gotChannel) finish();
    };

    const timer = setTimeout(
      () => fail(new PortError('background timeout', { retryable: false })),
      SW_MESSAGE_TIMEOUT
    );

    port.onMessage.addListener(msg => {
      if (settled) return;
      if (msg?.type === 'GLOBALS') {
        const prov = msg.provider || 'unknown';
        const list = Array.isArray(msg.globals) ? msg.globals : [];
        globalByProvider.set(prov, list);
        try { onUpdate?.({ type: 'GLOBALS', provider: prov, globals: list }); } catch {}
      } else if (msg?.type === 'GLOBALS_DONE') {
        globalsDone = true;
        result.globals = [];
        for (const list of globalByProvider.values()) {
          for (const e of list) result.globals.push(e);
        }
        try { onUpdate?.({ type: 'GLOBALS_DONE' }); } catch {}
        checkFinish();
      } else if (msg?.type === 'CHANNEL') {
        result.channel = Array.isArray(msg.channel) ? msg.channel : [];
        gotChannel = true;
        try { onUpdate?.({ type: 'CHANNEL', channel: result.channel }); } catch {}
        checkFinish();
      } else if (msg?.type === 'ERROR') {
        fail(new PortError(msg.error || 'background error', { retryable: false }));
        return;
      }
    });

    port.onDisconnect.addListener(() => {
      if (settled) return;
      if (gotChannel || globalsDone || globalByProvider.size > 0) {
        finish();
      } else {
        const err = chrome.runtime.lastError;
        fail(new PortError(err?.message || 'port disconnected', { retryable: true }));
      }
    });

    try {
      port.postMessage({ type: 'FETCH_EMOTES', channel });
    } catch (e) {
      fail(new PortError(e?.message || 'postMessage failed', { retryable: true }));
    }
  });
}

async function fetchEmotesStreaming(channel, onUpdate) {
  let lastErr = null;
  for (let attempt = 0; attempt < SW_MAX_ATTEMPTS; attempt++) {
    try {
      return await fetchEmotesOnce(channel, onUpdate);
    } catch (e) {
      lastErr = e;
      if (!(e instanceof PortError) || !e.retryable) throw e;
      if (attempt + 1 >= SW_MAX_ATTEMPTS) break;
      await new Promise(r => setTimeout(r, SW_RETRY_BACKOFF_MS));
    }
  }
  throw lastErr || new PortError('background unavailable');
}