'use strict';

// Temporary Firefox autocomplete diagnostics. No message text is logged.
const CINEMOTES_DIAGNOSTICS = false;
function cinemotesDebug(step, details = {}) {
  if (CINEMOTES_DIAGNOSTICS) console.log('[Cinemotes/Firefox]', step, details);
}
function cinemotesDescribeInput(el) {
  return el ? {
    tag: el.tagName,
    role: el.getAttribute?.('role'),
    label: el.getAttribute?.('aria-label'),
    editable: el.isContentEditable,
    connected: el.isConnected
  } : null;
}
cinemotesDebug('diagnostics-start', { version: 'autocomplete-debug-1', readyState: document.readyState });
window.addEventListener('error', event => {
  if ((event.filename || '').startsWith('moz-extension://')) {
    console.error('[Cinemotes/Firefox] script-error', event.message, event.filename, event.lineno, event.error?.stack);
  }
});
