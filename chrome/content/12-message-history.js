'use strict';

// ─── Navegação com ↑ pelas últimas mensagens enviadas ─────────────────────────
//
// Intercepta Enter no input do chat (e cliques no botão "Chat") para capturar
// o texto antes do React limpá-lo. Depois, permite subir/descer pelo histórico
// com ↑ / ↓ quando o input está vazio.

const HIST_LIMIT = 50;
const HIST_KEY_NONE = -1; // estado "não navegando"

let histBuffer = [];        // mais recente primeiro
let histCursor = HIST_KEY_NONE;
let histCurrentDraft = '';  // rascunho que o usuário tinha antes de subir

// ─── Capturar mensagens enviadas ──────────────────────────────────────────────

function histPush(value) {
  const v = (value || '').trim();
  if (!v) return;
  // Evita duplicata consecutiva
  if (histBuffer[0] === v) return;
  histBuffer.unshift(v);
  if (histBuffer.length > HIST_LIMIT) histBuffer.length = HIST_LIMIT;
  histCursor = HIST_KEY_NONE;
  histCurrentDraft = '';
}

function histOnKeyDownCapture(e) {
  if (e.key !== 'Enter' || e.shiftKey) return;
  const input = e.target;
  if (!input) return;
  if (input !== acFindChatInput()) return;

  // Captura o valor ANTES do React processar o Enter.
  let value = '';
  if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
    value = input.value;
  } else if (input.isContentEditable) {
    value = input.textContent || '';
  }
  if (value.trim()) histPush(value);
}

function histOnSendButtonClick(e) {
  const btn = e.target?.closest?.('button');
  if (!btn) return;
  if (btn.textContent?.trim() !== 'Chat') return;
  const input = acFindChatInput();
  if (!input) return;
  let value = '';
  if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
    value = input.value;
  } else if (input.isContentEditable) {
    value = input.textContent || '';
  }
  if (value.trim()) histPush(value);
}

// ─── Navegação com setas ──────────────────────────────────────────────────────

function histSetInputValue(input, value) {
  if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
    const proto = input.tagName === 'TEXTAREA'
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const pos = value.length;
    input.setSelectionRange(pos, pos);
  } else if (input.isContentEditable) {
    input.textContent = value;
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
  }
}

function histGetInputValue(input) {
  if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') return input.value;
  if (input.isContentEditable) return input.textContent || '';
  return '';
}

function histOnArrowUp(e) {
  // Só quando o autocomplete NÃO está aberto (senão as setas vão pra lista).
  if (typeof acOpen !== 'undefined' && acOpen) return;

  const input = e.target;
  if (!input || input !== acFindChatInput()) return;

  const curValue = histGetInputValue(input);

  // Se o input tem texto que não é do histórico, guarda como "rascunho".
  if (histCursor === HIST_KEY_NONE) {
    // Só age se o cursor está no início OU o input está vazio
    if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
      if (input.selectionStart !== 0 && curValue.length > 0) return;
    }
    histCurrentDraft = curValue;
  }

  if (histBuffer.length === 0) return;
  if (histCursor + 1 >= histBuffer.length) return; // já no mais antigo

  e.preventDefault();
  e.stopImmediatePropagation();
  histCursor++;
  histSetInputValue(input, histBuffer[histCursor]);
}

function histOnArrowDown(e) {
  if (typeof acOpen !== 'undefined' && acOpen) return;
  if (histCursor === HIST_KEY_NONE) return;

  const input = e.target;
  if (!input || input !== acFindChatInput()) return;

  e.preventDefault();
  e.stopImmediatePropagation();
  histCursor--;

  if (histCursor === HIST_KEY_NONE) {
    histSetInputValue(input, histCurrentDraft || '');
  } else {
    histSetInputValue(input, histBuffer[histCursor]);
  }
}

// ─── Reset do cursor quando o usuário digita algo diferente ───────────────────

function histOnAnyKey(e) {
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') return;
  if (histCursor !== HIST_KEY_NONE) {
    histCursor = HIST_KEY_NONE;
    histCurrentDraft = '';
  }
}

// ─── Instalação ───────────────────────────────────────────────────────────────

function histInstall() {
  const input = acFindChatInput();
  if (!input) { setTimeout(histInstall, 500); return; }

  input.addEventListener('keydown', histOnKeyDownCapture, true);
  input.addEventListener('keydown', histOnAnyKey, true);
  input.addEventListener('keydown', histOnArrowUp, false);
  input.addEventListener('keydown', histOnArrowDown, false);

  document.addEventListener('click', histOnSendButtonClick, true);
}

setTimeout(histInstall, 700);