'use strict';

// Roda no MAIN world (mundo da página) para poder ver os fetch/XHR que o
// próprio React do Cinefy faz. Não altera nenhuma resposta — só observa
// e retransmite para o content script (que roda no mundo isolado).

(() => {
  const CINEFY_API_HOST = 'api.cinefy.gg';
  const BUFFER_MS       = 5000;
  const BUFFER_INTERVAL = 250;

  const pending = [];

  function classifyUrl(url) {
    try {
      const parsed = new URL(url, location.href);
      if (parsed.hostname !== CINEFY_API_HOST) return null;

      if (/^\/v2\/emotes\/?$/.test(parsed.pathname)) {
        return { kind: 'global' };
      }
      const m = parsed.pathname.match(/^\/v2\/channels\/([^/]+)\/emotes\/?$/);
      if (m) {
        return {
          kind: 'channel',
          channel: decodeURIComponent(m[1]).toLowerCase()
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  function post(msg) {
    try { window.postMessage(msg, '*'); } catch {}
  }

  function enqueue(kind, channel, data) {
    const entry = {
      msg: {
        source: 'cinemotes-main-world',
        type: 'CINEFY_EMOTES',
        kind,
        channel: channel || null,
        data
      },
      firstSentAt: Date.now()
    };
    pending.push(entry);
    post(entry.msg);
  }

  setInterval(() => {
    const now = Date.now();
    for (let i = pending.length - 1; i >= 0; i--) {
      if (now - pending[i].firstSentAt > BUFFER_MS) {
        pending.splice(i, 1);
        continue;
      }
      post(pending[i].msg);
    }
  }, BUFFER_INTERVAL);

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.source !== 'cinemotes-content') return;
    if (msg.type !== 'CINEFY_EMOTES_ACK') return;
    for (let i = pending.length - 1; i >= 0; i--) {
      if (pending[i].msg.kind === msg.kind &&
          (pending[i].msg.channel || null) === (msg.channel || null)) {
        pending.splice(i, 1);
      }
    }
  });

  // ─── fetch ──────────────────────────────────────────────────────────────
  const origFetch = window.fetch;

  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input?.url || '';
    const resp = await origFetch.call(this, input, init);

    const cls = classifyUrl(url);
    if (!cls) return resp;
    if (!resp.ok) return resp;

    try {
      const json = await resp.clone().json();
      enqueue(cls.kind, cls.channel, json);
    } catch {}

    return resp;
  };

  // ─── XMLHttpRequest ─────────────────────────────────────────────────────
  // O Cinefy usa axios, que por padrão usa XHR no browser. Cobrimos os
  // dois para não depender da escolha deles.
  const XHR = XMLHttpRequest.prototype;
  const origOpen = XHR.open;
  const origSend = XHR.send;

  XHR.open = function (method, url, ...rest) {
    try { this.__cinemotesUrl = url; } catch {}
    return origOpen.call(this, method, url, ...rest);
  };

  XHR.send = function (...args) {
    try {
      const url = this.__cinemotesUrl;
      const cls = url ? classifyUrl(url) : null;
      if (cls) {
        this.addEventListener('load', function () {
          try {
            if (this.status < 200 || this.status >= 300) return;
            let json = null;
            if (this.responseType === 'json') json = this.response;
            else if (this.responseType === '' || this.responseType === 'text') {
              json = JSON.parse(this.responseText);
            }
            if (json) enqueue(cls.kind, cls.channel, json);
          } catch {}
        });
      }
    } catch {}
    return origSend.apply(this, args);
  };

  console.log('[Cinemotes/main-world] patches de fetch + XHR instalados');
})();