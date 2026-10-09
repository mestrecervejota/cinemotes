'use strict';

// ─── Varredura inicial do chat ────────────────────────────────────────────────

function scheduleParseInitial(chat) {
  chat.querySelectorAll(MESSAGE_SELECTOR).forEach(m => {
    if (!m.isConnected) return;
    const t = m.textContent;
    if (!t || !textMayContainEmote(t)) return;
    scheduleParse(m);
  });
}

// ─── Warmup debounced ─────────────────────────────────────────────────────────
//
// Agrupa várias mutações num único warmup, executado em idle time para não
// competir com o parse. Pré-aquece as previews dos emotes visíveis no chat.

let warmupScheduled = false;

function scheduleWarmup() {
  if (warmupScheduled) return;
  warmupScheduled = true;
  const run = () => {
    warmupScheduled = false;
    try { warmupVisibleEmotes(); } catch {}
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(run, { timeout: 2000 });
  } else {
    setTimeout(run, 500);
  }
}

// ─── Observador do chat ───────────────────────────────────────────────────────

function initChatObserver() {
  clearTimeout(chatPollTimeout);
  chatPollTimeout = null;

  const chat = document.querySelector(CHAT_SELECTOR);
  if (!chat) {
    chatPollTimeout = setTimeout(initChatObserver, CHAT_POLL_INTERVAL);
    return;
  }

  if (observedChat === chat && chatObserver) {
    scheduleParseInitial(chat);
    return;
  }

  chatObserver?.disconnect();
  observedChat = chat;
  scheduleParseInitial(chat);

  chatObserver = new MutationObserver(mutations => {
    for (const m of mutations) {
      if (m.type === 'characterData') {
        const target = m.target;
        if (!target || target.nodeType !== Node.TEXT_NODE) continue;
        if (m.oldValue === target.nodeValue) continue;

        processedNodes.delete(target);

        const parent = target.parentElement;
        if (!parent || isSkippableParent(parent)) continue;

        const msg = parent.closest(MESSAGE_SELECTOR);
        if (!msg) continue;

        const v = target.nodeValue;
        if (looksLikeNonEmoteShortText(v)) continue;
        if (!textMayContainEmote(v)) continue;
        scheduleParse(msg);
        continue;
      }

      if (m.type !== 'childList') continue;

      if (activeTooltipImg && !activeTooltipImg.isConnected) hideTooltip();
      if (m.removedNodes?.length) queueRemovals(m.removedNodes);

      const addedNodes = m.addedNodes;
      if (!addedNodes || !addedNodes.length) continue;

      for (const added of addedNodes) {
        if (added.nodeType === Node.TEXT_NODE) {
          const parent = added.parentElement;
          if (!parent || isSkippableParent(parent)) continue;
          const msg = parent.closest(MESSAGE_SELECTOR);
          if (msg) scheduleParse(msg);
          continue;
        }

        if (added.nodeType !== Node.ELEMENT_NODE) continue;
        if (added.classList?.contains('bttv-emote')) continue;

        if (added.matches?.(MESSAGE_SELECTOR)) {
          scheduleParse(added);
        } else {
          added.querySelectorAll?.(MESSAGE_SELECTOR).forEach(scheduleParse);
          const closest = added.closest?.(MESSAGE_SELECTOR);
          if (closest) scheduleParse(closest);
        }
      }

      // Depois de agendar o parse, agenda um warmup em idle time.
      scheduleWarmup();
    }
  });

  chatObserver.observe(chat, {
    childList:             true,
    subtree:               true,
    characterData:         true,
    characterDataOldValue: true
  });
}

// ─── Restauração seletiva (só emotes de canal) ────────────────────────────────

function restoreChannelEmotesToText() {
  for (const img of channelInjectedImages) {
    const p = img.parentNode;
    if (!p) {
      channelInjectedImages.delete(img);
      injectedImages.delete(img);
      if (activeTooltipImg === img) hideTooltip();
      continue;
    }
    try {
      const textNode = document.createTextNode(img.alt || '');
      p.replaceChild(textNode, img);
    } catch (e) {
      console.debug('[Cinemotes] restore img falhou:', e?.message || e);
    }
    channelInjectedImages.delete(img);
    injectedImages.delete(img);
    if (activeTooltipImg === img) hideTooltip();
  }
}