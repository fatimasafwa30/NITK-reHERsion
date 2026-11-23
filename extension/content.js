/**
 * VeraTrace Chrome Extension — Content Script Bridge
 *
 * Facilitates safe, permissioned communication between the VeraTrace web application
 * and the Manifest V3 background service worker.
 */

// Announce presence immediately to the DOM and window
try {
  document.documentElement.setAttribute('data-veratrace-extension', '2.0.0');
} catch {
  // DOM not yet ready
}

window.postMessage({ type: 'VERATRACE_EXTENSION_READY', version: '2.0.0', status: 'connected' }, '*');

// Listen for messages from the web application
window.addEventListener('message', (event) => {
  // Only accept messages from same window
  if (event.source !== window || !event.data || typeof event.data !== 'object') return;

  if (event.data.type === 'VERATRACE_PING_EXTENSION') {
    window.postMessage({
      type: 'VERATRACE_PONG_EXTENSION',
      installed: true,
      version: '2.0.0',
      connected: true,
    }, '*');
    return;
  }

  if (event.data.type === 'VERATRACE_CAPTURE_CURRENT_TAB_REQUEST') {
    try {
      chrome.runtime.sendMessage({ action: 'CAPTURE_ACTIVE_TAB' }, (response) => {
        if (chrome.runtime.lastError) {
          window.postMessage({
            type: 'VERATRACE_CAPTURE_CURRENT_TAB_RESPONSE',
            success: false,
            error: chrome.runtime.lastError.message || 'Extension communication error.',
          }, '*');
        } else {
          window.postMessage({
            type: 'VERATRACE_CAPTURE_CURRENT_TAB_RESPONSE',
            ...response,
          }, '*');
        }
      });
    } catch (err) {
      window.postMessage({
        type: 'VERATRACE_CAPTURE_CURRENT_TAB_RESPONSE',
        success: false,
        error: err.message || 'Failed to dispatch capture request to extension background service.',
      }, '*');
    }
  }
});
